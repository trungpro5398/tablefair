"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guessCity, useTimeZone } from "@/lib/locale";

const KINDS = [
  { value: "place", label: "Dinner spot", hint: "restaurants nearby" },
  { value: "movie", label: "Movie", hint: "films to watch" },
  { value: "tv_show", label: "TV show", hint: "series to start" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 11:00 to 23:00 every half hour */
const TIMES = Array.from({ length: 25 }, (_, i) => `${pad(11 + Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`);
const timeLabel = (t: string) => {
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}${t.endsWith("00") ? "" : ":30"} ${h < 12 ? "am" : "pm"}`;
};

/** The next 7 days in the browser's local time, and a sensible default: tonight at 7, or the next half hour. */
function upcoming(now: Date) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const name = d.toLocaleDateString(undefined, { weekday: "long" });
    const label = i === 0 ? `Today (${name})` : i === 1 ? `Tomorrow (${name})` : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
    return { value: ymd(d), label };
  });
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes <= 18 * 60 + 30) return { days, day: days[0].value, time: "19:00" };
  const next = Math.ceil((minutes + 30) / 30) * 30;
  if (next > 22 * 60 + 30) return { days, day: days[1].value, time: "19:00" };
  return { days, day: days[0].value, time: `${pad(Math.floor(next / 60))}:${pad(next % 60)}` };
}

export default function CreateHuddle() {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("place");
  const [busy, setBusy] = useState<"create" | null>(null);
  const [error, setError] = useState("");
  const tz = useTimeZone();
  const city = tz ? guessCity(tz) : "Melbourne";
  // dates depend on the browser clock, so they are only rendered after hydration (tz is "" on the server)
  const plan = tz ? upcoming(new Date()) : null;

  async function submit(form: FormData) {
    setBusy("create");
    setError("");
    const body = {
      title: String(form.get("title") || "Tonight"),
      kind,
      location: kind === "place" ? String(form.get("location") || "") || undefined : undefined,
      notes: String(form.get("notes") || "") || undefined,
      kids: kind !== "place" && form.get("kids") === "on" ? true : undefined,
      max_minutes: kind === "movie" && Number(form.get("length")) ? Number(form.get("length")) : undefined,
      when: kind === "place" && form.get("day") && form.get("time") ? `${form.get("day")}T${form.get("time")}` : undefined,
    };
    try {
      const res = await fetch("/api/huddles", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error ?? "Could not create a huddle. Try again.");
      router.push(`/h/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      <form action={submit} className="space-y-4">
        <div>
          <label className="text-sm font-medium" htmlFor="title">
            What are we deciding?
          </label>
          <input
            id="title"
            name="title"
            placeholder="Friday night with the crew"
            maxLength={80}
            className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 outline-none focus:border-brand"
          />
        </div>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Category">
          {KINDS.map((k) => (
            <button
              type="button"
              key={k.value}
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setKind(k.value)}
              className={`rounded-xl border px-2 py-2.5 text-sm transition ${
                kind === k.value ? "border-brand bg-brand/10 font-medium" : "border-line hover:bg-soft"
              }`}
            >
              <span className="block">{k.label}</span>
              <span className="block text-xs font-normal text-muted">{k.hint}</span>
            </button>
          ))}
        </div>
        {kind === "place" && (
          <div>
            <label className="text-sm font-medium" htmlFor="location">
              Where?
            </label>
            <input
              id="location"
              name="location"
              key={city}
              defaultValue={city}
              maxLength={80}
              className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 outline-none focus:border-brand"
            />
          </div>
        )}
        {kind === "place" && plan && (
          <fieldset>
            <legend className="text-sm font-medium">
              When? <span className="font-normal text-muted">(we only suggest places open then)</span>
            </legend>
            <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
              <select
                name="day"
                aria-label="Day"
                defaultValue={plan.day}
                className="w-full rounded-xl border border-line bg-background px-3 py-2.5 outline-none focus:border-brand"
              >
                {plan.days.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select
                name="time"
                aria-label="Time"
                defaultValue={plan.time}
                className="rounded-xl border border-line bg-background px-3 py-2.5 outline-none focus:border-brand"
              >
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {timeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
        )}
        {kind !== "place" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-sm">
              <input type="checkbox" name="kids" className="size-4 accent-brand" />
              <span>
                Children watching too
                <span className="block text-xs text-muted">only titles rated G or PG</span>
              </span>
            </label>
            {kind === "movie" && (
              <label className="block text-sm">
                <span className="font-medium">How long have you got?</span>
                <select
                  name="length"
                  defaultValue=""
                  className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 outline-none focus:border-brand"
                >
                  <option value="">Any length</option>
                  <option value="105">Up to 1 h 45 min</option>
                  <option value="120">Up to 2 hours</option>
                  <option value="150">Up to 2 h 30 min</option>
                </select>
              </label>
            )}
          </div>
        )}
        <div>
          <label className="text-sm font-medium" htmlFor="notes">
            Must-haves <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="notes"
            name="notes"
            placeholder="One vegetarian, under $$$"
            maxLength={300}
            className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 outline-none focus:border-brand"
          />
        </div>
        {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm">{error}</p>}
        <button
          disabled={!!busy}
          className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-brand-ink transition hover:opacity-90 disabled:opacity-60"
        >
          {busy === "create" ? "Creating…" : "Start a huddle"}
        </button>
      </form>
    </div>
  );
}
