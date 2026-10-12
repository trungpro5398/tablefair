# Evaluation: does fair picking actually protect anyone?

**Question.** When a group decides by the option with the highest average match, or by the most popular option with no taste data at all, how often does that leave one person badly served? And what does TableFair's fair pick change?

## Method (13 October 2026, live Qloo hackathon API)

- `scripts/evaluate.mts` builds random groups of 3–5 people from a fixed pool of 24 well-known favourites: films, TV shows and artists, resolved with Qloo `/search`.
- Each person gets 3 favourites. Half the groups decide on a dinner spot in Melbourne, half on a movie.
- Each group runs through the app's pipeline in rules mode (no LLM):
  1. Qloo Insights builds a shortlist of up to 30 options: each person's own top 3 matches first ("everyone's taste on the table"), then options from the group's combined taste. Same filters for every call.
  2. One call per person re-scores that shortlist (`filter.results.entities` + `feature.explainability`).
  3. Percentiles within the shortlist are **shrunk toward neutral for people whose Qloo scores barely differ** ("flexible tonight", see below), and the minimum is taken over people with a preference.
  4. Three picks are compared:
     - **fair pick:** highest *lowest* match, with Nash welfare breaking ties;
     - **average pick:** highest mean match;
     - **popular pick (no taste data):** the most popular option Qloo returns for the same must-haves (city, budget, opening day, diet, age rating) with **no taste signal**. It is what a listings app would put first. It is added to the shortlist so everyone's match there is on the same scale.

Reproduce it: `node --conditions=react-server --import tsx scripts/evaluate.mts 60 2026` and `... 60 7` (requires `QLOO_API_KEY`). Only aggregates are printed.

### Why "flexible tonight"
Qloo affinities share a 0–1 scale. We measured each person's spread (max − min) across their shortlist, 40 people on live data:

| Statistic | Spread |
|---|---|
| p25 | 0.037 |
| median | 0.074 |
| p90 | 0.159 |

A spread of 0.02 turned into a 0–100% percentile is noise, not preference. So each person's percentile is multiplied toward 50% by `decisiveness = spread / 0.10` (capped at 1), and people below 0.5 are labelled *flexible tonight*. "Driven by your favourite X" is shown only when that favourite's Qloo explainability weight is at least 15% above the person's average.

## Results

### Without taste data (13 October 2026)

| Run | Groups | Popular pick ≠ fair pick | Least-matched person with a preference: popular vs fair | Group average: popular vs fair | Someone with a preference below 25%: popular vs fair |
|---|---|---|---|---|---|
| seed 2026 | 60 | 60 (100%) | 24.2 vs **62.9** | 37.3 vs **67.6** | 32 / 60 vs **0 / 60** |
| seed 7 | 60 | 60 (100%) | 24.4 vs **62.4** | 38.1 vs **68.2** | 30 / 60 vs **0 / 60** |
| **both** | **120** | **120 (100%)** | **24.3 vs 62.7** | **37.7 vs 67.9** | **62 / 120 (52%) vs 0 / 120** |

Without taste data, the most popular option that fits leaves someone with a clear preference below 25% in half the groups. The fair pick never does, and it is better for the group average too (+30 points), because the popular option suits nobody in particular. This is the plainest answer to "would it work the same without Qloo?": no.

### Fair pick vs the simple average (13 October 2026)

| Run | Groups | People flexible tonight | Fair pick ≠ average pick | Where they differ: gain for the least-matched person with a preference | Cost to the group average | Raw Qloo affinity gain for that person (median) | Pick changed vs plain maximin |
|---|---|---|---|---|---|---|---|
| seed 2026 | 60 (30 dinner, 30 movie) | 86 / 224 (38%) | 26 (43%) | **+14.2 pts** | −6.8 pts | +0.014 (17% of their spread) | 7 / 60 |
| seed 7 | 60 (30 dinner, 30 movie) | 86 / 245 (35%) | 24 (40%) | **+12.8 pts** | −6.7 pts | +0.020 (13% of their spread) | 7 / 60 |
| **both** | **120** | **172 / 469 (37%)** | **50 (42%)** | **+13.5 pts** | **−6.8 pts** | | **14 / 120** |

