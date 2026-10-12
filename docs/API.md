# TableFair API (preview)

Fair group picks as a service, for booking, ticketing, travel and team-event platforms. It is deterministic: Qloo Insights plus the same maximin ranking the app uses, with no LLM, so it is fast and cheap. Rate limited to 20 requests per hour per IP during the hackathon.

## `POST /api/v1/fair-pick`

```bash
curl -X POST https://tablefair.vercel.app/api/v1/fair-pick \
  -H 'content-type: application/json' \
  -d '{
    "kind": "place",
    "location": "Melbourne",
    "notes": "under $$$",
    "members": [
      { "name": "Ana", "favourites": ["Amélie", "Norah Jones"] },
      { "name": "Ben", "favourites": ["John Wick", "Metallica"] },
      { "name": "Chi", "favourites": ["Ratatouille", "The Bear"] }
    ]
  }'
```

**Body**

| Field | Type | Notes |
|---|---|---|
| `kind` | `"place" \| "movie" \| "tv_show"` | what the group is choosing |
| `location` | string | places only, e.g. `"Melbourne"` |
| `notes` | string | must-haves: `vegetarian`, `vegan`, `gluten-free`, `halal`, `kosher`, `under $$$`, `max $$` |
| `when` | `"2026-10-16T19:00"` | places only, venue-local time; only venues Qloo lists as open then, with an hour to spare |
| `kids` | boolean | movies / TV: children watching, so only G/PG (and TV-Y, TV-Y7, TV-G, TV-PG) via Qloo `filter.content_rating` |
| `max_minutes` | 60–300 | movies: longest running time |
| `members` | 2–8 × `{ name, favourites[1–3], needs? }` | favourites are free text (films, shows, artists, books, podcasts, games), resolved with Qloo `/search`; `needs` is an optional list of dietary needs (same values as above) |

Each option in the response also carries, when Qloo has them: `open_until` and `rating` (places); `runtime_minutes`, `content_rating` and `imdb_rating` (films and shows). `steps` lists what the pipeline did in plain English.

**Response (abridged; recorded from production on 10 Oct 2026)**

```json
{
  "pick": {
    "name": "Archie's All Day", "meta": "Fitzroy · $$", "lat": -37.806, "lon": 144.981,
    "lowest_match": 0.544, "average_match": 0.659,
    "per_member": [
      { "name": "Ana", "match": 0.775, "driven_by": ["Amélie"] },
      { "name": "Ben", "match": 0.544, "driven_by": ["John Wick"] }
    ]
  },
  "runner_ups": ["..."],
  "simple_average_pick": { "name": "Archie's All Day", "lowest_match": 0.544 },
  "most_popular_without_taste_data": { "name": "...", "lowest_match": 0.31 },
  "compatibility": { "score": 0.09 },
  "provenance": { "qloo": "live", "calls": ["7 requests: 2 x /search, 5 x /v2/insights"] },
  "note": "Matches are within-shortlist percentiles of Qloo audience-level affinities, not predictions about individuals."
}
```

Member names never leave TableFair; only entity ids go to Qloo.

## MCP server: `POST /api/mcp`

The same capability for AI assistants, over the Model Context Protocol (Streamable HTTP, stateless, JSON responses, no auth). In Claude: **Settings → Connectors → Add custom connector**, URL `https://tablefair.vercel.app/api/mcp`.

| Tool | What it does |
|---|---|
| `fair_pick` | Everything `/api/v1/fair-pick` does, as a tool call. The input schema is the body above. |
| `start_huddle` | Creates a real huddle (`title`, `kind`, `location`, `notes`, `when`, `kids`, `max_minutes`) and returns the link plus a ready-to-send group-chat message. |
| `get_huddle` | Who has joined so far and, once the group has decided, the pick, per-person matches and the trade-off. |

```bash
curl -X POST https://tablefair.vercel.app/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fair_pick","arguments":{
        "kind":"movie","kids":true,"max_minutes":105,
        "members":[{"name":"Ana","favourites":["Frozen"]},{"name":"Ben","favourites":["Bluey"]},{"name":"Cam","favourites":["John Wick"]}]}}}'
```

Rate limits are shared with the REST API (20 fair picks and 30 new huddles per hour per IP).
