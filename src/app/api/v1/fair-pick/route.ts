import { ConstraintError } from "@/lib/decide";
import { FairPickInput, fairPick } from "@/lib/fair-pick";
import { QlooError } from "@/lib/qloo";
import { QUOTA_MESSAGE, quotaPaused, rememberQuota } from "@/lib/quota";
import { allow, ipHash, tooMany } from "@/lib/usage";

export const maxDuration = 60;

/**
 * Fair group pick as a service, for booking, ticketing and team-event platforms.
 * Deterministic (no LLM): Qloo + the same maximin ranking the app uses.
 */
export async function POST(request: Request) {
  if (!allow(`api:${ipHash(request)}`, 20, 3_600_000)) return tooMany("API requests");
  const parsed = FairPickInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  if (await quotaPaused()) return Response.json({ error: QUOTA_MESSAGE }, { status: 503 });
  try {
    return Response.json(await fairPick(parsed.data));
  } catch (err) {
    if (err instanceof ConstraintError) return Response.json({ error: err.message }, { status: 422 });
    if (await rememberQuota(err)) return Response.json({ error: QUOTA_MESSAGE }, { status: 503 });
    if (err instanceof QlooError) return Response.json({ error: "The taste service is busy. Try again shortly." }, { status: 502 });
    throw err;
  }
}
