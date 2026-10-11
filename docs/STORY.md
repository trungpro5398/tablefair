## In 30 seconds
**Try it:** [tastebridge-brown.vercel.app](https://tastebridge-brown.vercel.app) (one click: "Demo: three generations, one lunch", no account) · **Watch:** the narrated walkthrough on this page (under 2 minutes) · **Code:** [github.com/trungpro5398/tastebridge](https://github.com/trungpro5398/tastebridge) (MIT)

**The problem.** Couples spend about 17 minutes deciding where dinner comes from, and viewers browse about 12 minutes before finding something to watch (sources in [docs/MARKET.md](https://github.com/trungpro5398/tastebridge/blob/main/docs/MARKET.md)). Group apps settle it by swiping or voting. When a group averages everyone's taste, the person who hates the choice disappears into the average.

**One real run** ([live result](https://tastebridge-brown.vercel.app/h/i8iiiqdb)). A Vietnamese-Australian family in Melbourne adds favourite films, music and shows; Grandma likes it calm. A simple average picks Kawa Sake Sushi Boat, where Grandma Lan's match is **37%** (her 15th of 21 options). TasteBridge picks **The Moat**: Grandma Lan 57%, Minh 66%, Linh 66%, and nobody with a clear preference lower.

**What is new here**
- **Taste from any domain, no questionnaires.** Qloo maps Khánh Ly, *Heat* or *The Great British Baking Show* to restaurants and films.
- **Everyone's taste on the table.** The shortlist mixes each person's own top Qloo matches with the group's shared taste, so the choice isn't between compromises.
- **Fair to the people who care.** The pick protects the least-happy person with a clear preference; people Qloo sees as indifferent tonight are marked *flexible* instead of being "protected" on noise.
- **Private "not tonight"**, **private dietary needs** (vegetarian to halal and kosher) and **fairness that carries over** to the group's next outing.
- **Ready for the real evening.** It only suggests places Qloo lists as open when you're going. It can keep to films rated for children or to the time you have. Every pick comes with "Open until 11 pm", a rating, and Call, Maps or Netflix links.
- **Other agents can use it.** An MCP server lets Claude, or any MCP client, run a fair pick or start a huddle for real friends.
- **An agent that can't make things up.** Claude plans the Qloo calls and writes the explanations, but code enforces the hard rules and rejects any claim the data doesn't support.

**Evidence.** On 120 random groups with live Qloo data, the fair pick differs from the simple average in **40%** of groups. Where they differ, the least-matched person moves up **14 percentile points** among tonight's options, for a 7-point drop in the group average.

## How it meets the judging criteria
| Criterion | Where to look |
|---|---|
| **Technological implementation** (thorough, skilful use of Qloo) | Four Qloo endpoints doing five jobs. `/search` finds favourites from any domain. `/v2/tags` resolves must-haves, private vetoes and dietary needs. `/v2/insights` runs twice: once for each person's own top matches plus the group shortlist (with `filter.hours`, `filter.content_rating` and price filters), then again to re-score that same shortlist per person with `filter.results.entities` and `feature.explainability`. `/v2/analysis/compare` shows where two people split. Qloo place hours, ratings, running times, age ratings and external ids (IMDb, Netflix) make the pick usable. On top of that: a Claude tool-use agent with five tools; constraints and grounding enforced in code; an **MCP server**; 64 unit tests; a reproducible evaluation script; and every request listed in the app's "exact Qloo requests" panel. |
| **Design** (a complete, coherent product) | One-click demos; share link and QR code; the result leads with the average-vs-fair chart; plain-English agent steps; talk back to re-plan; mobile and dark mode; Lighthouse accessibility 100 on the home and result pages (scores recorded in `docs/SUBMISSION.md`). |
| **Potential impact** (a real problem for a real audience) | Families, friends and team outings; the three-generation demo is the core case. Suggestions respect opening hours, dietary needs, children and time, so the group can actually go. A rules-only `POST /api/v1/fair-pick` API for booking, ticketing and group-travel platforms, and an MCP server for AI assistants. Honest measurement: a controlled evaluation plus a live `/impact` page that counts only real groups. |
| **Quality of the idea** (creative, non-obvious use of Qloo) | Qloo is usually used to recommend to one person. TasteBridge uses it to measure *how much each person in a group cares* and protects them: cross-domain taste becomes a fairness signal, with flexibility, private vetoes and fairness over time. |

## Inspiration
"Where should we eat?" can take a group twenty minutes, and the quietest friend's taste usually gets ignored. Recommenders are built for one person. My PhD research is on explainable AI and user trust, so I wanted a group recommender that is **fair by design** and **shows its working**.

## What it does
TasteBridge helps a group pick **one** dinner spot, movie or TV show that everyone can enjoy.

1. One person starts a *huddle* and adds must-haves ("under $$$"). For dinner they also say **when** the group is going; for a film, whether **children are watching** and **how long they have**. Then they share a link.
2. Each friend adds up to three favourites from **any** domain: a film, an artist, a show, a book.
3. **Everyone's taste goes on the table.** The shortlist holds options brought by each person's own taste (their top Qloo matches in the city, labelled "Brought by Linh") plus options from the group's combined taste. The agent then **scores that same shortlist against each person's own taste**.
4. It recommends the option that maximises the **lowest taste match among people who actually have a preference tonight**. Everyone sees their own match, their rank among tonight's options and, when one clearly stands out, the favourite behind it. People Qloo sees as indifferent between tonight's options are marked **flexible tonight** instead of being "protected" on noise.
5. It also shows what a simple average would have picked and whose match would have been lowest there. Sometimes both pick the same thing, and the app says so.
6. **Private "not tonight".** When joining, anyone can quietly rule one thing out ("sushi", "horror", "somewhere loud"). It becomes a hard Qloo exclusion; the result says what was ruled out, never who asked. ([live result](https://tastebridge-brown.vercel.app/h/djkxuqt5): "no Sushi" removed Kawa Sake Sushi Boat.)
7. **Private dietary needs.** Anyone can add vegetarian, vegan, gluten-free, halal or kosher when joining. Each becomes a hard Qloo tag filter for every suggestion. The result says which needs were covered, never who needed them, because some needs reveal religion or health.
8. **Open when you're going.** Dinner shortlists only include places Qloo lists as open that day (`filter.hours`). TasteBridge then checks the time against Qloo's opening hours, including late-night slots, and requires at least an hour before closing. Each pick shows "Open until 11 pm", its Qloo rating and a **Call to book** button. Films show the running time, age rating, IMDb rating and a Netflix title link when Qloo has one.
9. **Fairness that carries over.** "Plan the next outing" keeps the same group. Whoever gave way last time (below 65%) earns a small, capped credit that breaks close calls in their favour next time, but never overrides an option that is kinder to everyone. ([live result](https://tastebridge-brown.vercel.app/h/ny5qvyh9): Grandma Lan gave way at The Moat (57%) and carries a 4-point credit; The Moat is still the kindest option for all four, so it stays, and the result says why.)

## How Qloo makes it work
Without Qloo there is no way to know how a fan of *Mad Max* and Daft Punk will feel about a vegetarian café. Every score starts from Qloo affinities:

- `/search`: cross-domain autocomplete for favourites (movies, TV, artists, books, podcasts, games).
- `/v2/tags`: turns must-haves into tag filters. Dinner huddles also require `urn:tag:category:place:restaurant`, so bars and shops are excluded.
- `/v2/insights` with `signal.interests.entities`: the group shortlist (seeded round-robin so no member dominates) plus one call per member for their own top matches, all with the same filters.
- `/v2/insights` with `filter.results.entities` and `feature.explainability`: re-scores the **same** candidates for each member, and tells us which of that member's favourites drove the match.
- `/v2/analysis/compare`: explains where two members' tastes overlap and where they split.
- Qloo entity properties make the pick usable: opening hours (`properties.hours`, plus `filter.hours` on the shortlist), business rating and phone for places; running time, age rating (`filter.content_rating` when children are watching) and external ids (IMDb rating, Netflix title) for films and shows.

Every result has a **Qloo evidence** panel listing the exact requests behind it: endpoint, filters, tag choices and result counts. Entity-id lists are summarised there, member names never go to Qloo, and the key stays on the server.

## A real run
**Real run (production, 10 Oct 2026): Sunday lunch, three generations** ([live result](https://tastebridge-brown.vercel.app/h/i8iiiqdb))
- A Vietnamese-Australian family in Melbourne. Grandma Lan (Khánh Ly, Trịnh Công Sơn, *The Scent of Green Papaya*), Minh (*Anthony Bourdain: Parts Unknown*, The Rolling Stones, *Heat*), Linh (*The Great British Baking Show*, Céline Dion, *Pride and Prejudice*) and their teenager Mai (*Spider-Man: Into the Spider-Verse*, BTS, *Stranger Things*).
- Must-have: "Grandma likes it calm. Under $$$." The code turns that into hard rules: up to $$, and no venue Qloo tags loud, noisy, bustling or lively.
- 21 Melbourne restaurants went on the table; 9 were brought by one person's own taste.
- Qloo sees Mai as flexible tonight: her scores barely differ between these options.
- A simple average picks Kawa Sake Sushi Boat, where **Grandma Lan's match is 37%** (her 15th of 21 options).
- TasteBridge picks **The Moat**: Grandma Lan 57%, Minh 66%, Linh 66%, Mai 57%.
- Claude compared the two people who disagree most: "Grandma Lan rates Ichigo at 83% while Linh is at 23%." It described The Moat only with its Qloo tags ("tagged Intimate and Quiet").
- 10 Qloo calls; Claude cost $0.08.
- **Talking back** ([live result](https://tastebridge-brown.vercel.app/h/i2r4eqpk)): the group asked "No Italian please, and somewhere quieter". Claude looked up Qloo's *Italian* and *Quiet* tags, excluded Italian, leaned quiet, rebuilt the shortlist (18 restaurants) and rescored everyone. The Moat was replaced by **Roule Galette**, with nobody with a clear preference below 59%. Because no option is tagged calm, the app says so and names the calmest close option: The Soup Place (Cozy), lowest match 52%. 12 Qloo calls, $0.09.

**Why opening hours matter** (live Qloo data, rules mode, 12 Oct 2026). Three friends (*Spirited Away*, *John Wick*, *The Bear*) choose dinner in Melbourne. Without a time, **4 of the top 5 fair options were closed at 7 pm on a Monday**, among them Vue de monde and Pincho Disco. With "Monday, 7 pm", 9 options that were closed or closing soon are skipped. The pick becomes Baby Pizza, "Open until 9:30 pm". On Friday at 9:30 pm the same group gets Pincho Disco, open until 11:30 pm.

## How we built it
- **Agent:** Claude (Anthropic TypeScript SDK tool runner) with five Zod-typed tools: `find_tags`, `group_candidates`, `score_for_members`, `compare_tastes`, `finalize`. The agent chooses filters, compares the two people who disagree most, re-plans once when the protected person is in their bottom half, and writes explanations from tool output only, with a plain-English reason on each step. Diet, budget and calm requests are enforced in code and survive retries; finalize rejects any ambience claim ("calm", "cozy") that the option's Qloo tags don't support. `finalize` enforces the scorer's top-three order, so the model can't override the maths.
- **Fairness:** raw affinities aren't comparable between people, so each member's scores become within-person percentiles over tonight's shortlist. The pick is the **maximin** option over people who have a preference tonight; on near-ties (within 3 points) it prefers the option kindest to everyone, then **Nash welfare**. A mean-score baseline is shown for contrast.
- **App:** Next.js 16, TypeScript and Tailwind, with Supabase (Postgres, row-level security, server-only access), deployed on Vercel. It is mobile-first with shareable links and huddle pages refresh automatically as friends join. Each huddle link unfurls in group chats with its own preview image showing the pick.
- **Watch the agent work:** the decide endpoint streams each real tool step (tags → shortlist → per-member scoring → explanations) to the UI as it happens. There are no fake loading messages.
- **Responsible cost:** Claude runs are capped per day and per hashed IP. Over budget, the app still answers using rule-based explanations, and saved results are reused while the group is unchanged.
- **Talk back to the agent:** "no Japanese, closer to the city", "somewhere quieter", "surprise us". The agent turns this into Qloo filters (`filter.exclude.tags`, `signal.interests.tags`, `filter.popularity.max`, `filter.release_year.min`, an area and a radius), re-plans, and explains what changed. "Somewhere quieter" and "calm" are enforced in code: venues Qloo tags loud, noisy, bustling or lively are excluded on every pass.
- **See the trade-off:** a scatter of every option (group average vs the least-matched person), a map of the shortlist, and a **taste compatibility** score with "taste twins" and "furthest apart" pairs.
- **Real-world details:** each pick shows:
  - Qloo "known for" tags (e.g. *Brunch · Modern · Welcoming*), the suburb and a cover image;
  - for places: "Open until …" and the Qloo rating, with **Open in Maps**, **Call to book** and **Website**;
  - for films: running time, age rating and IMDb rating, with **Where to watch** and a **Netflix page**.
- **An MCP server for other agents** (`/api/mcp`, Streamable HTTP). Add it to Claude as a custom connector. It has three tools:
  - `fair_pick` runs the whole rules pipeline with evidence;
  - `start_huddle` creates a real huddle and drafts the message for the group chat;
  - `get_huddle` reports who has joined and the result.
- **Built for groups in the room:** a QR invite to scan at the table. Decisions survive reloads and can't run twice when two friends press the button.
- **Learning loop:** three one-tap questions after each decision feed the live [Impact page](https://tastebridge-brown.vercel.app/impact).
- **Quality:** 64 unit tests cover minority protection, ties, constraints, opening hours across midnight, private dietary needs, age-rating and running-time filters, the MCP protocol, empty results, invalid finalisation and Qloo request construction. CI runs on GitHub Actions.

## Does fairness change anything? We measured it
`scripts/evaluate.mts` runs random groups of 3–5 people (3 favourites each, drawn from 24 well-known titles and artists) through the same pipeline on **live Qloo data**, in rules mode with no LLM.

Across **120 groups** in two runs of 60 (half dinner, half movie):
- The fair pick differed from the highest-average pick in **40%** of groups (24 of 60 in each run).
- Where it differed, the **least-matched person with a preference gained +14.1 percentile points**, while the group average dropped 6.6. In raw Qloo terms that person's affinity rose by a median of +0.015 to +0.020, which is 11–19% of their own spread across the shortlist: a real but modest gain, which is why the app also shows ranks ("20th of 24 options").
- Protecting only people who actually have a preference changed the pick in **14 of 120** groups compared with plain maximin.
- Putting everyone's own top matches on the table made fairness matter more often: on the same 60 groups, the old group-only shortlist differed in 37%.
- **37% of people were "flexible tonight"**: Qloo's scores for them barely differed across options. TasteBridge shrinks their percentiles toward neutral, so noise never decides the evening or gets labelled as "the person we protected".

Full method and caveats are in `docs/EVALUATION.md`.

## Works wherever the judges are
The same flow works outside Melbourne. A New York dinner group (*Succession*, Beyoncé, *Dune*) gets the Press Lounge, Battery Gardens and Katz's Delicatessen; Los Angeles gets In-N-Out, Catch and Nobu.
- Malls, markets and hotels that carry a restaurant tag are excluded, and drink-first venues are dropped using Qloo's `primary_genre`.
- The default city and the "where to watch" region come from the browser time zone.


## Measuring whether it works for real groups
Every result ends with three one-tap questions: did it work, were the percentages clear, and (once the evening has passed) did you actually go there.

The **[Impact page](https://tastebridge-brown.vercel.app/impact)** shows live, anonymous numbers from real groups:
- how often the fair pick differs from the average;
- the lift for the least-matched person;
- how often groups adjust with the agent;
- the answer rates.

These sit next to the controlled evaluation. Demo and test runs are excluded, so the live numbers start from zero and grow honestly.

## Challenges
- **Comparable scores.** Affinity scales differ per person, and percentiles fixed that.
- **Keeping the LLM honest.** The numbers come only from Qloo plus deterministic code. The model plans and explains, and finalisation rejects anything outside the scored ranking.
- **Being honest about results.** Percentiles are relative ranks among tonight's options, not measured happiness, and the UI says so.

## Run it yourself
```bash
git clone https://github.com/trungpro5398/tastebridge && cd tastebridge
npm install && cp .env.local.example .env.local   # keys optional
npm run dev                                       # http://localhost:3000
npm test
```
With no keys it runs fully offline on a fictional demo catalogue (clearly labelled in the UI). Add `QLOO_API_KEY` for live Qloo data, `ANTHROPIC_API_KEY` for the agent, and Supabase variables for persistence.

## Known limitations
- The hackathon key is rate limited. TasteBridge sends at most 2 concurrent requests, retries 429s a bounded number of times, and caches responses and demo favourites.
- Qloo affinities describe what audiences with similar tastes tend to like. A taste match is a **relative rank within one shortlist**, not a prediction of how a specific person will feel, and the app says so next to every score.
- The simple-average comparison is a mean-score baseline, not a real ballot.
- With small shortlists (for example after strict diet filters), percentiles are coarse.
- Free-text must-haves other than diet tags and dollar budgets are interpreted by the agent and should be checked.
- Opening hours and dietary tags come from Qloo. Once a time is set, venues with no listed hours are left out. Dietary needs, especially strict ones such as halal or gluten-free, are worth confirming when booking, and the app says so. Table availability is not checked.
- Streaming availability by country is not checked. The Netflix link opens the title page, and catalogues differ by region.
- No user study yet. The evaluation uses synthetic groups; real-group numbers accumulate on `/impact`.

## Who it's for, and how it grows
- **Consumers (free):** friends, couples and families. A link and a QR code; no accounts.
- **Teams:** team dinners and offsites, where the quiet person's taste matters just as much and HR cares about inclusion.
- **AI assistants (MCP):** a user can ask their assistant "find somewhere fair for the four of us on Friday". The assistant calls TasteBridge and gets back one pick with evidence, or a link for friends who aren't in the chat.
- **Platforms (API):** booking, ticketing and group-travel products can call `POST /api/v1/fair-pick` and get one fair pick with evidence. It is deterministic, costs a few Qloo calls, and needs no LLM. A per-call or per-booking fee fits naturally, and events and ticketing companies (think group outings to a show) are a direct fit.
- **Unit cost:** a full agent decision costs about **$0.05–0.13 of Claude** (measured; prompt caching on). The API path costs $0 in LLM.

## What's next
Booking hand-off (tables and tickets) for platform partners, streaming availability by country, recalibrating the flexibility threshold and the carried-over credit from real `/impact` data, and a React Native app with group chat sharing.
