/**
 * The decision toolbox. Both the Claude agent (agent.ts) and the rule-based fallback drive
 * the same session object, so every number shown in the UI comes from Qloo + fairness.ts,
 * never from the language model.
 */
import "server-only";
import { groupCompatibility, rankFairly } from "./fairness";
import { highlights } from "./highlights";
import { MIN_STAY_MIN, clock, minutesLabel, openAt, parseWhen, whenLabel } from "./hours";
import {
  DINNER_EXCLUDE,
  DINNER_TAG,
  compareTastes,
  confidentMatch,
  findTags,
  insights,
  isDiningVenue,
  qlooMode,
  searchEntities,
} from "./qloo";
import {
  DIETS,
  KID_RATINGS,
  KIND_TO_TYPE,
  type Decision,
  type Entity,
  type Huddle,
  type InsightEntity,
  type Pick,
  type RankedCandidate,
} from "./types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export class ConstraintError extends Error {}

export type CandidateOptions = {
  tags?: string[];
  avoidTags?: string[];
  preferTags?: string[];
  /** neighbourhood to centre on, e.g. "Fitzroy" */
  area?: string;
  maxKm?: number;
  priceMax?: number;
  popularityMax?: number;
  yearMin?: number;
  take?: number;
};

const DEFAULT_MAX_KM = 15;
/** Each person brings their own top matches to the table, so the shortlist is not only compromises. */
export const CHAMPIONS_EACH = 3;

/** "Grandma likes it calm", "somewhere quiet": a vibe requirement enforced in code, not left to the agent. */
const CALM_ASK = /\b(calm|quiet|quieter|peaceful|relaxed|low[- ]key|not (too )?(loud|noisy))\b/i;
export const CALM_AVOID = [
  "urn:tag:ambience:qloo:loud",
  "urn:tag:ambience:qloo:noisy",
  "urn:tag:ambience:qloo:bustling",
  "urn:tag:ambience:qloo:lively",
  "urn:tag:ambience:place:lively",
];
const CALM_PREFER = ["urn:tag:ambience:qloo:calm", "urn:tag:ambience:qloo:quiet", "urn:tag:ambience:qloo:peaceful"];

/**
 * Ambience words an explanation may only use when the option's Qloo tags support them, so the
 * model cannot call a bustling venue "calm". Maps a word to the tag stem that must be present.
 */
const AMBIENCE_WORDS: Record<string, string> = {
  calm: "calm", calmer: "calm", quiet: "quiet", quieter: "quiet", peaceful: "peace", tranquil: "tranquil",
  serene: "seren", relaxed: "relax", relaxing: "relax", cozy: "coz", cosy: "coz", intimate: "intimate",
  romantic: "romantic", lively: "lively", bustling: "bustl", loud: "loud", noisy: "nois",
};

/** A Qloo tag name that really is the word asked for ("quieter" is not "Queer"). */
export function closeTagName(name: string, term: string) {
  const a = name.toLowerCase();
  const t = term.toLowerCase();
  return a === t || (Math.min(a.length, t.length) >= 4 && (a.startsWith(t) || t.startsWith(a)));
}

/** Qloo tag names on an option that support a calm/quiet request. */
function calmTags(e: InsightEntity) {
  return (e.tags ?? []).map((t) => t.name).filter((n) => /calm|quiet|peace|relax|intimate|coz|tranquil|seren/i.test(n));
}

export function ungroundedAmbience(text: string, tagNames: string[]) {
  const tags = tagNames.map((t) => t.toLowerCase());
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return [...new Set(words.filter((w) => AMBIENCE_WORDS[w] && !tags.some((t) => t.includes(AMBIENCE_WORDS[w]))))];
}

export type Step = { tool: string; summary: string };
export type OnStep = (step: Step) => void;

export class DecisionSession {
  shortlist: InsightEntity[] = [];
  perMember: Record<string, InsightEntity[]> = {};
  ranked: RankedCandidate[] = [];
  majority: RankedCandidate | null = null;
  /** the most popular option that meets the same must-haves, found with no taste data (the "without Qloo taste" baseline) */
  popular: RankedCandidate | null = null;
  private popularId: string | null = null;
  /** set by the agent: the same model's pick when asked without Qloo (the "Claude alone" baseline) */
  llmAsk?: Promise<{ name: string; reason: string; usd: number } | null>;
  llmOnly: Decision["llm_only"] = undefined;
  /** Qloo's entity for that pick; undefined until looked up, null when not found */
  private llmEntity: InsightEntity | null | undefined = undefined;
  filters: Record<string, string | number> = {};
  trace: Decision["trace"] = [];
  picks: Pick[] | null = null;
  tradeoffNote = "";
  requiredTags: string[] | null = null;
  /** tag ids from members' private "not tonight" requests (resolved once, never attributed) */
  privateTags: string[] | null = null;
  privateExclusions: string[] = [];
  /** the words themselves, for checking tag names and venue names locally */
  privateTerms: string[] = [];
  /** dietary needs applied tonight: from the must-haves and from members' private needs */
  dietNeeds: string[] = [];
  /** how many of those came only from members' private needs */
  privateDiets = 0;
  creditChangedPick = false;
  location?: string;
  changeNote = "";
  /** Claude token usage for this decision (set by the agent) */
  usage?: Decision["agent_usage"];

  constructor(
    readonly huddle: Huddle,
    private readonly onStep?: OnStep,
    /** follow-up requests from the group ("somewhere quieter", "no Japanese"), oldest first */
    readonly refinements: string[] = [],
    /** what the group was shown before this run, for "what changed" */
    readonly previous?: { entity_id: string; name: string },
  ) {}

  get type() {
    return KIND_TO_TYPE[this.huddle.kind];
  }

