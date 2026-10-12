/**
 * Shares "Qloo's monthly quota is used up" across server instances through the kv table, so a
 * fresh instance doesn't need a failed request to find out. Entries expire after 15 minutes and
 * the next request re-checks Qloo, so service resumes on its own when the quota is raised or reset.
 */
import "server-only";
import { QlooQuotaError, noteQuotaExhausted, qlooMode, qlooQuotaResetAt } from "./qloo";
import { kvGet, kvSet } from "./store";

const KEY = "qloo:quota";
const TTL_MS = 15 * 60 * 1000;

/** an "ok" answer from the kv table is trusted for a minute, so search keystrokes don't each read it */
let okUntil = 0;

/** Reset time (ms epoch) if the quota is known to be used up, else 0. */
export async function quotaPaused(): Promise<number> {
  if (qlooMode !== "live") return 0;
  const mem = qlooQuotaResetAt();
  if (mem) return mem;
  if (Date.now() < okUntil) return 0;
  const v = await kvGet<{ resetAt: number; at: number }>(KEY, TTL_MS).catch(() => null);
  if (v?.resetAt && v.resetAt > Date.now() && v.at) {
    noteQuotaExhausted(v.resetAt, v.at);
    if (qlooQuotaResetAt()) return v.resetAt;
  }
  okUntil = Date.now() + 60_000;
  return 0;
}

/**
 * Call from a catch block. Shares a quota error with other instances, but only when Qloo itself
 * just reported it, so fail-fast errors during a pause don't keep extending it. True if it was one.
 */
export async function rememberQuota(err: unknown): Promise<boolean> {
  if (!(err instanceof QlooQuotaError)) return false;
  if (err.fresh) await kvSet(KEY, { resetAt: err.resetAt, at: Date.now() }).catch(() => {});
  return true;
}

export const QUOTA_MESSAGE =
  "Qloo's hackathon API has used up its monthly request quota, so new picks can't be computed right now. The recorded demo runs still work.";
