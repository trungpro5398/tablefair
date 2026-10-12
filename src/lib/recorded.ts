/**
 * Recorded showcase runs (production, Claude + live Qloo). They are linked from the story and
 * shown by the demo buttons when Qloo's quota is used up, so they are read-only: nobody can join,
 * leave, re-run or re-plan them, which would replace the saved result.
 */
export const RECORDED_DEMOS = { family: "akc5fxtv", friends: "2tnv3dtv" } as const;

const LOCKED = new Set<string>([
  ...Object.values(RECORDED_DEMOS),
  // earlier showcase runs linked from docs/STORY.md and the README
  "x7jg7f4q",
  "i8iiiqdb",
  "i2r4eqpk",
  "djkxuqt5",
  "ny5qvyh9",
]);

export function isLocked(huddleId: string) {
  return LOCKED.has(huddleId);
}

export const LOCKED_MESSAGE = "This is a recorded showcase run, so it can't be changed. Start your own huddle from the home page.";