  /** Union of everyone's favourites, round-robin so no single member dominates the seed. */
  groupSignal(max = 15) {
    const lists = this.huddle.members.map((m) => m.picks.map((p) => p.entity_id));
    const out: string[] = [];
    for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++)
      for (const l of lists) if (l[i] && !out.includes(l[i])) out.push(l[i]);
    return out.slice(0, max);
  }

  log(tool: string, summary: string) {
    this.trace.push({ tool, summary });
    this.onStep?.({ tool, summary });
  }

  private tagCache = new Map<string, { id: string; name: string }[]>();

  async findTags(query: string) {
    const key = query.trim().toLowerCase();
    const hit = this.tagCache.get(key);
    if (hit) return hit;
    const tags = await findTags(query);
    this.tagCache.set(key, tags);
    const names = [...new Set(tags.map((t) => t.name))];
    const close = names.filter((n) => n.toLowerCase().includes(key));
    const shown = (close.length ? close : names).slice(0, 5);
    this.log("find_tags", `Looked up “${query}” in Qloo's tags: ${shown.join(", ") || "nothing matched"}`);
    return tags;
  }

  /** When calm was asked for and the fair pick has no calm-type tag: the best calm-tagged option within 10 points. */
  calmAlternative() {
    const top = this.ranked[0];
    if (!this.wantsCalm() || !top || calmTags(top.entity).length) return undefined;
    const alt = this.ranked.find((r) => calmTags(r.entity).length && r.min_satisfaction >= top.min_satisfaction - 0.1);
    return alt && { name: alt.entity.name, tags: calmTags(alt.entity), lowest_match: alt.min_satisfaction };
  }

  /** The must-haves or follow-ups ask for a calm or quiet place. */
  wantsCalm() {
    const quietWish = this.huddle.members.some((m) => /\b(loud|noisy|busy|crowded|lively)\b/i.test(m.avoid ?? ""));
    return quietWish || CALM_ASK.test([this.huddle.notes ?? "", ...this.refinements].join(" "));
  }

  private lastTop: { id: string; name: string } | undefined;
  /** distinct shortlists built in this session (a re-plan makes it 2+) */
  shortlistsTried = 0;
  /** a later shortlist leaned towards something (preference or area), i.e. a re-plan aimed at someone */
  targetedReplan = false;
  /** set by the agent runner: finalize then insists on one re-plan when someone is left behind */
  requireReplan = false;
  private lastRequest = "";
  /** True when the last group_candidates call repeated the previous request exactly. */
  repeated = false;

  async generateCandidates(opts: CandidateOptions = {}) {
    const request = JSON.stringify(opts, Object.keys(opts).sort());
    this.repeated = request === this.lastRequest && this.shortlist.length > 0 && this.picks === null;
    if (this.repeated) {
      this.log("group_candidates", "Same request as before, so the same shortlist is kept");
      return this.shortlist;
    }
    this.lastRequest = request;
    // Diet and budget requirements survive agent retries and API fallback.
    if (this.requiredTags === null) {
      const tags: string[] = [];
      // "Dinner spot" means restaurants, not bars or shops (live Qloo category tag).
      if (this.huddle.kind === "place" && DINNER_TAG) tags.push(DINNER_TAG);
      if (this.huddle.kind === "place") {
        // the group's must-haves, plus needs members added privately (never attributed)
        const fromNotes = DIETS.filter((d) => this.huddle.notes?.toLowerCase().includes(d));
        const fromMembers = DIETS.filter((d) => !fromNotes.includes(d) && this.huddle.members.some((m) => m.needs?.includes(d)));
        this.dietNeeds = [...fromNotes, ...fromMembers];
        this.privateDiets = fromMembers.length;
        for (const diet of this.dietNeeds) {
          const matches = await this.findTags(diet);
          // "one vegetarian" means a place WITH vegetarian options, not a vegetarian-only restaurant
          const named = (t: { name: string }) => [diet, `${diet}-friendly`, `${diet} friendly`].includes(t.name.toLowerCase());
          const tag = matches.find((t) => t.id.includes(":dietary_option:") && named(t)) ?? matches.find(named);
          if (!tag) throw new ConstraintError(`Could not verify the ${diet} filter. Please revise the must-haves before deciding.`);
          tags.push(tag.id);
        }
      }
      this.requiredTags = tags;
    }
    if (this.privateTags === null) {
      const tags: string[] = [];
      const names: string[] = [];
      const terms = [...new Set(this.huddle.members.map((m) => m.avoid?.trim().toLowerCase().replace(/^(no|not|avoid)\s+/, "")).filter(Boolean))] as string[];
      for (const term of terms) {
        if (/\b(loud|noisy|busy|crowded|lively)\b/.test(term)) continue; // handled as a calm request
        if (term.length < 3) continue;
        // every close variant ("Sushi", "Sushis" and their ids), since venues carry different ones
        const close = (await this.findTags(term)).filter((t) => closeTagName(t.name, term));
        tags.push(...close.map((t) => t.id));
        if (close.length) names.push(close[0].name); // name-only matches are listed once they actually exclude something
        this.privateTerms.push(term); // also matched against venue/title and tag names locally
      }
      this.privateTags = tags;
      this.privateExclusions = names;
    }
    const isPlace = this.huddle.kind === "place";
    const calm = isPlace && this.wantsCalm();
    const tags = [...new Set([...this.requiredTags, ...(opts.tags ?? [])])];
    const avoid = [
      ...new Set([...(isPlace ? DINNER_EXCLUDE : []), ...(calm ? CALM_AVOID : []), ...this.privateTags, ...(opts.avoidTags ?? [])]),
    ].filter((t) => !tags.includes(t));
    const prefer = [...new Set([...(calm ? CALM_PREFER : []), ...(opts.preferTags ?? [])])];
    const budget = isPlace ? parsePrice(this.huddle.notes) : undefined;
    const priceMax = budget === undefined ? opts.priceMax : Math.min(budget, opts.priceMax ?? budget);
    // 30 options gives each person's percentile a finer, more stable scale
    const take = Math.min(Math.max(opts.take ?? 30, 6), 40);
    const location = isPlace && opts.area ? `${opts.area}, ${this.huddle.location ?? ""}`.replace(/, $/, "") : this.huddle.location;
    const maxKm = isPlace ? (opts.maxKm ?? DEFAULT_MAX_KM) : undefined;
    // the group said when they're going: Qloo keeps venues open that day, we check the time locally
    const when = isPlace && parseWhen(this.huddle.when) ? this.huddle.when : undefined;
    const closedThen = (e: InsightEntity) => !!when && openAt(e.hours, when)?.open === false;
    // movies / TV: children watching means kid-friendly age ratings only (unrated titles are left out)
    const kids = !isPlace && !!this.huddle.kids;
    const maxMinutes = this.huddle.kind === "movie" ? this.huddle.max_minutes : undefined;
    const unsuitable = (e: InsightEntity) =>
      (kids && !KID_RATINGS.includes(e.content_rating ?? "")) || (!!maxMinutes && !!e.runtime && e.runtime > maxMinutes);

    const query = (signal: string[], n: number) =>
      insights({
        type: this.type,
        signal,
        popular: !signal.length,
        location,
        tags,
        avoidTags: avoid,
        preferTags: prefer,
        priceMax,
        popularityMax: opts.popularityMax,
        yearMin: opts.yearMin,
        openOn: when ? parseWhen(when)!.day : undefined,
        contentRatings: kids ? KID_RATINGS : undefined,
        // ask for more so the venue-type and distance filters still leave a full shortlist
        take: isPlace ? Math.min(n + 20, 50) : n,
      });
    const members = this.huddle.members.filter((m) => m.picks.length);
    const [raw, popularRaw, ...own] = await Promise.all([
      query(this.groupSignal(), take),
      // the same must-haves with no taste signal: what a listings app would put first
      query([], 10),
      ...(members.length > 1 ? members.map((m) => query(m.picks.map((p) => p.entity_id), CHAMPIONS_EACH * 2)) : []),
    ]);
    const avoidSet = new Set(avoid);
    const usable = (list: InsightEntity[]) =>
      (isPlace ? list.filter(isDiningVenue) : list).filter(
        (e) =>
          !closedThen(e) &&
          !unsuitable(e) &&
          !e.tags?.some((t) => avoidSet.has(t.id) || (calm && /^(loud|noisy|bustling|lively)$/i.test(t.name))) &&
          !this.privateTerms.some((w) => {
            const byName = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "")}s?\\b`, "i").test(e.name);
            if (byName && !this.privateExclusions.some((n) => n.toLowerCase() === w)) this.privateExclusions.push(w);
            return byName || e.tags?.some((t) => closeTagName(t.name, w));
          }),
      );
    const dining = usable(raw);
    const droppedClosed = (isPlace ? raw.filter(isDiningVenue) : raw).filter(closedThen).length;
    const droppedLong = raw.filter((e) => !!maxMinutes && !!e.runtime && e.runtime > maxMinutes).length;
    const droppedNonDining = isPlace ? raw.length - dining.length - droppedClosed : 0;
    // everyone's own top matches go on the table first, then the group's shared-taste options
    const championOf = new Map<string, string[]>();
    const tops: InsightEntity[] = [];
    own.forEach((list, i) => {
      for (const e of usable(list).slice(0, CHAMPIONS_EACH)) {
        championOf.set(e.entity_id, [...(championOf.get(e.entity_id) ?? []), members[i].name]);
        if (!tops.some((t) => t.entity_id === e.entity_id)) tops.push(e);
      }
    });
    const merged = [...tops, ...dining.filter((e) => !championOf.has(e.entity_id))].map((e) =>
      championOf.has(e.entity_id) ? { ...e, champion_of: championOf.get(e.entity_id) } : e,
    );
    const popularPick = usable(popularRaw)[0];
    const pool = popularPick && !merged.some((e) => e.entity_id === popularPick.entity_id) ? [...merged, popularPick] : merged;
    const { kept, droppedFar } = maxKm ? withinRadius(pool, maxKm) : { kept: pool, droppedFar: 0 };
    const next = kept.slice(0, take);
    // the popular option is scored with everyone else, so its matches are on the same scale
    const keptPopular = popularPick && kept.find((e) => e.entity_id === popularPick.entity_id);
    if (keptPopular && !next.includes(keptPopular)) next.push(keptPopular);
    const sameList =
      this.picks === null &&
      this.ranked.length > 0 &&
      next.length === this.shortlist.length &&
      next.every((e, i) => e.entity_id === this.shortlist[i].entity_id);
    if (sameList) {
      // different arguments, same options: keep the existing scores instead of re-scoring everyone
      this.repeated = true;
      this.log("group_candidates", "This change gave the same shortlist, so the scores are kept");
      return this.shortlist;
    }
    this.shortlist = next;
    this.popularId = keptPopular ? keptPopular.entity_id : null;
    this.shortlistsTried += 1;
    if (this.shortlistsTried > 1 && (opts.preferTags?.length || opts.area)) this.targetedReplan = true;
    const brought = this.shortlist.filter((e) => e.champion_of).length;
    this.location = location;
    this.filters = {
      type: this.type,
      ...(location && isPlace ? { location } : {}),
      ...(tags.length ? { tags: tags.join(",") } : {}),
      ...(avoid.length ? { avoid_tags: avoid.join(",") } : {}),
      ...(prefer.length ? { prefer_tags: prefer.join(",") } : {}),
      ...(priceMax ? { price_level_max: priceMax } : {}),
      ...(maxKm ? { max_km: maxKm } : {}),
      ...(when ? { open_at: when } : {}),
      ...(kids ? { content_rating: KID_RATINGS.join(",") } : {}),
      ...(maxMinutes ? { max_minutes: maxMinutes } : {}),
      ...(opts.popularityMax ? { popularity_max: opts.popularityMax } : {}),
      ...(opts.yearMin ? { release_year_min: opts.yearMin } : {}),
    };
    this.ranked = [];
    this.perMember = {};
    this.majority = null;
    this.popular = null;
    this.picks = null;
    this.tradeoffNote = "";
    this.changeNote = "";
    const label = (ids: string[]) => [...new Set(ids.map((t) => t.split(":").pop()?.replace(/[-_]/g, " ")))].join(", ");
    const noun = isPlace ? "restaurants" : this.huddle.kind === "movie" ? "films" : "shows";
    const musts = tags.filter((t) => t !== DINNER_TAG);
    const leaning = prefer.filter((t) => !(calm && CALM_PREFER.includes(t)));
    const parts = [
      `${this.shortlist.length} ${noun} on the table` +
        (brought ? `: ${brought} brought by one person's own taste, the rest suit the whole group` : "") +
        (opts.area ? `, around ${opts.area}` : "") +
        ".",
      musts.length ? `Must be ${label(musts)}.` : "",
      priceMax ? `Up to ${"$".repeat(priceMax)}.` : "",
      calm ? "Loud, bustling and lively places ruled out." : "",
      when
        ? `Only places Qloo lists as open ${whenLabel(when)} with at least ${MIN_STAY_MIN / 60} hour to spare` +
          (droppedClosed ? `; ${droppedClosed} closed or closing too soon were skipped.` : ".")
        : "",
      this.privateDiets ? `${this.privateDiets === 1 ? "A dietary need" : `${this.privateDiets} dietary needs`} added privately ${this.privateDiets === 1 ? "is" : "are"} covered too.` : "",
      kids ? "Children are watching, so only titles rated G or PG (or the TV equivalents)." : "",
      maxMinutes
        ? `Films up to ${Math.floor(maxMinutes / 60)} h${maxMinutes % 60 ? ` ${maxMinutes % 60} min` : ""}` + (droppedLong ? `; ${droppedLong} longer ones skipped.` : ".")
        : "",
      this.privateExclusions.length ? `Private "not tonight" requests applied: no ${this.privateExclusions.join(", no ")}.` : "",
      opts.avoidTags?.length ? `Avoiding ${label(opts.avoidTags)}.` : "",
      leaning.length ? `Leaning towards ${label(leaning)}.` : "",
      opts.popularityMax ? "Less mainstream picks." : "",
      opts.yearMin ? `Released from ${opts.yearMin}.` : "",
      droppedNonDining || droppedFar
        ? `Skipped ${[droppedNonDining && `${droppedNonDining} bars, cafés and shops`, droppedFar && `${droppedFar} places over ${maxKm} km away`].filter(Boolean).join(" and ")}.`
        : "",
    ];
    this.log("group_candidates", parts.filter(Boolean).join(" "));
    return this.shortlist;
  }

  /** Find the "Claude alone" pick in Qloo and list the hard rules it breaks, from Qloo's own data. */
  private async resolveLlmOnly() {
    if (!this.llmAsk || this.llmEntity !== undefined) return;
    const answer = await Promise.race([this.llmAsk, new Promise<null>((r) => setTimeout(() => r(null), 15_000))]).catch(() => null);
    if (!answer) {
      this.llmEntity = null;
      return;
    }
    const isPlace = this.huddle.kind === "place";
    const query = isPlace && this.huddle.location ? `${answer.name} ${this.huddle.location}` : answer.name;
    const hits = await searchEntities(query, [this.type], 6).catch(() => [] as Entity[]);
    // same name, and for places in the same area as tonight's shortlist (Qloo lists same-name venues worldwide)
    const pts = this.shortlist.filter((c) => c.lat !== undefined && c.lon !== undefined);
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const near = (e: Entity) => {
      if (!isPlace || pts.length < 3 || e.lat === undefined || e.lon === undefined) return true;
      const cLat = median(pts.map((p) => p.lat!));
      const cLon = median(pts.map((p) => p.lon!));
      return Math.hypot((e.lat - cLat) * 111.2, (e.lon - cLon) * 111.2 * Math.cos((cLat * Math.PI) / 180)) <= 40;
    };
    const match = (list: Entity[]) => list.find((h) => confidentMatch(answer.name, h.name) && near(h));
    // the city in the query helps Qloo rank the right venue; fall back to the name alone
    const hit = match(hits) ?? (query !== answer.name ? match(await searchEntities(answer.name, [this.type], 6).catch(() => [] as Entity[])) : undefined);
    this.llmEntity = hit ? { ...hit, affinity: 0, explain: {} } : null;
    this.llmOnly = { name: hit?.name ?? answer.name, reason: answer.reason, found: !!hit, violations: hit ? this.hardRuleBreaks(hit) : [] };
  }

  /** The group's hard rules an option breaks, checked against Qloo's data for it. */
  hardRuleBreaks(e: Entity): string[] {
    const out: string[] = [];
    const tagIds = new Set((e.tags ?? []).map((t) => t.id));
    if (this.huddle.kind === "place") {
      if (!isDiningVenue(e)) out.push("Qloo lists it as a bar, café or shop, not a restaurant");
      const when = parseWhen(this.huddle.when) ? this.huddle.when : undefined;
      if (when && openAt(e.hours, when)?.open === false) out.push(`closed ${whenLabel(when)}`);
      const price = e.meta?.match(/\$+/)?.[0].length;
      const max = Number(this.filters.price_level_max) || parsePrice(this.huddle.notes);
      if (price && max && price > max) out.push(`over budget (${"$".repeat(price)})`);
      (this.requiredTags ?? [])
        .filter((t) => t !== DINNER_TAG)
        .forEach((t, i) => {
          if (!tagIds.has(t)) out.push(`not listed by Qloo as ${this.dietNeeds[i] ?? "meeting a dietary need"}`);
        });
      if (this.wantsCalm() && e.tags?.some((t) => CALM_AVOID.includes(t.id) || /^(loud|noisy|bustling|lively)$/i.test(t.name)))
        out.push("tagged loud or lively, but calm was asked for");
    } else {
      if (this.huddle.kids && !KID_RATINGS.includes(e.content_rating ?? ""))
        out.push(e.content_rating ? `rated ${e.content_rating}, with children watching` : "no kid-friendly age rating");
      if (this.huddle.max_minutes && e.runtime && e.runtime > this.huddle.max_minutes)
        out.push(`runs ${minutesLabel(e.runtime)}, longer than you have`);
    }
    const vetoed =
      (this.privateTags ?? []).some((t) => tagIds.has(t)) ||
      this.privateTerms.some(
        (w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "")}s?\\b`, "i").test(e.name) || e.tags?.some((t) => closeTagName(t.name, w)),
      );
    if (vetoed) out.push("breaks a private “not tonight” request");
    return out;
  }

  async scoreMembers() {
    if (!this.shortlist.length) return { ranked: [], majority: null };
    if (this.repeated && this.ranked.length) return { ranked: this.ranked, majority: this.majority };
    await this.resolveLlmOnly();
    // Claude-alone's pick is scored in the same per-person call, but never competes for tonight's pick
    const extra = this.llmEntity && !this.shortlist.some((c) => c.entity_id === this.llmEntity!.entity_id) ? this.llmEntity : null;
    const ids = [...this.shortlist.map((c) => c.entity_id), ...(extra ? [extra.entity_id] : [])];
    const results = await Promise.all(
      this.huddle.members.map((m) =>
        insights({
          type: this.type,
          signal: m.picks.map((p) => p.entity_id),
          candidates: ids,
          location: this.location ?? this.huddle.location,
          take: ids.length,
        }).then((r) => [m.id, r] as const),
      ),
    );
    this.perMember = Object.fromEntries(results);
    const credits = Object.fromEntries(
      (this.huddle.carried ?? []).flatMap((c) => {
        const m = this.huddle.members.find((x) => x.name === c.member_name);
        return m ? [[m.id, c.credit]] : [];
      }),
    );
    const { ranked, majority } = rankFairly(this.shortlist, this.huddle.members, this.perMember, credits);
    // did last time's credit actually change tonight's pick?
    this.creditChangedPick =
      Object.keys(credits).length > 0 &&
      rankFairly(this.shortlist, this.huddle.members, this.perMember).ranked[0]?.entity.entity_id !== ranked[0]?.entity.entity_id;
    const before = this.lastTop;
    this.ranked = ranked;
    this.majority = majority;
    this.popular = ranked.find((r) => r.entity.entity_id === this.popularId) ?? null;
    if (this.llmOnly && this.llmEntity) {
      const id = this.llmEntity.entity_id;
      this.llmOnly.candidate =
        ranked.find((r) => r.entity.entity_id === id) ??
        rankFairly([...this.shortlist, this.llmEntity], this.huddle.members, this.perMember, credits).ranked.find((r) => r.entity.entity_id === id);
    }
    const top = ranked[0];
    const popular = this.popular;
    const llm = this.llmOnly;
    this.lastTop = top && { id: top.entity.entity_id, name: top.entity.name };
    const sameTop = before && top && before.id === top.entity.entity_id;
    const moved = before && !sameTop ? ranked.find((r) => r.entity.entity_id === before.id) : undefined;
    this.log(
      "score_for_members",
      `Scored all ${this.shortlist.length} for each of the ${this.huddle.members.length} people. Fairest: ${top?.entity.name} (nobody with a clear preference below ${pct(top?.min_satisfaction ?? 0)}).` +
        (majority && top && majority.entity.entity_id !== top.entity.entity_id
          ? ` A simple average would pick ${majority.entity.name}, where someone with a clear preference drops to ${pct(majority.min_satisfaction)}.`
          : " A simple average would pick the same.") +
        (popular && top && popular.entity.entity_id !== top.entity.entity_id
          ? ` Without taste data, the most popular option that fits is ${popular.entity.name}, where someone with a clear preference is at ${pct(popular.min_satisfaction)}.`
          : popular
            ? " It is also the most popular option that fits."
            : "") +
        (llm
          ? ` Asked without Qloo, Claude suggested ${llm.name}` +
            (llm.candidate ? `, where someone with a clear preference is at ${pct(llm.candidate.min_satisfaction)}` : ", which Qloo could not find nearby") +
            (llm.violations.length ? ` (${llm.violations.join("; ")})` : "") +
            "."
          : "") +
        (sameTop ? " The fairest option stayed the same." : "") +
        (before && !sameTop ? ` The previous favourite, ${before.name}, ${moved ? `now has a lowest match of ${pct(moved.min_satisfaction)}` : "is no longer on the list"}.` : ""),
    );
    return { ranked, majority };
  }

  /** Where two members' tastes agree/disagree over tonight's shortlist. */
  async compareMembers(a: string, b: string) {
    const find = (n: string) => this.huddle.members.find((m) => m.name.toLowerCase() === n.toLowerCase());
    const ma = find(a);
    const mb = find(b);
    if (!ma || !mb) return { error: `Unknown member. Members: ${this.huddle.members.map((m) => m.name).join(", ")}` };
    const rows = this.ranked.map((r) => ({
      name: r.entity.name,
      a: r.scores.find((s) => s.member_id === ma.id)!.satisfaction,
      b: r.scores.find((s) => s.member_id === mb.id)!.satisfaction,
    }));
    const both = rows.filter((r) => r.a >= 0.6 && r.b >= 0.6).map((r) => r.name);
    const split = [...rows].sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).slice(0, 3);
    const tagsA = new Set(ma.picks.flatMap((p) => p.tags?.map((t) => t.name) ?? []));
    const sharedTags = [...new Set(mb.picks.flatMap((p) => p.tags?.map((t) => t.name) ?? []))].filter((t) =>
      tagsA.has(t),
    );
    let analysis: unknown = null;
    if (qlooMode === "live") {
      try {
        analysis = await compareTastes(ma.picks.map((p) => p.entity_id), mb.picks.map((p) => p.entity_id), this.type);
        this.log("compare_tastes", `Qloo Analysis Compare: shared ${(analysis as { tag: string }[]).map((t) => t.tag).join(", ") || "no strong tags"}`);
      } catch {
        this.log("compare_tastes", "Qloo comparison unavailable; using the scored shortlist");
      }
    }
    this.log("compare_tastes", `${ma.name} vs ${mb.name}: ${both.length} options both like`);
    return {
      qloo_analysis: analysis,
      both_like: both.slice(0, 5),
      biggest_disagreements: split.map((r) => `${r.name} (${ma.name} ${pct(r.a)} vs ${mb.name} ${pct(r.b)})`),
      shared_taste_tags: sharedTags.slice(0, 8),
    };
  }

  /** Compact table for the model: real numbers only. */
  rankingTable(n = 6) {
    return {
      fair_ranking: this.ranked.slice(0, n).map((r) => ({
        entity_id: r.entity.entity_id,
        name: r.entity.name,
        meta: r.entity.meta,
        ...(r.entity.runtime && !isPlaceType(r.entity.type) ? { runtime_minutes: r.entity.runtime } : {}),
        ...(r.entity.content_rating ? { age_rating: r.entity.content_rating } : {}),
        ...(this.filters.open_at && r.entity.hours ? { open_until: openUntil(r.entity, String(this.filters.open_at)) } : {}),
        known_for: highlights(r.entity, 5),
        ...(r.entity.champion_of ? { brought_by: r.entity.champion_of } : {}),
        ...(this.wantsCalm() ? { tags_that_fit_the_calm_request: calmTags(r.entity) } : {}),
        lowest_match_among_people_with_a_clear_preference: pct(r.min_satisfaction),
        ...cared(r),
        average: pct(r.mean_satisfaction),
        per_member: r.scores.map((s) => ({
          member: s.member_name,
          taste_match: pct(s.satisfaction),
          ...(s.flexible ? { flexible_tonight: true } : {}),
          driven_by_their_favourites: s.because.map((b) => b.name),
        })),
      })),
      members: this.huddle.members.map((m) => {
        const mine = (r: RankedCandidate) => r.scores.find((x) => x.member_id === m.id);
        const best = [...this.ranked].sort((a, b) => (mine(b)?.percentile ?? 0) - (mine(a)?.percentile ?? 0))[0];
        return { member: m.name, flexible_tonight: !!mine(this.ranked[0] ?? best)?.flexible, own_top_match: best?.entity.name };
      }),
      ...(this.calmAlternative() ? { calm_request_note: { pick_has_no_calm_tag: true, closest_calm_option: this.calmAlternative() } } : {}),
      ...(this.huddle.carried?.length ? { last_time_credit_changed_the_pick: this.creditChangedPick } : {}),
      average_vote_would_pick: this.majority && {
        name: this.majority.entity.name,
        lowest_match_among_people_with_a_clear_preference: pct(this.majority.min_satisfaction),
        lowest_match_member: [...this.majority.scores].sort((a, b) => a.satisfaction - b.satisfaction)[0]?.member_name,
      },
      ...(this.llmOnly
        ? {
            claude_without_qloo_suggested: {
              name: this.llmOnly.name,
              found_in_qloo: this.llmOnly.found,
              ...(this.llmOnly.candidate ? { lowest_match_among_people_with_a_clear_preference: pct(this.llmOnly.candidate.min_satisfaction) } : {}),
              breaks: this.llmOnly.violations,
            },
          }
        : {}),
      most_popular_option_without_taste_data: this.popular && {
        name: this.popular.entity.name,
        lowest_match_among_people_with_a_clear_preference: pct(this.popular.min_satisfaction),
      },
    };
  }

  groupMessage = "";

  finalize(picks: Pick[], tradeoffNote: string, changeNote = "", groupMessage = "") {
    const expected = this.ranked.slice(0, 3);
    if (!expected.length || picks.length !== expected.length || picks.some((p, i) => p.entity_id !== expected[i].entity.entity_id))
      return "error: use exactly the top 3 (or all available) entity_ids in fair ranking order";
    // notes may mention the group's own request ("the calm request"), so words from the brief are allowed there
    const brief = [this.huddle.notes ?? "", ...this.refinements].join(" ").toLowerCase();
    const allTags = [...expected, ...(this.majority ? [this.majority] : [])].flatMap((c) => (c.entity.tags ?? []).map((t) => t.name));
    const notes = [tradeoffNote, changeNote, groupMessage].join(" ");
    const said = [notes, ...picks.flatMap((p) => [p.headline, p.why_group, ...p.per_member.map((m) => m.reason)])].join(" ");
    const jargon = said.match(/\b(known_for|taste_match|flexible_tonight|own_top_match|brought_by|protected_person|top_match_for|fair_ranking)\b/);
    if (jargon) return `error: "${jargon[0]}" is an internal field name; say it in plain words for the group.`;
    const predicts = said.match(/\b(loves?|adores?|hates?|will (love|enjoy|hate))\b/i);
    if (predicts)
      return `error: "${predicts[0]}" predicts how a person will feel. Qloo describes what fans of their favourites tend to like; say that instead.`;
    const badNotes = ungroundedAmbience(notes, allTags).filter((w) => !brief.includes(w));
    if (badNotes.length)
      return `error: the notes call something "${badNotes.join('", "')}", but no option's Qloo tags say so. Rewrite without that claim.`;
    const floor = expected[0].min_satisfaction;
    if (this.requireReplan && floor < 0.5 && !this.targetedReplan) {
      const who = expected[0].scores.filter((x) => !x.flexible).sort((a, b) => a.satisfaction - b.satisfaction)[0];
      return `error: ${who?.member_name ?? "someone"} is at ${pct(floor)} on the fairest option. Re-plan once for them first (find_tags for something their favourites suggest, group_candidates with prefer_tag_ids and a reason naming them, then score_for_members), then finalize on whichever shortlist protects them better.`;
    }
    // "your best fit" is only true for the person whose #1 on tonight's list this option is
    const ownTop = (memberName: string) => {
      const m = this.huddle.members.find((x) => x.name === memberName);
      if (!m) return undefined;
      const mine = (r: RankedCandidate) => r.scores.find((s) => s.member_id === m.id)?.percentile ?? 0;
      return [...this.ranked].sort((a, b) => mine(b) - mine(a))[0]?.entity.entity_id;
    };
    for (const [i, p] of picks.entries())
      for (const m of p.per_member)
        if (/\b(your (best|top|favou?rite|#1|number one)|best (fit|match) for you)\b/i.test(m.reason) && ownTop(m.member_name) !== expected[i].entity.entity_id)
          return `error: for ${m.member_name}, ${expected[i].entity.name} is not their #1 on tonight's list (see members.own_top_match), so don't call it their best or top. Use their rank or taste match instead.`;
    // third-person claims ("Ben's best match", "their top pick", "best match for Ben") must be true for the person named
    const BEST = "(best|top|favou?rite|#1|number one)";
    for (const [i, p] of picks.entries()) {
      const optionId = expected[i].entity.entity_id;
      const sentences = [p.headline, p.why_group, ...p.per_member.map((m) => m.reason)].join(". ").split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const claims =
          new RegExp(`\\btheir ${BEST}\\b`, "i").test(sentence) ||
          new RegExp(`(?<!group|everyone|list)'s ${BEST}\\b`, "i").test(sentence) ||
          new RegExp(`\\b${BEST} (fit|match|option|pick) for\\b`, "i").test(sentence);
        if (!claims) continue;
        const named = this.huddle.members.filter((m) => sentence.includes(m.name));
        const wrong = named.length ? named.filter((m) => ownTop(m.name) !== optionId) : [{ name: "the person meant" }];
        if (wrong.length)
          return `error: "${sentence.trim().slice(0, 120)}" calls ${expected[i].entity.name} ${wrong.map((w) => w.name).join(", ")}'s best or top option, but it isn't their #1 on tonight's list (see members.own_top_match). Use their rank or taste match instead.`;
      }
    }
    for (const [i, p] of picks.entries()) {
      const tags = (expected[i].entity.tags ?? []).map((t) => t.name);
      const text = [p.headline, p.why_group, ...p.per_member.map((m) => m.reason)].join(" ");
      const bad = ungroundedAmbience(text, tags);
      if (bad.length)
        return `error: ${expected[i].entity.name} is described as "${bad.join('", "')}", but its Qloo tags do not say so (it is known for: ${highlights(expected[i].entity, 6).join(", ") || "nothing specific"}). Rewrite without that claim.`;
    }
    this.picks = picks;
    this.tradeoffNote = tradeoffNote;
    this.changeNote = changeNote;
    this.groupMessage = groupMessage;
    this.log("finalize", `${this.picks.length} picks`);
    return "saved";
  }

  toDecision(agent: "claude" | "rules"): Decision {
    const picks = this.picks?.length ? this.picks : rulePicks(this.ranked);
    return {
      created_at: new Date().toISOString(),
      mode: { qloo: qlooMode, agent },
      filters: this.filters,
      when: this.filters.open_at ? String(this.filters.open_at) : undefined,
      ranked: withPersonalTops(this.ranked, this.huddle.members.map((m) => m.id)),
      majority: this.majority,
      popular: this.popular,
      llm_only: this.llmOnly,
      picks,
      tradeoff_note: this.tradeoffNote || ruleTradeoff(this.ranked[0], this.majority),
      trace: this.trace,
      refinements: this.refinements.length ? this.refinements : undefined,
      previous_pick: this.previous?.name,
      change_note: this.refinements.length ? this.changeNote || ruleChange(this.previous, this.ranked[0]) : undefined,
      agent_usage: this.usage,
      group_message: this.groupMessage || ruleMessage(this.huddle, this.ranked[0]),
      compatibility: groupCompatibility(this.ranked),
      shortlist_size: this.ranked.length,
      calm_alternative: this.calmAlternative(),
      private_exclusions: this.privateExclusions.length ? this.privateExclusions : undefined,
      diet_needs: this.dietNeeds.length ? this.dietNeeds : undefined,
      private_diets: this.privateDiets || undefined,
      carried_over: this.huddle.carried?.length ? this.huddle.carried : undefined,
      carried_changed_pick: this.huddle.carried?.length ? this.creditChangedPick : undefined,
      personal_top: Object.fromEntries(
        this.huddle.members.map((m) => {
          const best = [...this.ranked].sort(
            (a, b) =>
              (b.scores.find((s) => s.member_id === m.id)?.percentile ?? 0) - (a.scores.find((s) => s.member_id === m.id)?.percentile ?? 0),
          )[0];
          return [m.id, best?.entity.name ?? ""];
        }),
      ),
    };
  }
}

const isPlaceType = (t: string) => t === "urn:entity:place";

/** Top 10 plus each person's own #1, so every option the page names is on the page. */
function withPersonalTops(ranked: RankedCandidate[], memberIds: string[]) {
  const out = ranked.slice(0, 10);
  for (const id of memberIds) {
    const mine = (r: RankedCandidate) => r.scores.find((s) => s.member_id === id)?.percentile ?? 0;
    const best = [...ranked].sort((a, b) => mine(b) - mine(a))[0];
    if (best && !out.includes(best)) out.push(best);
  }
  return out;
}

/** Lowest match among members who are not flexible tonight: the person the pick really protects. */
function cared(r: RankedCandidate) {
  const low = r.scores.filter((s) => !s.flexible).sort((a, b) => a.satisfaction - b.satisfaction)[0];
  return low ? { protected_person: `${low.member_name} ${pct(low.satisfaction)}` } : {};
}

// ---------- rule-based explanations (no LLM) ----------
function rulePicks(ranked: RankedCandidate[]): Pick[] {
  return ranked.slice(0, 3).map((r) => ({
    entity_id: r.entity.entity_id,
    headline: r.entity.name,
    why_group: `Nobody with a preference tonight is below ${pct(r.min_satisfaction)}; group average ${pct(r.mean_satisfaction)}.`,
    per_member: r.scores.map((s) => ({
      member_name: s.member_name,
      reason: s.flexible
        ? `Qloo sees only small differences between tonight's options for your taste, so you're flexible tonight.`
        : s.because.length
          ? `${pct(s.satisfaction)} taste match for you, driven mostly by ${s.because.map((b) => b.name).join(" and ")}.`
          : `A ${pct(s.satisfaction)} taste match for you, from your overall taste.`,
    })),
  }));
}

function ruleTradeoff(fair?: RankedCandidate, majority?: RankedCandidate | null) {
  if (!fair || !majority) return "";
  if (fair.entity.entity_id === majority.entity.entity_id)
    return `${fair.entity.name} is both the fairest option and the one a simple average would pick.`;
  const loser = [...majority.scores].filter((s) => !s.flexible).sort((a, b) => a.satisfaction - b.satisfaction)[0] ?? majority.scores[0];
  return `A simple average would pick ${majority.entity.name}, but ${loser.member_name}'s taste match there is only ${pct(loser.satisfaction)}. ${fair.entity.name} keeps everyone with a preference at ${pct(fair.min_satisfaction)} or higher.`;
}

export type RefineContext = { refinements?: string[]; previous?: { entity_id: string; name: string } };

export async function decideWithRules(huddle: Huddle, onStep?: OnStep, why?: string, ctx: RefineContext = {}): Promise<Decision> {
  const s = new DecisionSession(huddle, onStep, ctx.refinements, ctx.previous);
  if (why) s.log("agent", why);
  const opts = ctx.refinements?.length ? await refinementsByRules(s, ctx.refinements) : {};
  await s.generateCandidates({ priceMax: parsePrice(huddle.notes), ...opts });
  await s.scoreMembers();
  return s.toDecision("rules");
}

/** Without the LLM: "no X" → avoid tag, "closer"/"near X" → radius/area, "cheaper" → budget, anything else → preference. */
export async function refinementsByRules(s: DecisionSession, refinements: string[]): Promise<CandidateOptions> {
  const opts: CandidateOptions = { avoidTags: [], preferTags: [] };
  for (const clause of refinements.flatMap((r) => r.split(/,|;|\band\b/i)).map((c) => c.trim()).filter(Boolean)) {
    const lower = clause.toLowerCase();
    const neg = lower.match(/^(?:no|not|avoid|without|skip|nothing)\s+(.+)/);
    const near = lower.match(/\b(?:near|in|around)\s+([a-z][a-z .'-]+)$/);
    if (/\b(closer|nearby|walking distance|not too far|close by)\b/.test(lower)) opts.maxKm = 5;
    if (near && s.huddle.kind === "place") opts.area = near[1].replace(/\b\w/g, (c) => c.toUpperCase());
    if (/\b(cheaper|cheap|budget|less expensive)\b/.test(lower)) opts.priceMax = Math.max(1, (parsePrice(s.huddle.notes) ?? 3) - 1);
    if (/\b(surprise|adventurous|hidden gem|different|unusual)\b/.test(lower)) opts.popularityMax = 0.6;
    if (/\b(newer|recent|new)\b/.test(lower) && s.huddle.kind !== "place") opts.yearMin = new Date().getFullYear() - 8;
    if (near || /\b(closer|nearby|cheaper|cheap|budget|surprise|adventurous|hidden gem|different|unusual|newer|recent)\b/.test(lower)) continue;
    const term = (neg ? neg[1] : lower).replace(/\b(somewhere|something|place|food|please|more|a bit|bit)\b/g, "").trim();
    if (!term) continue;
    // calm/quiet is enforced in code already; anything else must closely match a tag name ("quieter" is not "Queer")
    if (!neg && CALM_ASK.test(term)) continue;
    const tags = await s.findTags(term);
    const tag = tags.find((t) => closeTagName(t.name, term));
    if (tag) (neg ? opts.avoidTags! : opts.preferTags!).push(tag.id);
  }
  return opts;
}

function ruleMessage(huddle: Huddle, top?: RankedCandidate) {
  if (!top) return "";
  const where = top.entity.meta ? ` (${top.entity.meta.split(" · ").join(", ")})` : "";
  const at = huddle.kind === "place" && parseWhen(huddle.when) ? `, ${whenLabel(huddle.when)}` : "";
  return `${huddle.title}: let's do ${top.entity.name}${where}${at}. It's the fairest fit for all of us.`;
}

/** "1 am" for a venue open at that time; undefined if Qloo has no hours for it. */
export function openUntil(e: { hours?: InsightEntity["hours"] }, when: string) {
  const o = openAt(e.hours, when);
  return o?.open && o.until ? clock(o.until) : undefined;
}

function ruleChange(prev: { entity_id: string; name: string } | undefined, now?: RankedCandidate) {
  if (!prev || !now) return "";
  return prev.entity_id === now.entity.entity_id
    ? `${now.entity.name} still fits best after your change.`
    : `Changed from ${prev.name} to ${now.entity.name}; everyone with a preference is at ${pct(now.min_satisfaction)} or higher.`;
}

/** Drop venues far from where the shortlist clusters (Qloo's city queries can reach 50 km out). */
export function withinRadius<T extends { lat?: number; lon?: number }>(items: T[], maxKm: number) {
  const pts = items.filter((i) => i.lat !== undefined && i.lon !== undefined);
  if (pts.length < 3) return { kept: items, droppedFar: 0 };
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const cLat = median(pts.map((p) => p.lat!));
  const cLon = median(pts.map((p) => p.lon!));
  const km = (p: T) =>
    Math.hypot((p.lat! - cLat) * 111.2, (p.lon! - cLon) * 111.2 * Math.cos((cLat * Math.PI) / 180));
  const kept = items.filter((i) => i.lat === undefined || i.lon === undefined || km(i) <= maxKm);
  return { kept, droppedFar: items.length - kept.length };
}

/** "under $$$" means cheaper than $$$ (≤ $$); "max $$" / "≤ $$" / "up to $$" include it. */
export function parsePrice(notes?: string) {
  const m = notes?.match(/(under|below|max|up to|≤|<=)\s*(\${1,4})/i);
  if (!m) return undefined;
  const n = m[2].length;
  return /under|below/i.test(m[1]) ? Math.max(1, n - 1) : n;
}
