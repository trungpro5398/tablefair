"use client";

import { useEffect, useState } from "react";

/** Says so up front when Qloo's monthly quota is used up, so nobody starts a huddle that can't be decided. */
export default function QuotaNotice({ where }: { where: "hero" | "start" }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => alive && setPaused(s?.qloo_quota === "used_up"))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!paused) return null;
  return (
    <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm" role="status">
      {where === "hero" ? (
        <>
          <span className="font-semibold">Live Qloo lookups are paused.</span> The hackathon API&apos;s monthly request
          quota is used up, so the demos open recorded production runs (Claude and live Qloo data) instead of new ones.
        </>
      ) : (
        <>
          <span className="font-semibold">New huddles can&apos;t be decided right now:</span> Qloo&apos;s hackathon API has
          used up its monthly quota. The demos above show recorded runs.
        </>
      )}
    </p>
  );
}
