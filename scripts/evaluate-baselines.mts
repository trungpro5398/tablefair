/**
 * Held-out evaluation against three baselines, on live Qloo data (and Claude for one baseline).
 *
 *   node --conditions=react-server --import tsx scripts/evaluate-baselines.mts [groups=60] [seed=11]
 *
 * Each person has FOUR favourites. The pipeline and Claude see only three; the fourth is held out
 * and used afterwards to score every option, so the fair pick is not graded on the numbers it
 * optimised. Groups also carry real-world constraints (a time, a budget, a vegetarian, children,
 * a running-time limit), so rule breaks can be counted.
 *
 * Compared picks:
 *   fair     TableFair's pick (maximin over people with a preference)
 *   average  the highest mean match on the same shortlist
 *   popular  the most popular option Qloo returns for the same must-haves, no taste signal
 *   claude   the same Claude model, same brief, no Qloo; looked up in Qloo afterwards
 *
 * Only aggregate numbers are printed; no Qloo responses are written to disk.
 */
import { readFileSync } from "node:fs";

for (const l of (() => {
  try {
    return readFileSync(".env.local", "utf8").split("\n");
  } catch {
    return [];
  }
})()) {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { searchEntities, insights, qlooMode } = await import("../src/lib/qloo.ts");
const { DecisionSession } = await import("../src/lib/decide.ts");
const { askClaudeAlone } = await import("../src/lib/llm-only.ts");
const { percentiles } = await import("../src/lib/fairness.ts");
type Entity = import("../src/lib/types.ts").Entity;
type EntityType = import("../src/lib/types.ts").EntityType;
type Huddle = import("../src/lib/types.ts").Huddle;
type RankedCandidate = import("../src/lib/types.ts").RankedCandidate;

const GROUPS = Number(process.argv[2] ?? 60);
let seed = Number(process.argv[3] ?? 11);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pickN = <T,>(xs: T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);

const POOL: [string, EntityType][] = [
  ["Spirited Away", "urn:entity:movie"], ["Mad Max: Fury Road", "urn:entity:movie"], ["Parasite", "urn:entity:movie"],
  ["The Notebook", "urn:entity:movie"], ["John Wick", "urn:entity:movie"], ["Amélie", "urn:entity:movie"],
  ["Interstellar", "urn:entity:movie"], ["Mean Girls", "urn:entity:movie"], ["The Godfather", "urn:entity:movie"],
  ["Ratatouille", "urn:entity:movie"], ["The Bear", "urn:entity:tv_show"], ["Severance", "urn:entity:tv_show"],
  ["Ted Lasso", "urn:entity:tv_show"], ["Breaking Bad", "urn:entity:tv_show"], ["Bluey", "urn:entity:tv_show"],
  ["Friends", "urn:entity:tv_show"], ["Taylor Swift", "urn:entity:artist"], ["Radiohead", "urn:entity:artist"],
  ["Kendrick Lamar", "urn:entity:artist"], ["Norah Jones", "urn:entity:artist"], ["Daft Punk", "urn:entity:artist"],
  ["BTS", "urn:entity:artist"], ["Metallica", "urn:entity:artist"], ["Adele", "urn:entity:artist"],
];

if (qlooMode !== "live") console.warn("QLOO_API_KEY not set: running on the offline demo catalogue.");
if (!process.env.ANTHROPIC_API_KEY) console.warn("ANTHROPIC_API_KEY not set: the Claude baseline is skipped.");

const pool: Entity[] = [];
for (const [name, type] of POOL) {
  const [hit] = await searchEntities(name, [type], 1);
  if (hit) pool.push(hit);
}
console.log(`pool: ${pool.length} favourites resolved (${qlooMode})`);

/** next weekday at a time, Melbourne local, as the app stores it */
function nextAt(weekday: number, time: string) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7 || 7));
  return `${d.toISOString().slice(0, 10)}T${time}`;
}

const KEYS = ["fair", "average", "popular", "claude"] as const;
type Key = (typeof KEYS)[number];
type Row = {
  kind: string;
  /** held-out: least-matched person's percentile at each pick (people whose held-out scores barely differ excluded) */
  held: Partial<Record<Key, number>>;
  /** in-sample least-matched satisfaction, as the app computes it */
  inSample: Partial<Record<Key, number>>;
  claudeFound?: boolean;
  claudeBreaks?: number;
  claudeAnswered: boolean;
};
const rows: Row[] = [];
let claudeUsd = 0;
const kinds = ["place", "movie"] as const;