These differ slightly from the 10 October run below because the popular option now joins every shortlist.

### 10 October 2026, before the popular baseline

Same pipeline otherwise: each person's own top matches on the table, calm requests enforced, maximin over **people with a preference tonight** (everyone if nobody has one), and near-ties within 3 points going to the option kindest to everyone.

| Run | Groups | People flexible tonight | Fair pick ≠ average pick | Where they differ: gain for the least-matched person with a preference | Cost to the group average | Raw Qloo affinity gain for that person (median) | Pick changed vs plain maximin |
|---|---|---|---|---|---|---|---|
| seed 2026 | 60 (30 dinner, 30 movie) | 86 / 224 (38%) | 24 (40%) | **+15.4 pts** | −6.5 pts | +0.015 (19% of their spread) | 7 / 60 |
| seed 7 | 60 (30 dinner, 30 movie) | 87 / 245 (36%) | 24 (40%) | **+12.7 pts** | −6.7 pts | +0.020 (11% of their spread) | 7 / 60 |
| **both** | **120** | **173 / 469 (37%)** | **48 (40%)** | **+14.1 pts** | **−6.6 pts** | | **14 / 120** |

Earlier pipelines, same day, for comparison:

| Pipeline | Run | Fair pick ≠ average | Gain | Cost | Pick changed vs plain maximin |
|---|---|---|---|---|---|
| Maximin over people with a preference, no near-tie rule | seeds 2026 + 7 (120) | 52 (43%) | +13.2 | −6.9 | 17 / 120 |
| Own top matches; maximin over everyone | seeds 2026 + 7 (120) | 54 (45%) | +13.0 | −6.3 | 1 / 120 |
| Group-blend shortlist only | seed 2026 (60) | 22 (37%) | +17.1 | −7.1 | 0 / 60 |

**Reading.**
- In about four groups in ten, the fair pick differs from the highest average. When it does, it lifts the least-matched person who cares by about 14 percentile points for a 7-point drop in the group average.
- Against the popular pick the gap is far larger (24% vs 63% for the least-matched person), but it is a weaker baseline: it ignores taste entirely.
- **Percentiles vs raw scores.** Qloo affinities sit on a compressed scale. The protected person's raw affinity typically rises by 0.015–0.019, which is 11–19% of the range that person shows across tonight's shortlist. The percentages in the app are ranks within the shortlist, so the app also shows the rank directly ("20th of 24 options") and marks people whose whole range is small as *flexible tonight*.
- **Why "people who care" matters.** About 37% of people are effectively indifferent across a shortlist. When their noise-level scores counted toward the minimum, they decided the winner in a few cases (1 of 120). Restricting maximin to people with a preference changes the pick in 14 of 120 groups, in favour of someone with a clear preference; the near-tie rule stops a one-point gain for them from pushing a flexible person far down.
- **Why the shortlist change matters.** A shortlist built only from the blended group taste is made of compromises, so each person's scores are compressed and the average is rarely unfair. Adding each person's own top matches puts real alternatives on the table.
- Maximin cannot lower the protected minimum by construction. The informative numbers are how often the decision changes, the cost to everyone else, and the raw size of the gain.

## Limitations

- These are synthetic groups drawn from popular favourites; real groups may disagree more or less.
- The popular pick is Qloo's own popularity ranking for the same filters, a stand-in for "what a listings app shows first". A real app might rank by rating or distance instead.
- Percentiles are relative to each shortlist. They describe Qloo audience-level affinities, not measured happiness.
- Maximin cannot lower the minimum by construction. The informative numbers are how often the decision changes and the size of the trade-off.
- The flexibility threshold (0.10 full spread) is calibrated on 40 people. It should be re-checked as real usage data arrives on `/impact`.
