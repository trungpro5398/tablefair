import { quotaPaused } from "@/lib/quota";

/** What the page needs to know before you start: whether live Qloo lookups are paused. No writes, no keys. */
export async function GET() {
  const resetAt = await quotaPaused();
  return Response.json(
    { qloo_quota: resetAt ? "used_up" : "ok", ...(resetAt ? { resets: new Date(resetAt).toISOString().slice(0, 10) } : {}) },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
