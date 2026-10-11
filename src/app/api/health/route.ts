import { agentEnabled } from "@/lib/agent";
import { qlooMode } from "@/lib/qloo";
import { kvGet, kvSet, supabase } from "@/lib/store";

/**
 * Liveness check, also called once a day by a Vercel cron (vercel.json). The write keeps the
 * free-tier Supabase project active through the judging period (it pauses after 7 idle days).
 * Reports only booleans: no keys, no data.
 */
export async function GET(request: Request) {
  const started = Date.now();
  let db = false;
  try {
    await kvSet("health", { at: new Date().toISOString(), via: request.headers.get("user-agent")?.includes("vercel-cron") ? "cron" : "check" });
    db = !!(await kvGet("health", 60_000)) || !supabase;
  } catch {
    db = false;
  }
  return Response.json(
    { ok: db, db, qloo: qlooMode, agent: agentEnabled(), ms: Date.now() - started },
    { status: db ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
