# Submission checklist (updated 12 October 2026)

The project description submitted on Devpost is [docs/STORY.md](STORY.md).

## Qloo Agentic Hackathon requirements

| Requirement (from qloo.devpost.com) | Status | Evidence |
|---|---|---|
| Working software that integrates the Qloo API and functions as an agentic tool / is built with an agent framework | ✅ | Claude tool-runner agent with 5 Qloo-backed tools (`src/lib/agent.ts`); live Qloo hackathon API in production |
| Link to a functional demo that judges can try end to end | ✅ | https://tastebridge-brown.vercel.app (two one-click demos, no account); recorded showcase runs linked from STORY.md |
| Public code repository with source, assets and run instructions | ✅ | https://github.com/trungpro5398/tastebridge; README "Run locally" works with no keys (offline catalogue) |
| Text description of what it does and what makes it Qloo-powered | ✅ | docs/STORY.md |
| Externally hosted, fully published (not local / private) | ✅ | Vercel production + Supabase; no deployment protection on the production URL |
| Open-source license visible in the repo's About section | ✅ | MIT, detected by GitHub |
| Demo video | ✅ in repo | 134-second narrated walkthrough built from real runs on live Qloo data (production showcase run of 12 Oct, MCP call on production, local runs for the new plan options): docs/media/tastebridge-demo.mp4. Rebuild with `press/video/v3/build.py`. Devpost needs a YouTube/Vimeo link: upload it and paste the URL into "Video demo link". |

Qloo kit guidance (`qloo-hackathon-kit/docs/SUBMISSION.md`, `SAFE_USE.md`):

| Guidance | Where it's covered |
|---|---|
| Problem statement | docs/STORY.md |
| Qloo workflows and why | STORY → "How Qloo makes it work" |
| Request→result walkthrough | STORY + the in-app "Qloo evidence" panel |
| Setup steps | README |
| Limitations | STORY + docs/EVALUATION.md |
| No personal data to Qloo | Only entity ids, tag ids and a city are sent |
| Affinities framed as audience tendencies, not individual predictions | In-app copy and docs |

## Security review (11 October 2026)

| Check | Result |
|---|---|
| Secrets in git history | None: all commits scanned for Qloo, Anthropic and Supabase key patterns; only `.env.local.example` is tracked |
| Secrets in the browser bundle | None: no `NEXT_PUBLIC_` secrets; keys are read only in server code (`server-only`) |
| Database exposure | RLS is enabled on every table with no policies; the anon key can neither read nor write any table. The server uses the service role only. |
| Member edit credential | A separate `edit_token` is returned only at join, required for DELETE, and never selected in public reads (verified: no token / wrong token → 404). |
| Private "not tonight" | Stored in `members.avoid`, read only by the decide route; `getHuddle` never selects it; the public huddle JSON exposes only `id, name, picks, joined_at` per member (verified on production). Claude gets a count only and is told never to attribute; the result says what was excluded, never who asked. |
| Private dietary needs | Stored in `members.needs`, read only by the decide route (`getPrivate`), never selected by `getHuddle`. The result lists the needs that were covered and how many were added privately, never who added them. |
| MCP server (`/api/mcp`) | Stateless JSON-RPC with no session state. `fair_pick` shares the API's 20/hour per-IP limit and `start_huddle` shares the create limit (30/hour). `get_huddle` returns only what the public huddle page shows. Tool errors are generic. |
| Linked outings | `POST /api/huddles/[id]/next` is rate-limited per hashed IP (20/hour), requires a finished decision, and inherits the demo flag so test outings never reach `/impact`. |
| Abuse and cost | Per-IP limits on search, demo, create, next, API and feedback. Agent runs are capped at 100/day and 6/hour per hashed IP and fall back to rules. Qloo calls go through a limiter with bounded retries. |
| Prompt injection and grounding | User-typed fields are passed as data with explicit instructions to ignore embedded instructions. `finalize` rejects picks outside the scored ranking, ambience words the Qloo tags don't support, "loves/hates" predictions, false "your best" claims and internal field names. |
| Headers | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS (5/5 verified on production) |
| Accessibility | Lighthouse (mobile): home 100 accessibility / 100 best practices / 100 SEO; result page 100 / 100 / 91 (metadata is streamed for non-crawler user agents; crawlers get it in `<head>`) |
| Error messages | Generic to clients; details only in server logs |

## Keeping it live for judging
- Rules: the project must stay free and working until the Judging Period ends (2–16 November 2026, US Eastern). Judges may also judge only from the text, images and video.
- A Vercel cron calls `/api/health` daily (vercel.json). It writes one row, so the free-tier Supabase project never hits its 7-day inactivity pause, and reports `{ ok, db, qloo, agent }` with no data or keys.
- Claude runs are capped (100/day, 6/hour per IP) and fall back to rule-based explanations, so a busy judging day cannot break the app.

## Deploying the 12 October features
Apply the schema first, then deploy. `getHuddle` selects `huddles.plan` and the decide route reads `members.needs`:
```sql
alter table huddles add column if not exists plan jsonb;
alter table members add column if not exists needs text[];
```

## Before pressing Submit
- Re-run `npm test`, `npm run lint`, `npm run build`, and click both demos on production.
- Make sure the Devpost description matches docs/STORY.md and the gallery shows the current UI.
- Submit before **30 Oct 2026, 11:45 pm US Eastern = 31 Oct 2026, 2:45 pm Melbourne**. Edits remain possible until the deadline.
