/**
 * Fair group pick as a service: the REST API (/api/v1/fair-pick) and the MCP server (/api/mcp)
 * both call this. Deterministic (no LLM): Qloo + the same maximin ranking the app uses.
 */
import "server-only";
import * as z from "zod";
import { ConstraintError, decideWithRules, openUntil } from "./decide";
import { WHEN_RE } from "./hours";
import { confidentMatch, searchEntities, withQlooLog } from "./qloo";
import { DIETS, type Entity, type EntityType, type Huddle, type Member, type RankedCandidate } from "./types";

export const FairPickInput = z.object({
  kind: z.enum(["place", "movie", "tv_show"]).describe("What the group is choosing: a dinner spot, a movie or a TV show"),
  location: z.string().trim().max(80).optional().describe('Places only: a city or neighbourhood, e.g. "Melbourne"'),
  notes: z.string().trim().max(200).optional().describe('Must-haves: vegetarian, vegan, gluten-free, halal, kosher, "under $$$", "max $$"'),
  when: z
    .string()
    .regex(WHEN_RE, 'when must look like "2026-10-16T19:00"')
    .optional()
    .describe('Places only: venue-local date and time, "2026-10-16T19:00"; only venues Qloo lists as open then are considered'),
  kids: z.boolean().optional().describe("Movies / TV: children are watching, so only titles rated G or PG (and TV equivalents)"),
  max_minutes: z.number().int().min(60).max(300).optional().describe("Movies: the longest running time, in minutes"),
  members: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40).describe("First name; never sent to Qloo"),
        favourites: z
          .array(z.string().trim().min(1).max(80))
          .min(1)
          .max(3)
          .describe("1–3 films, shows, artists, books, podcasts or games this person loves"),
        needs: z.array(z.enum(DIETS)).optional().describe("Places: dietary needs, applied as hard filters for everyone"),
      }),
    )
    .min(2)
    .max(8),
});

export type FairPickInput = z.infer<typeof FairPickInput>;

const FAVOURITE_TYPES: EntityType[] = [
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:videogame",
];

const option = (r: RankedCandidate, when?: string) => ({
  entity_id: r.entity.entity_id,
  name: r.entity.name,
  meta: r.entity.meta,
  address: r.entity.address,
  lat: r.entity.lat,
  lon: r.entity.lon,
  ...(r.entity.rating ? { rating: r.entity.rating } : {}),
  ...(when && openUntil(r.entity, when) ? { open_until: openUntil(r.entity, when) } : {}),
  ...(r.entity.runtime ? { runtime_minutes: r.entity.runtime } : {}),
  ...(r.entity.content_rating ? { content_rating: r.entity.content_rating } : {}),
  ...(r.entity.imdb ? { imdb_rating: r.entity.imdb } : {}),
  lowest_match: r.min_satisfaction,
  average_match: r.mean_satisfaction,
  per_member: r.scores.map((s) => ({
    name: s.member_name,
    match: s.satisfaction,
    ...(s.flexible ? { flexible_tonight: true } : {}),
    driven_by: s.because.map((b) => b.name),
  })),
});

/** Throws ConstraintError (bad input for Qloo) or QlooError (service busy). */
export async function fairPick(input: FairPickInput) {
  const { result, calls } = await withQlooLog(async () => {
    const members: Member[] = [];
    const unresolved: string[] = [];
    for (const [i, m] of input.members.entries()) {
      const picks: Entity[] = [];
      for (const f of m.favourites) {
        const hits = await searchEntities(f, FAVOURITE_TYPES, 3);
        const hit = hits.find((h) => confidentMatch(f, h.name));
        if (hit) picks.push(hit);
        else unresolved.push(f);
      }
      if (picks.length) members.push({ id: `api-${i}`, name: m.name, picks, joined_at: "", needs: m.needs });
    }
    if (members.length < 2) throw new ConstraintError("Could not resolve favourites for at least 2 members.");
    const huddle: Huddle = {
      id: "api",
      title: "API request",
      kind: input.kind,
      location: input.kind === "place" ? (input.location ?? "Melbourne") : undefined,
      notes: input.notes,
      when: input.kind === "place" ? input.when : undefined,
      kids: input.kind !== "place" ? input.kids : undefined,
      max_minutes: input.kind === "movie" ? input.max_minutes : undefined,
      created_at: new Date().toISOString(),
      members,
    };
    return { decision: await decideWithRules(huddle), unresolved, resolved: members };
  });
  const d = result.decision;
  if (!d.ranked.length) throw new ConstraintError("No candidates matched. Try fewer constraints.");
  return {
    pick: option(d.ranked[0], d.when),
    runner_ups: d.ranked.slice(1, 3).map((r) => option(r, d.when)),
    simple_average_pick: d.majority ? option(d.majority, d.when) : null,
    tradeoff: d.tradeoff_note,
    compatibility: d.compatibility ?? null,
    resolved_favourites: result.resolved.map((m) => ({ name: m.name, favourites: m.picks.map((p) => ({ name: p.name, type: p.type })) })),
    unresolved_favourites: result.unresolved,
    constraints_applied: {
      diet_tags: String(d.filters.tags ?? "").split(",").filter((t) => /vegetarian|vegan|gluten|halal|kosher/.test(t)),
      price_level_max: d.filters.price_level_max ?? null,
      open_at: d.when ?? null,
      content_rating: d.filters.content_rating ?? null,
      max_minutes: d.filters.max_minutes ?? null,
      note:
        input.notes && !/vegetarian|vegan|gluten|halal|kosher|\$/i.test(input.notes)
          ? "This endpoint applies diet and $-budget must-haves only; other requests need the in-app agent."
          : undefined,
    },
    steps: d.trace.map((t) => t.summary),
    provenance: { qloo: d.mode.qloo, calls },
    note: "Matches are within-shortlist percentiles of Qloo audience-level affinities, not predictions about individuals.",
  };
}
