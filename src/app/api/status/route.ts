import { findTags, qlooMode } from "@/lib/qloo";
import { quotaPaused, rememberQuota } from "@/lib/quota";

/**
 * What the page needs to know before you start: whether live Qloo lookups are paused. No writes
 * unless Qloo reports a used-up quota, no keys. The check is one tag lookup that Qloo responses
 * are cached for 30 minutes, so it costs at most a couple of requests an hour.
 */
export async function GET() {
  let resetAt = await quotaPaused();
  if (!resetAt && qlooMode === "live") {
    try {
      await findTags("calm", 3);
    } catch (err) {
      if (await rememberQuota(err)) resetAt = await quotaPaused();
    }
  }
  return Response.json(
    { qloo_quota: resetAt ? "used_up" : "ok", ...(resetAt ? { resets: new Date(resetAt).toISOString().slice(0, 10) } : {}) },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
