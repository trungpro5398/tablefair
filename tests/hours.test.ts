import assert from "node:assert/strict";
import test from "node:test";
import { clock, openAt, parseHours, parseWhen, whenLabel } from "../src/lib/hours";

// Naked For Satan, as returned by Qloo (properties.hours)
const RAW = {
  friday: [{ opens: "T12:00:00", closed: false, closes: "T01:00:00" }],
  monday: [{ opens: null, closed: true, closes: null }],
  sunday: [{ opens: "T12:00:00", closed: false, closes: "T22:00:00" }],
  tuesday: [{ opens: null, closed: true, closes: null }],
  saturday: [{ opens: "T12:00:00", closed: false, closes: "T01:00:00" }],
  thursday: [{ opens: null, closed: true, closes: null }],
  wednesday: [{ opens: null, closed: true, closes: null }],
};

test("parses Qloo hours into compact slots", () => {
  const h = parseHours(RAW)!;
  assert.deepEqual(h.friday, [["12:00", "01:00"]]);
  assert.deepEqual(h.monday, []);
  assert.equal(parseHours(null), undefined);
  assert.equal(parseHours({}), undefined);
});

test("day of week comes from the calendar date, not the server time zone", () => {
  assert.equal(parseWhen("2026-10-16T19:00")?.day, "friday");
  assert.equal(parseWhen("2026-10-12T19:00")?.day, "monday");
  assert.equal(parseWhen("tonight"), undefined);
});

test("open on arrival with time for a meal, including slots past midnight", () => {
  const h = parseHours(RAW)!;
  assert.deepEqual(openAt(h, "2026-10-16T19:00"), { open: true, until: "01:00" }); // Friday
  assert.deepEqual(openAt(h, "2026-10-12T19:00"), { open: false }); // Monday: closed
  assert.deepEqual(openAt(h, "2026-10-18T21:30"), { open: false }); // Sunday: closes 22:00, under an hour left
  assert.deepEqual(openAt(h, "2026-10-18T21:00"), { open: true, until: "22:00" });
  assert.deepEqual(openAt(h, "2026-10-16T10:00"), { open: false }); // before opening
  assert.deepEqual(openAt(h, "2026-10-17T23:30"), { open: true, until: "01:00" }); // Saturday late
  // Saturday 00:00 is still Friday night's slot, but only an hour remains
  assert.deepEqual(openAt(h, "2026-10-17T00:00"), { open: true, until: "01:00" });
  assert.deepEqual(openAt(h, "2026-10-17T00:30"), { open: false });
});

test("unknown hours are never guessed", () => {
  assert.equal(openAt(undefined, "2026-10-16T19:00"), undefined);
  assert.equal(openAt({ friday: [["12:00", "22:00"]] }, "2026-10-12T19:00"), undefined); // Monday missing
  assert.equal(openAt(parseHours(RAW), undefined), undefined);
});

test("readable times and dates", () => {
  assert.equal(clock("19:00"), "7 pm");
  assert.equal(clock("01:30"), "1:30 am");
  assert.equal(clock("00:00"), "midnight");
  assert.equal(clock("12:00"), "noon");
  assert.equal(whenLabel("2026-10-16T19:30"), "Fri 16 Oct, 7:30 pm");
});

test("a dinner decision only shortlists places open when the group is going", async () => {
  const { DecisionSession } = await import("../src/lib/decide");
  const { MOCK_ENTITIES } = await import("../src/lib/mock-data");
  const base = {
    id: "t", title: "Dinner", kind: "place" as const, location: "Melbourne", created_at: "",
    members: ["Spirited Away", "Amélie", "Inception"].map((name, i) => ({
      id: String(i), name: `F${i}`, joined_at: "", picks: [MOCK_ENTITIES.find((e) => e.name === name)!],
    })),
  };
  const monday = new DecisionSession({ ...base, when: "2026-10-12T19:00" });
  await monday.generateCandidates({ maxKm: 100 });
  const names = monday.shortlist.map((e) => e.name);
  for (const closed of ["Atelier Nineteen", "Little Kyoto Café", "The Board Game Pantry"]) assert.ok(!names.includes(closed), closed);
  assert.ok(monday.trace.some((t) => /open Mon 12 Oct, 7 pm/.test(t.summary)));
  assert.equal(monday.toDecision("rules").when, "2026-10-12T19:00");

  const noTime = new DecisionSession(base);
  await noTime.generateCandidates({ maxKm: 100 });
  assert.ok(noTime.shortlist.length > monday.shortlist.length);
  assert.equal(noTime.toDecision("rules").when, undefined);
});
