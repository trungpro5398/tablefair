/**
 * Shares "Qloo's monthly quota is used up" across server instances through the kv table, so a
 * fresh instance doesn't need a failed request to find out. Entries expire after 15 minutes and
 * the next request re-checks Qloo, so service resumes on its own when the quota is raised or reset.
 */
import "server-only";
import { QlooQuotaError, noteQuotaExhausted, qlooQuotaResetAt } from "./qloo";
import { kvGet, kvSet } from "./store";

const KEY = "qloo:quota";
const TTL_MS = 15 * 60 * 1000;

/** Reset time (ms epoch) if the quota is known to be used up, else 0. */
export async function quotaPaused(): Promise<number> {
  const mem = qlooQuotaResetAt();
  if (mem) return mem;
  const v = await kvGet<{ resetAt: number }>(KEY, TTL_MS).catch(() => null);
  if (v?.resetAt && v.resetAt > Date.now()) {
    noteQuotaExhausted(v.resetAt);
    return v.resetAt;
  }
  return 0;
}

/** Call from a catch block: records a quota error for other instances. Returns true if it was one. */
export async function rememberQuota(err: unknown): Promise<boolean> {
  if (!(err instanceof QlooQuotaError)) return false;
  await kvSet(KEY, { resetAt: err.resetAt }).catch(() => {});
  return true;
}

export const QUOTA_MESSAGE =
  "Qloo's hackathon API has used up its monthly request quota, so new picks can't be computed right now. The recorded demo runs still work.";
