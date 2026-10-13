## In 30 seconds
**Try it:** [tablefair.vercel.app](https://tablefair.vercel.app). Press "Demo: three generations, one lunch" (no account): the pick and everyone's numbers appear in about 10–15 seconds, then Claude's checked explanations replace them. If the hackathon key's monthly Qloo quota is used up, the demo opens a recorded production run instead and says so. **Watch:** the narrated walkthrough on this page (2 min 39 s). **Code:** [github.com/trungpro5398/tablefair](https://github.com/trungpro5398/tablefair) (MIT).

**The problem.** Couples spend about 17 minutes deciding where dinner comes from, and viewers browse about 12 minutes before finding something to watch ([sources](https://github.com/trungpro5398/tablefair/blob/main/docs/MARKET.md)). Group apps settle it by swiping or voting. When you average everyone's taste, the person who would hate the choice disappears into the average.

**What TableFair does.** It is for groups that are hard to please together: three generations at one table, mixed diets and faiths, friends with nothing in common. Everyone adds three favourite films, shows or artists. A Claude agent asks Qloo's taste graph how much each person will like each restaurant or film, then picks the option that **leaves nobody behind**, and shows its working.

**One real run** ([live result](https://tablefair.vercel.app/h/akc5fxtv)). A Vietnamese-Australian family in Melbourne plans Sunday lunch at 12:30. Grandma likes it calm.
- **Without taste data**, the most popular place that fits is SANTUCCI's, where Minh's match is **43%**.
- **A simple average** picks Alimentari, where Grandma Lan's match is **50%** (her 8th of 15 options).
- **TableFair** picks **ima Asa Yoru**, "open until 3 pm": Grandma Lan **68%**, Minh 65%, Linh 69%. Nobody with a clear preference drops below 65%.

**Evidence.**
- **Against Claude on its own.** Given the same brief but no Qloo, the same Claude model's pick **breaks one of the group's rules 27% of the time** (closed when they're going, over budget, not vegetarian, wrong age rating). Graded on a favourite that neither TableFair nor Claude saw, it leaves the least-matched person at the **18th percentile, against the 41st** for TableFair's pick (TableFair better in 34 of 47 groups).
- **Against popularity.** Without taste data, the most popular option that fits leaves someone with a clear preference below 25% in half of 120 groups; the fair pick, in none.
- **Against a simple average**, the fair pick differs in **42%** of groups and lifts the least-matched person by **14 points** on the favourites they gave. On a held-out favourite the two are level, so we promise fairness on what people tell us, not on tastes we never saw.

## How it meets the judging criteria
| Criterion | Where to look |
|---|---|
| **Technological implementation** | Four Qloo endpoints doing five jobs (below). A Claude tool-use agent with five tools, with the hard rules enforced in code. Every decision is also compared with two "without Qloo" baselines: the same Claude model on its own (checked against the group's rules with Qloo's data) and the most popular option that fits. A held-out evaluation, an MCP server, a rules-only REST API, 70 unit tests. Every request is listed in the app's "exact Qloo requests" panel. |
| **Design** | One click to a result: the numbers in about 10–15 seconds while Claude checks them, with its steps streamed in plain English. The result opens with the average-vs-fair chart. You can talk back to re-plan. Share link, QR code and a share card showing the average-vs-fair bars; mobile and dark mode. Lighthouse accessibility scores 100. |
| **Potential impact** | Families, friends and team outings, with the three-generation family as the core case. Picks respect opening hours, dietary needs, children and time, so the group can actually go. Booking platforms can use the API and AI assistants can use the MCP server. A live `/impact` page counts real groups only. |
| **Quality of the idea** | Qloo usually recommends to one person. TableFair uses it to measure *how much each person in a group cares*, and protects them. Cross-domain taste becomes a fairness signal, with private vetoes and fairness that carries over to the next outing. |

## Inspiration
"Where should we eat?" can take a group twenty minutes, and the quietest person's taste usually loses. Recommenders are built for one person. My PhD research is on explainable AI and user trust, so I wanted a group recommender that is **fair by design** and **shows its working**.

## What it does
1. One person starts a *huddle* and adds must-haves ("under $$$", "Grandma likes it calm"). For dinner they say when the group is going. For a film they say whether children are watching and how much time they have. Then they share the link.
2. Each friend adds up to three favourites from **any** domain: a film, an artist, a show or a book. No questionnaires.
3. **Everyone's taste goes on the table.** The shortlist mixes each person's own top Qloo matches (labelled "Brought by Linh") with options that suit the group's combined taste. The agent then scores every option against each person's taste.
4. It picks the option with the **best lowest match among people who have a preference tonight**. Each person sees their match, where the pick ranks for them ("4th of 15") and their own #1. People Qloo sees as indifferent are marked **flexible tonight**, so noise never decides the evening.
5. It shows what the group would get otherwise, each option scored for every person: what a simple average would have picked, what **Claude alone** suggests with the same brief but no Qloo (with any rule it breaks, such as "closed Sun 18 Oct, 12:30 pm"), and the most popular option that fits with **no taste data**. The group sees exactly what Qloo's taste graph adds.
6. **Private by design.** Anyone can quietly rule something out ("not sushi") or add a dietary need (vegetarian to halal and kosher). Each becomes a hard Qloo filter. The result says what was covered, never who asked.
7. **Ready for the real evening.** Only places Qloo lists as open when you're going, with at least an hour to spare. Each pick shows "Open until 3 pm", the Qloo rating and Call, Maps or Netflix links.
8. **Talk back** ("no Japanese, somewhere quieter") and the agent re-plans with Qloo. **Plan the next outing**: whoever gave way last time gets a small, capped credit in close calls.

## How Qloo makes it work
Without Qloo there is no way to know how a fan of *Mad Max* and Daft Punk will feel about a vegetarian café. Every score starts from Qloo:

- **`/search`**: cross-domain autocomplete for favourites (movies, TV, artists, books, podcasts, games).
- **`/v2/tags`**: turns must-haves, private vetoes and dietary needs into tag filters.
- **`/v2/insights`**, run twice:
  - first to build the shortlist: each person's own top matches plus the group's, with `filter.hours`, `filter.content_rating` and price filters;
  - then to re-score that same shortlist for each person, with `filter.results.entities` and `feature.explainability` (which of their favourites drove the match).
- **`/v2/analysis/compare`**: where the two people who disagree most overlap and split.
- **`/v2/insights` with no taste signal**: the most popular option that meets the same must-haves, scored for everyone as the "without Qloo taste" baseline.
- **Entity properties** make the pick usable: opening hours, ratings and phone numbers for places; running time, age rating, IMDb and Netflix ids for films.

Member names never go to Qloo, and the key stays on the server.

### Request → result (the showcase run, redacted)
Every result lists these calls in its "exact Qloo requests" panel. Entity ids are summarised there, as here.
```text
1. /v2/insights  filter.type=place  filter.location.query=Melbourne  filter.tags=restaurant
                 filter.hours=sunday  filter.price_level.max=2  filter.exclude.tags=loud,noisy,bustling,…
                 signal.interests.entities=<the group's 12 favourites>             → 50 candidates
2. /v2/insights  same filters, no taste signal                                      → 30, most popular first
3–6. /v2/insights  same filters, signal = <one person's 3 favourites> (×4)          → each person's own top matches
     → 15 restaurants open at 12:30 Sunday with an hour to spare
7–10. /v2/insights  filter.results.entities=<those 15>  signal=<one person's 3>  feature.explainability (×4)
     → every option scored for every person, turned into within-person percentiles
11. /v2/analysis/compare  a=<Grandma Lan's 3>  b=<Minh's 3>                         → shared: Drama, Complex, Atmospheric…
Result: ima Asa Yoru (lowest match 65%) · average pick Alimentari (50%) · popular pick SANTUCCI's (43%)
```
What this does not establish: how any one person will feel. The matches are ranks among tonight's options, based on what fans of each person's favourites tend to like.

## How we built it
![TableFair under the hood](https://raw.githubusercontent.com/trungpro5398/tablefair/main/docs/media/architecture.png)

- **Agent.** Claude runs through the Anthropic TypeScript SDK tool runner with five typed tools: `find_tags`, `group_candidates`, `score_for_members`, `compare_tastes` and `finalize`. It chooses filters, compares the two people who disagree most, and re-plans once if the protected person is in their bottom half. Each step is streamed live to the page.
- **Fast first answer.** While Claude plans, the same pipeline runs by rules, so the group sees the pick and everyone's numbers in about 10–15 seconds; Claude's checked version and explanations replace it a little later. Qloo responses land in a shared cache, so the agent's first shortlist costs no extra calls.
- **Claude alone, as a control.** The same model also gets the same brief without Qloo. Its suggestion is looked up with `/search`, scored for every person in the same `filter.results.entities` call, and checked against the group's rules using Qloo's own hours, price, dietary and age-rating data. It is shown, never picked.
- **An agent that can't make things up.** The numbers come only from Qloo plus deterministic code. Code enforces diet, budget, opening hours and "calm", so these survive retries. `finalize` rejects picks outside the scored ranking, ambience words that the Qloo tags don't support, and "loves/hates" predictions.
- **Fairness.** Raw affinities aren't comparable between people, so each person's scores become percentiles over tonight's shortlist. The pick is the **maximin** option over people with a preference. Near-ties go to the option kindest to everyone, then to **Nash welfare**.
- **For other software.** An **MCP server** (`/api/mcp`) lets Claude or any MCP client run a fair pick or start a huddle for real friends. `POST /api/v1/fair-pick` gives booking and ticketing platforms one fair pick with evidence, with no LLM involved.
- **Stack.** Next.js 16, TypeScript and Tailwind; Supabase with row-level security and server-only access; Vercel. Claude runs are capped per day and per IP, and fall back to rule-based explanations. A full agent decision costs $0.05–0.13.
- **Built to survive judging day.** Qloo rate limits are retried with back-off; if Qloo stays busy mid-run, the group keeps the numbers already shown. If the monthly quota runs out, requests stop retrying, the demo buttons open recorded production runs with a banner saying so, and those showcase runs are read-only so nobody can overwrite them.
- **Quality.** 70 unit tests cover minority protection, ties, constraints, opening hours across midnight, privacy, MCP and Qloo request construction. CI runs on GitHub Actions.
- **Team.** Built solo, with Claude Code as an AI pair programmer.

## Does fairness change anything? We measured it
**Held-out test against Claude alone.** `scripts/evaluate-baselines.mts` gives each person four favourites, shows three to TableFair and to Claude, and grades every pick on the fourth. Groups carry real constraints (a time, a budget, a vegetarian, children, a time limit). One run, 57 groups:
- Least-matched person on the held-out favourite: **TableFair 41st percentile, Claude alone 18th** (TableFair better in 34 of 47 groups, worse in 11). The simple average scored 40th and the popular pick 34th.
- **27% of Claude's suggestions broke one of the group's rules** according to Qloo's data; TableFair's picks can't.
- Where we don't win: on held-out taste the fair pick only draws with the simple average, and for dinner a popular venue did slightly better (49th vs 44th); for films popularity did badly (13th vs 37th).

**On the favourites people gave.** `scripts/evaluate.mts` runs random groups of 3–5 people through the same pipeline on **live Qloo data** (rules mode, no LLM). Across **120 groups** (half dinner, half movie):
- **Without taste data**, the most popular option that fits left the least-matched person with a preference at **24%** on average, against **63%** with the fair pick. It left someone below 25% in **52%** of groups; the fair pick, in **0%**. It was worse for the group average too (38% vs 68%).
- The fair pick differed from the highest-average pick in **42%** of groups.
- Where they differed, the least-matched person with a preference gained **+13.5 percentile points**, while the group average fell by 6.8.
- **37% of people were "flexible tonight"**: their scores barely differed across options. TableFair shrinks those scores toward neutral instead of "protecting" noise.

Method and caveats are in [docs/EVALUATION.md](https://github.com/trungpro5398/tablefair/blob/main/docs/EVALUATION.md). Real groups feed the live [Impact page](https://tablefair.vercel.app/impact) through three one-tap questions after each decision. Demo runs are excluded.

## More recorded runs
- **Talk back** ([result](https://tablefair.vercel.app/h/i2r4eqpk)): "No Italian please, and somewhere quieter." Claude looked up Qloo's *Italian* and *Quiet* tags and rebuilt the shortlist. When nothing was tagged calm, it said so plainly and named the closest calm option.
- **Private "not tonight"** ([result](https://tablefair.vercel.app/h/djkxuqt5)): "no Sushi" removed Kawa Sake Sushi Boat. Nobody can see who asked.
- **Fairness that carries over** ([result](https://tablefair.vercel.app/h/ny5qvyh9)): Grandma Lan gave way at 57% earlier and carries a 4-point credit into the next outing.
- **Opening hours:** without a time, 4 of the top 5 fair options for a Monday 7 pm dinner were closed. With the time set, they are skipped.

## Challenges we ran into
- **Comparable scores.** Affinity scales differ from person to person. Within-person percentiles fixed this, and the "flexible" rule stopped tiny differences from deciding the evening.
- **Keeping the LLM honest.** The model plans and explains; code owns the maths and the hard rules. Getting Claude's explanations to cite only what Qloo returned took several rounds of grounding checks.
- **Rate limits and quota.** The hackathon key allows 5 requests a second and 10,000 a month. Requests go through a limiter with back-off and caching, and our own evaluations used up the monthly quota on 13 October, which is why the app now has a recorded-run fallback.

## Accomplishments that we're proud of
- A real agent on real data: every result comes from live Qloo data, and you can watch each step as it happens.
- Privacy that holds up: vetoes and dietary needs change the result without revealing who asked.
- Honest measurement: a controlled evaluation, plus a live page that starts from zero.

## What we learned
Fairness only means something if people can see it. A percentage on its own is hard to read, so the result leads with the average-vs-fair chart and gives everyone a rank ("4th of 15 for you"). We also learned to let the agent say what the data can't support ("nothing here is tagged calm") instead of papering over it. Whether real groups find this clear is what the `/impact` questions are there to find out.

## Known limitations
- A taste match is a **relative rank within one shortlist**, based on what audiences with similar tastes tend to like. It is not a prediction of how one person will feel, and the app says so.
- The simple-average comparison is a mean-score baseline, not a real vote.
- Opening hours and dietary tags come from Qloo and should be confirmed when booking. Table availability and streaming availability by country are not checked.
- No user study yet: the evaluation uses synthetic groups, and real-group numbers build up on `/impact`.
- The held-out test is one run of 57 groups, and it shows the fair pick only drawing with the simple average on tastes it never saw.
- While the hackathon key's monthly Qloo quota is used up, new decisions can't run; the demos show recorded production runs.

## Who it's for, and what's next
Friends, couples and families for free; team dinners where inclusion matters; AI assistants through MCP; and booking, ticketing and group-travel platforms through the API, priced per call or per booking. Next: booking hand-off with partners, streaming availability by country, calibrating the flexibility threshold from real `/impact` data, and a mobile app with group-chat sharing.

## Run it yourself
```bash
git clone https://github.com/trungpro5398/tablefair && cd tablefair
npm install && cp .env.local.example .env.local   # keys optional
npm run dev                                       # http://localhost:3000
```
With no keys it runs offline on a clearly labelled fictional catalogue. Add `QLOO_API_KEY` for live Qloo data, `ANTHROPIC_API_KEY` for the agent, and Supabase variables for persistence. Full details are in the [README](https://github.com/trungpro5398/tablefair#readme).