for (let g = 0; g < GROUPS; g++) {
  const kind = kinds[g % kinds.length];
  const n = 3 + Math.floor(rand() * 3);
  const people = Array.from({ length: n }, () => pickN(pool, 4));
  const r = rand();
  const huddle: Huddle = {
    id: `evalb-${g}`,
    title: "eval",
    kind,
    created_at: "",
    ...(kind === "place"
      ? {
          location: "Melbourne",
          when: nextAt(Math.floor(rand() * 7), rand() < 0.5 ? "12:30" : "19:00"),
          notes: r < 0.5 ? "Under $$$." : undefined,
        }
      : { kids: r < 0.25 ? true : undefined, max_minutes: r > 0.75 ? 120 : undefined }),
    members: people.map((favs, i) => ({
      id: `m${i}`,
      name: `P${i}`,
      joined_at: "",
      picks: favs.slice(0, 3),
      ...(kind === "place" && i === 0 && rand() < 0.33 ? { needs: ["vegetarian" as const] } : {}),
    })),
  };
  try {
    const s = new DecisionSession(huddle);
    const asked = askClaudeAlone(huddle).catch(() => null);
    s.llmAsk = asked;
    await s.generateCandidates({});
    await s.scoreMembers();
    if (!s.ranked.length || !s.majority) throw new Error("no candidates");
    const answer = await asked;
    claudeUsd += answer?.usd ?? 0;
    const picks: Partial<Record<Key, RankedCandidate>> = {
      fair: s.ranked[0],
      average: s.majority,
      ...(s.popular ? { popular: s.popular } : {}),
      ...(s.llmOnly?.candidate ? { claude: s.llmOnly.candidate } : {}),
    };
    // held-out favourite: score the whole shortlist (plus Claude's pick) for each person, as percentiles
    const ids = [...new Set([...s.shortlist.map((c) => c.entity_id), ...Object.values(picks).map((c) => c!.entity.entity_id)])];
    const held: Partial<Record<Key, number>> = {};
    const perPerson = await Promise.all(
      people.map(async (favs) => {
        const res = await insights({ type: s.type, signal: [favs[3].entity_id], candidates: ids, location: huddle.location, take: ids.length });
        const aff = new Map(res.map((e) => [e.entity_id, e.affinity]));
        const known = [...aff.values()].sort((a, b) => a - b);
        const median = known.length ? known[Math.floor(known.length / 2)] : 0;
        const values = ids.map((id) => aff.get(id) ?? median);
        const pct = percentiles(values);
        const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
        return { pct: new Map(ids.map((id, i) => [id, pct[i]])), decisive: spread >= 0.05 };
      }),
    );
    const judges = perPerson.filter((p) => p.decisive).length ? perPerson.filter((p) => p.decisive) : perPerson;
    for (const k of KEYS) {
      const c = picks[k];
      if (c) held[k] = Math.min(...judges.map((p) => p.pct.get(c.entity.entity_id) ?? 0.5));
    }
    rows.push({
      kind,
      held,
      inSample: Object.fromEntries(KEYS.filter((k) => picks[k]).map((k) => [k, picks[k]!.min_satisfaction])),
      claudeAnswered: !!answer,
      ...(answer ? { claudeFound: !!s.llmOnly?.found, claudeBreaks: s.llmOnly?.violations.length ?? 0 } : {}),
    });
    process.stdout.write(".");
  } catch (err) {
    process.stdout.write("x");
    console.error(`\ngroup ${g}: ${(err as Error).message}`);
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pp = (x: number) => `${(x * 100).toFixed(1)}`;
console.log(`\n\ngroups: ${rows.length} (${rows.filter((r) => r.kind === "place").length} dinner, ${rows.filter((r) => r.kind === "movie").length} movie)`);
for (const scope of ["all", "place", "movie"] as const) {
  const rs = rows.filter((r) => scope === "all" || r.kind === scope);
  // compare on the groups where every baseline exists, so the averages are like for like
  const full = rs.filter((r) => KEYS.every((k) => r.held[k] !== undefined));
  console.log(`\n[${scope}] held-out least-matched percentile, ${full.length} groups with all four picks:`);
  for (const k of KEYS) console.log(`  ${k.padEnd(8)} held-out ${pp(mean(full.map((r) => r.held[k]!)))}   in-sample ${pp(mean(full.map((r) => r.inSample[k]!)))}`);
  const beats = (a: Key, b: Key) => full.filter((r) => r.held[a]! > r.held[b]! + 1e-9).length;
  const ties = (a: Key, b: Key) => full.filter((r) => Math.abs(r.held[a]! - r.held[b]!) <= 1e-9).length;
  for (const b of ["average", "popular", "claude"] as const)
    console.log(`  fair vs ${b}: better in ${beats("fair", b)}, tied ${ties("fair", b)}, worse in ${beats(b, "fair")}`);
}
const asked = rows.filter((r) => r.claudeAnswered);
console.log(`\nClaude alone: answered ${asked.length}/${rows.length}; found in Qloo nearby ${asked.filter((r) => r.claudeFound).length}/${asked.length}`);
const found = asked.filter((r) => r.claudeFound);
console.log(`  breaks at least one hard rule (closed, budget, diet, age rating, running time): ${found.filter((r) => r.claudeBreaks! > 0).length}/${found.length} of those found`);
console.log(`  Claude cost for the baseline: $${claudeUsd.toFixed(3)}`);
