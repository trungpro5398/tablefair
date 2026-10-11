/**
 * Opening hours from Qloo place properties, and "is it open when we're going?".
 * Qloo: properties.hours = { friday: [{ opens: "T12:00:00", closes: "T01:00:00", closed: false }], ... }
 * A slot that closes at or before it opens runs past midnight.
 */

export const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Day = (typeof DAYS)[number];

/** Compact hours: day → [["12:00", "01:00"], ...]; a day with no slots is closed all day. */
export type Hours = Partial<Record<Day, [string, string][]>>;

/** A planned outing in the venue's local time, "2026-10-16T19:00". */
export const WHEN_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Arrive at least this long before closing, so there's time for a meal. */
export const MIN_STAY_MIN = 60;

type RawSlot = { opens?: unknown; closes?: unknown; closed?: unknown };

const hhmm = (v: unknown) => (typeof v === "string" ? v.match(/(\d{2}):(\d{2})/)?.slice(1, 3).join(":") : undefined);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function parseHours(raw: unknown): Hours | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Hours = {};
  let any = false;
  for (const day of DAYS) {
    const slots = (raw as Record<string, unknown>)[day];
    if (!Array.isArray(slots)) continue;
    any = true;
    out[day] = (slots as RawSlot[]).flatMap((s) => {
      const o = hhmm(s.opens);
      const c = hhmm(s.closes);
      return s.closed === true || !o || !c ? [] : [[o, c] as [string, string]];
    });
  }
  return any ? out : undefined;
}

export function parseWhen(when?: string) {
  const m = when?.match(WHEN_RE);
  if (!m) return undefined;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  // calendar day of week for that local date (UTC arithmetic avoids the server's time zone)
  const day = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return { day, minutes: h * 60 + mi, date: new Date(Date.UTC(y, mo - 1, d, h, mi)) };
}

/**
 * Is the place open on arrival, with at least MIN_STAY_MIN before closing?
 * undefined when Qloo has no hours for it (we don't guess).
 */
export function openAt(hours: Hours | undefined, when?: string): { open: boolean; until?: string } | undefined {
  const w = parseWhen(when);
  if (!hours || !w) return undefined;
  const i = DAYS.indexOf(w.day);
  const prev = DAYS[(i + 6) % 7];
  // that day's slots, plus yesterday's slots that run past midnight into today
  const windows: { start: number; end: number; until: string }[] = [];
  for (const [o, c] of hours[w.day] ?? []) {
    const start = toMin(o);
    const end = toMin(c) <= start ? toMin(c) + 1440 : toMin(c);
    windows.push({ start, end, until: c });
  }
  for (const [o, c] of hours[prev] ?? []) {
    if (toMin(c) <= toMin(o)) windows.push({ start: 0, end: toMin(c), until: c });
  }
  if (hours[w.day] === undefined && !windows.length) return undefined; // day missing from Qloo's data
  const hit = windows.find((x) => w.minutes >= x.start && w.minutes + MIN_STAY_MIN <= x.end);
  return hit ? { open: true, until: hit.until } : { open: false };
}

/** "19:00" → "7 pm", "01:30" → "1:30 am", "00:00" → "midnight". */
export function clock(t: string) {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  if (h === 0 && m === "00") return "midnight";
  if (h === 12 && m === "00") return "noon";
  const h12 = h % 12 || 12;
  return `${h12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "am" : "pm"}`;
}

/** "Fri 16 Oct, 7 pm". */
export function whenLabel(when?: string) {
  const w = parseWhen(when);
  if (!w) return undefined;
  const date = w.date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${date.replace(",", "")}, ${clock(when!.slice(11))}`;
}

/** 135 → "2 h 15 min", 120 → "2 hours", 45 → "45 min". */
export function minutesLabel(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  if (!r) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h} h ${r} min`;
}
