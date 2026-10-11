# Market scan (12 October 2026)

A desk scan of group-decision products for "where do we eat?" and "what do we watch?". It is based on app-store listings, launch pages and press, so it reflects what products claim, not measured usage.

## The problem, in numbers
- **17 minutes** is how long couples spend, on average, deciding where dinner comes from. 16% spend 30 minutes or more, and the average couple argues about it 156 times a year (Panera Bread / OnePoll, 2,000 US adults in relationships, 2020: [Fox News](https://www.foxnews.com/food-drink/american-couples-argue-about-dinner)).
- **12 minutes** is how long online video viewers browse, on average, before they find something to watch (16 minutes for 18–34s). 46% say it is getting harder (Gracenote, a Nielsen company, 3,000 viewers in six countries, 2025: [informitv](https://informitv.com/2025/11/05/it-is-becoming-harder-to-decide-what-to-watch/)).

## How existing products decide
| Approach | Examples | What happens to the person who disagrees |
|---|---|---|
| Swipe until everyone matches | BiteSwipe, Winner Dinner, Tastebuddy, WatchLitz, Swyf | A dead end when nothing matches, or a random or "best partial" fallback |
| Majority or ranked vote | Google Maps group planning, Fork the Vote, Stream Vote | Outvoted, and often the same person every time |
| Hidden votes and vetoes | pickaru, Hangrily | Can block one thing, but nobody checks whether they are happy with the result |
| AI concierge in the chat | Instinct (early access, Oct 2026), Yelp Assistant | Plans for the group, with no stated fairness rule |

**Common gaps:**
- None of these products explains why an option won.
- None shows who would have lost under a simple vote.
- None carries fairness from one outing to the next.

Most also need every person to swipe through options. TasteBridge needs three favourites per person.

## Table stakes that TasteBridge now covers
- **Open when you're going.** Qloo opening hours (`filter.hours` plus a local time check), shown as "Open until 11 pm". In a live Melbourne run on a Monday at 7 pm, 4 of the top 5 options without this check were closed.
- **Dietary needs, privately.** Vegetarian, vegan, gluten-free, halal and kosher are hard Qloo filters. Each person adds their own needs without saying so in front of the group, which matters because some needs reveal religion or health.
- **Films that fit the evening.** "Children watching too" applies Qloo `filter.content_rating`. "How long have you got?" filters by running time. Each pick shows its age rating, IMDb rating and a Netflix title link when Qloo has one.
- **Act on it.** Open in Maps, Call to book, Website, the venue's Qloo rating, and a ready-to-send group message.
- **Lives where agents live.** An MCP server lets Claude, or any other MCP client, run a fair pick or start a huddle and send the link to the group chat.

## Where TasteBridge is different
- **Fairness is the objective, not consensus.** The pick protects the least-matched person who has a clear preference (maximin), with Nash welfare as the tie-break. This follows the group-recommender research on "least misery" and on fairness across a sequence of decisions.
- **It shows its working.** The average pick appears next to the fair pick, with each person's rank and the exact Qloo requests behind them.
- **Fairness over time.** Whoever gave way last time gets a small, capped credit at the next outing.
- **No cold start.** Taste comes from culture (films, music, shows) through Qloo, not from swiping.

## Not covered yet
- Streaming availability by country. The Netflix link opens the title page, and catalogues differ by region.
- Table booking APIs.
- Push notifications. Huddle pages refresh every few seconds instead.
