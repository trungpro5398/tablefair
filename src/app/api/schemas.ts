import * as z from "zod";
import { WHEN_RE } from "@/lib/hours";
import { DIETS } from "@/lib/types";

export const CreateHuddle = z.object({
  title: z.string().trim().min(1).max(80).describe('What the group is deciding, e.g. "Friday night with the crew"'),
  kind: z.enum(["place", "movie", "tv_show"]).describe("A dinner spot, a movie or a TV show"),
  location: z.string().trim().max(80).optional().describe('Places only: a city or neighbourhood, e.g. "Melbourne"'),
  notes: z.string().trim().max(300).optional().describe('Must-haves, e.g. "one vegetarian, under $$$"'),
  when: z
    .string()
    .regex(WHEN_RE, "Pick a day and time")
    .optional()
    .describe('Places only: venue-local date and time, "2026-10-16T19:00"; only venues open then are suggested'),
  kids: z.boolean().optional().describe("Movies / TV: children are watching too (G/PG only)"),
  max_minutes: z.number().int().min(60).max(300).optional().describe("Movies: longest running time, in minutes"),
});

export const EntityIn = z.object({
  entity_id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  type: z.string().max(60),
  image: z.string().url().max(2000).optional(),
  meta: z.string().max(120).optional(),
  tags: z.array(z.object({ id: z.string().max(160), name: z.string().max(120) })).max(30).optional(),
});

export const JoinHuddle = z.object({
  name: z.string().trim().min(1).max(40),
  picks: z.array(EntityIn).min(1).max(3).refine(
    (picks) => new Set(picks.map((p) => p.entity_id)).size === picks.length,
    "Choose different favourites",
  ),
  /** private "not tonight" (e.g. "sushi", "horror"): applied as an exclusion, never shown with a name */
  avoid: z.string().trim().max(40).optional(),
  /** private dietary needs (dinner huddles): applied as hard filters, never shown with a name */
  needs: z.array(z.enum(DIETS)).max(DIETS.length).optional(),
});
