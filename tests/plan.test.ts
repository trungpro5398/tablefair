import assert from "node:assert/strict";
import test from "node:test";
import { DecisionSession } from "../src/lib/decide";
import { MOCK_ENTITIES } from "../src/lib/mock-data";
import { CreateHuddle, JoinHuddle } from "../src/app/api/schemas";
import { KID_RATINGS, type Huddle } from "../src/lib/types";

const pick = (name: string) => MOCK_ENTITIES.find((e) => e.name === name)!;

function group(kind: Huddle["kind"], extra: Partial<Huddle> = {}, needs: Huddle["members"][number]["needs"][] = []): Huddle {
  return {
    id: "t", title: "Tonight", kind, location: "Melbourne", created_at: "",
    members: ["Spirited Away", "John Wick", "Parasite"].map((name, i) => ({
      id: String(i), name: `F${i}`, joined_at: "", picks: [pick(name)], ...(needs[i] ? { needs: needs[i] } : {}),
    })),
    ...extra,
  };
}

test("a member's private dietary need becomes a hard filter, never attributed", async () => {
  const s = new DecisionSession(group("place", {}, [undefined, ["vegetarian"]]));
  await s.generateCandidates({ maxKm: 100 });
  assert.ok(s.shortlist.length > 0);
  for (const e of s.shortlist) assert.ok(e.tags?.some((t) => t.name === "vegetarian-friendly"), e.name);
  const d = s.toDecision("rules");
  assert.deepEqual(d.diet_needs, ["vegetarian"]);
  assert.equal(d.private_diets, 1);
  assert.ok(!JSON.stringify(d.trace).includes("F1"));
});

test("a need already in the must-haves is not counted as private", async () => {
  const s = new DecisionSession(group("place", { notes: "vegetarian" }, [["vegetarian"]]));
  await s.generateCandidates({ maxKm: 100 });
  assert.equal(s.toDecision("rules").private_diets, undefined);
});

test("children watching keeps only kid-friendly age ratings", async () => {
  const s = new DecisionSession(group("movie", { kids: true }));
  await s.generateCandidates();
  assert.ok(s.shortlist.length > 0);
  for (const e of s.shortlist) assert.ok(KID_RATINGS.includes(e.content_rating ?? ""), `${e.name} ${e.content_rating}`);
  assert.equal(s.toDecision("rules").filters.content_rating, KID_RATINGS.join(","));
  const all = new DecisionSession(group("movie"));
  await all.generateCandidates();
  assert.ok(all.shortlist.some((e) => !KID_RATINGS.includes(e.content_rating ?? "")));
});

test("running-time limit drops longer films", async () => {
  const s = new DecisionSession(group("movie", { max_minutes: 105 }));
  await s.generateCandidates();
  for (const e of s.shortlist) assert.ok(!e.runtime || e.runtime <= 105, `${e.name} ${e.runtime}`);
  assert.ok(s.trace.some((t) => /Films up to 1 h 45 min/.test(t.summary)));
});

test("validation: plan fields and dietary needs", () => {
  assert.ok(CreateHuddle.safeParse({ title: "x", kind: "place", when: "2026-10-16T19:00" }).success);
  assert.ok(!CreateHuddle.safeParse({ title: "x", kind: "place", when: "tonight" }).success);
  assert.ok(!CreateHuddle.safeParse({ title: "x", kind: "movie", max_minutes: 20 }).success);
  const p = { entity_id: "a", name: "A", type: "urn:entity:movie" };
  assert.ok(JoinHuddle.safeParse({ name: "Mai", picks: [p], needs: ["halal", "vegan"] }).success);
  assert.ok(!JoinHuddle.safeParse({ name: "Mai", picks: [p], needs: ["keto"] }).success);
});
