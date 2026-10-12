export type EntityType =
  | "urn:entity:movie"
  | "urn:entity:tv_show"
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:videogame";

/** What the group is deciding on tonight. */
export type HuddleKind = "place" | "movie" | "tv_show";

export const KIND_TO_TYPE: Record<HuddleKind, EntityType> = {
  place: "urn:entity:place",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
};

/** Dietary needs a person can add privately when joining (dinner huddles). */
export const DIETS = ["vegetarian", "vegan", "gluten-free", "halal", "kosher"] as const;
export type Diet = (typeof DIETS)[number];

/** Age ratings that suit children (Qloo filter.content_rating). */
export const KID_RATINGS = ["G", "PG", "TV-Y", "TV-Y7", "TV-G", "TV-PG"];

export type Entity = {
  entity_id: string;
  name: string;
  type: EntityType | string;
  image?: string;
  description?: string;
  tags?: { id: string; name: string }[];
  meta?: string;
  /** full street address (places), for map links */
  address?: string;
  /** coordinates (places), for the map */
  lat?: number;
  lon?: number;
  website?: string;
  /** Qloo marks permanently closed venues */
  closed?: boolean;
  /** Qloo's primary genre tag for places, e.g. urn:tag:genre:place:restaurant:italian */
  primaryGenre?: string;
  /** opening hours from Qloo (places), compact: day → [["12:00", "01:00"]] */
  hours?: import("./hours").Hours;
  /** Qloo business rating (places), 0–5 */
  rating?: number;
  phone?: string;
  /** movies: running time in minutes; TV: episode length */
  runtime?: number;
  /** age rating, e.g. "PG", "TV-MA" */
  content_rating?: string;
  /** IMDb user rating (via Qloo external ids) */
  imdb?: number;
  /** Netflix title id (via Qloo external ids); catalogues differ by region */
  netflix?: string;
};

/** A candidate as returned by /v2/insights, plus explainability. */
export type InsightEntity = Entity & {
  affinity: number;
  popularity?: number;
  /** input entity_id -> contribution (0..1) */
  explain: Record<string, number>;
  /** members who brought this option to the table (it is among their own top Qloo matches) */
  champion_of?: string[];
};

export type Member = {
  id: string;
  name: string;
  picks: Entity[];
  joined_at: string;
  /** private "not tonight"; server-side only, never in public reads */
  avoid?: string;
  /** private dietary needs; server-side only, never in public reads */
  needs?: Diet[];
};

export type Huddle = {
  id: string;
  title: string;
  kind: HuddleKind;
  location?: string;
  notes?: string;
  /** when the group is going, in the venue's local time: "2026-10-16T19:00" (places) */
  when?: string;
  /** movies / TV: children are watching too (age-rated G/PG and TV equivalents only) */
  kids?: boolean;
  /** movies: the longest running time the group has time for, in minutes */
  max_minutes?: number;
  created_at: string;
  members: Member[];
  result?: Decision | null;
  /** a decision is being computed right now (another viewer pressed the button) */
  deciding?: boolean;
  feedback?: { q?: "worked" | "clear" | "went"; a?: "yes" | "no"; vote?: "up" | "down"; at: string }[];
  /** the group's previous outing, when this huddle was planned as "the next one" */
  parent_id?: string;
  /** server-only: who gave way on earlier outings (filled by the decide route) */
  carried?: CarriedOver[];
};

/** Someone who gave way on an earlier outing, and the small credit that carries into tonight. */
export type CarriedOver = { member_name: string; previous_pick: string; previous_match: number; credit: number };

export type MemberScore = {
  member_id: string;
  member_name: string;
  /** raw Qloo affinity of this candidate for this member's taste */
  affinity: number;
  /** raw within-shortlist percentile for this member, 0..1 */
  percentile?: number;
  /**
   * taste match shown to people and used by the fair ranking: the percentile shrunk toward 0.5 by
   * how decisive this person's Qloo scores are tonight (see fairness.ts)
   */
  satisfaction: number;
  /** 0..1: how much Qloo's scores for this person differ across tonight's options */
  decisiveness?: number;
  /** Qloo sees little difference between options for this person tonight */
  flexible?: boolean;
  /** which of the member's favourites drove the match, strongest first */
  because: { name: string; weight: number }[];
};

export type RankedCandidate = {
  entity: InsightEntity;
  scores: MemberScore[];
  /** lowest taste match among members with a preference tonight (everyone if all are flexible) */
  min_satisfaction: number;
  /** lowest taste match over everyone, flexible members included */
  min_all?: number;
  /** the floor after carried-over credit (used for ordering; equals min_satisfaction without history) */
  debt_floor?: number;
  mean_satisfaction: number;
  nash: number;
};

export type Pick = {
  entity_id: string;
  headline: string;
  why_group: string;
  per_member: { member_name: string; reason: string }[];
};

/** One Qloo request as shown to users/judges: endpoint, redacted params, result count. */
export type QlooCall = {
  endpoint: string;
  params: Record<string, string>;
  results: number;
  source: "qloo" | "cache" | "offline";
  ms: number;
};

export type Decision = {
  created_at: string;
  mode: { qloo: "live" | "mock"; agent: "claude" | "rules" };
  filters: Record<string, string | number>;
  /** when the group is going (places): options were checked against Qloo opening hours for this time */
  when?: string;
  ranked: RankedCandidate[];
  /** what plain majority/average voting would pick */
  majority: RankedCandidate | null;
  /** the most popular option meeting the same must-haves, found with no taste data (what a listings app shows first) */
  popular?: RankedCandidate | null;
  /** "Claude alone": what the same model picked without Qloo, looked up in Qloo and scored the same way */
  llm_only?: {
    /** the name Claude gave (or Qloo's name for it, when found) */
    name: string;
    reason: string;
    /** Qloo found it in the same city / catalogue */
    found: boolean;
    /** hard rules it breaks, from Qloo's own data ("closed Sun 18 Oct, 12:30 pm") */
    violations: string[];
    /** scored for every person on tonight's shortlist, when found */
    candidate?: RankedCandidate;
  };
  picks: Pick[];
  tradeoff_note: string;
  trace: { tool: string; summary: string }[];
  /** redacted log of the Qloo requests behind this decision */
  qloo_calls?: QlooCall[];
  /** follow-up requests from the group that shaped this run, oldest first */
  refinements?: string[];
  previous_pick?: string;
  /** what changed versus the previous pick, and why */
  change_note?: string;
  /** ready-to-send message for the group chat */
  group_message?: string;
  /** how alike the group's tastes are across the shortlist */
  compatibility?: import("./fairness").Compatibility;
  /** how many options were on the scored shortlist (the ranked list keeps only the top 10) */
  shortlist_size?: number;
  /** member_id -> name of that member's own top option on tonight's shortlist */
  personal_top?: Record<string, string>;
  /** calm was requested and the pick has no calm-type tag: the best calm-tagged option within 10 points */
  calm_alternative?: { name: string; tags: string[]; lowest_match: number };
  /** what the group's private "not tonight" requests excluded (never who asked) */
  private_exclusions?: string[];
  /** dietary needs covered, including private ones (never who asked) */
  diet_needs?: string[];
  /** how many of those were added privately by members */
  private_diets?: number;
  /** fairness carried over from the group's earlier outings */
  carried_over?: CarriedOver[];
  /** whether that credit changed tonight's pick */
  carried_changed_pick?: boolean;
  /** Claude tokens spent on this decision */
  agent_usage?: { calls: number; input: number; cacheRead: number; cacheWrite: number; output: number; usd: number; model: string };
};
