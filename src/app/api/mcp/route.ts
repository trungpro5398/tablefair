/**
 * TableFair as an MCP server (Streamable HTTP, stateless, JSON responses), so other agents
 * (Claude, ChatGPT, team bots) can ask for a fair group pick or start a real huddle for their users.
 * Add it as a custom connector: https://tablefair.vercel.app/api/mcp
 */
import * as z from "zod";
import { CreateHuddle } from "../schemas";
import { ConstraintError } from "@/lib/decide";
import { FairPickInput, fairPick } from "@/lib/fair-pick";
import { whenLabel } from "@/lib/hours";
import { QlooError } from "@/lib/qloo";
import { QUOTA_MESSAGE, rememberQuota } from "@/lib/quota";
import { createHuddle, getHuddle } from "@/lib/store";
import { allow, ipHash } from "@/lib/usage";

export const maxDuration = 60;

const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const HuddleId = z.object({ huddle_id: z.string().trim().regex(/^[a-z0-9]{8}$/, "huddle_id is the 8-character code in the link") });

/** JSON Schema for a tool's input, without the draft marker. */
const schema = (s: z.ZodType) => {
  const out = z.toJSONSchema(s) as Record<string, unknown>;
  delete out.$schema;
  return out;
};

const TOOLS = [
  {
    name: "fair_pick",
    title: "Fair group pick",
    description:
      "Pick ONE dinner spot, movie or TV show for a group with different tastes. Each person gives 1–3 favourite films, shows, artists or books; Qloo's taste graph scores a shortlist for each person, and TableFair picks the option where the least-matched person with a preference is best off (maximin, Nash tie-break). Returns the pick, two runner-ups, what a simple average would pick instead, per-person matches and the Qloo requests made. Matches are within-shortlist percentiles of audience-level affinities, not predictions about individuals. Takes 10–30 seconds.",
    inputSchema: schema(FairPickInput),
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "start_huddle",
    title: "Start a huddle for real friends",
    description:
      "Create a TableFair huddle and get a link to send to the group chat. Each friend opens it, adds three favourites (no account) and can privately rule one thing out or add dietary needs; then anyone presses one button for the fair pick. Use this when the people are not all in this conversation. Check progress with get_huddle.",
    inputSchema: schema(CreateHuddle),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "get_huddle",
    title: "Check a huddle",
    description: "Who has joined a huddle so far and, once the group has decided, the fair pick and how well it fits each person.",
    inputSchema: schema(HuddleId),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const INSTRUCTIONS =
  "TableFair helps groups choose one dinner spot, movie or TV show fairly. Use fair_pick when you already know each person's favourites; use start_huddle to send friends a link when you don't. Present the pick with the trade-off versus the simple average, and say that matches describe what fans of each person's favourites tend to like, not how they will feel.";

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const toolResult = (data: unknown) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }], structuredContent: data });
const toolError = (message: string) => ({ content: [{ type: "text", text: message }], isError: true });

async function callTool(name: string, args: unknown, request: Request) {
  const origin = new URL(request.url).origin;
  const ip = ipHash(request);
  if (name === "fair_pick") {
    const parsed = FairPickInput.safeParse(args);
    if (!parsed.success) return toolError(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    if (!allow(`api:${ip}`, 20, 3_600_000)) return toolError("Too many requests from this network; try again within the hour.");
    try {
      return toolResult(await fairPick(parsed.data));
    } catch (err) {
      if (err instanceof ConstraintError) return toolError(err.message);
      if (await rememberQuota(err)) return toolError(QUOTA_MESSAGE);
      if (err instanceof QlooError) return toolError("The taste service is busy. Try again in a minute.");
      throw err;
    }
  }
  if (name === "start_huddle") {
    const parsed = CreateHuddle.safeParse(args);
    if (!parsed.success) return toolError(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    if (!allow(`create:${ip}`, 30, 3_600_000)) return toolError("Too many new huddles from this network; try again within the hour.");
    const h = await createHuddle(parsed.data);
    const url = `${origin}/h/${h.id}`;
    return toolResult({
      huddle_id: h.id,
      url,
      message_for_the_group: `${h.title}: add your 3 favourite films, shows or artists here and TableFair finds the fairest ${h.kind === "place" ? "spot" : h.kind === "movie" ? "movie" : "show"} for all of us${h.kind === "place" && h.when ? ` (${whenLabel(h.when)})` : ""}: ${url}`,
      next: "Share the url. Once two or more people have joined, anyone on the page can press 'Find our fair pick'. Use get_huddle to check.",
    });
  }
  if (name === "get_huddle") {
    const parsed = HuddleId.safeParse(args);
    if (!parsed.success) return toolError(parsed.error.issues[0]?.message ?? "Invalid huddle_id");
    const h = await getHuddle(parsed.data.huddle_id);
    if (!h) return toolError("No huddle with that id.");
    const d = h.result;
    const top = d?.picks[0] && d.ranked.find((r) => r.entity.entity_id === d.picks[0].entity_id);
    return toolResult({
      huddle_id: h.id,
      url: `${origin}/h/${h.id}`,
      title: h.title,
      kind: h.kind,
      ...(h.location ? { location: h.location } : {}),
      ...(h.when ? { when: whenLabel(h.when) } : {}),
      members: h.members.map((m) => ({ name: m.name, favourites: m.picks.map((p) => p.name) })),
      status: top ? "decided" : h.members.length >= 2 ? "ready to decide (press 'Find our fair pick' on the page)" : "waiting for people to join",
      ...(top && d
        ? {
            pick: {
              name: top.entity.name,
              meta: top.entity.meta,
              why: d.picks[0].why_group,
              per_member: top.scores.map((s) => ({ name: s.member_name, match: s.satisfaction, ...(s.flexible ? { flexible_tonight: true } : {}) })),
            },
            simple_average_pick: d.majority?.entity.name ?? null,
            most_popular_without_taste_data: d.popular?.entity.name ?? null,
            tradeoff: d.tradeoff_note,
            group_message: d.group_message,
          }
        : {}),
    });
  }
  return null;
}

async function handle(msg: Rpc, request: Request) {
  if (msg?.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid request");
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "tablefair", title: "TableFair", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const result = await callTool(name, msg.params?.arguments ?? {}, request).catch((err) => {
        console.error("[mcp]", err);
        return toolError("Something went wrong. Please try again.");
      });
      return result ? ok(msg.id, result) : fail(msg.id, -32602, `Unknown tool: ${name}`);
    }
    default:
      return isNotification ? null : fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => undefined)) as Rpc | Rpc[] | undefined;
  if (body === undefined) return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  const msgs = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(msgs.map((m) => handle(m, request)))).filter(Boolean);
  // notifications and responses only: 202 with no body
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0]);
}

/** No server-initiated stream: this server only answers requests. */
export function GET() {
  return new Response("TableFair MCP endpoint: POST JSON-RPC here (Streamable HTTP).", { status: 405, headers: { allow: "POST" } });
}

export const DELETE = GET;
