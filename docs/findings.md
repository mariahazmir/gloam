# Findings

## 1. What Gloam claims, and what it does not

Gloam estimates which streets are likely well lit, using OpenStreetMap data, and shows how sure it is. It cannot tell anyone that a route is safe, and every screen that shows a route carries that statement. The model's probabilities are relative scores, biased low and not calibrated, so the app describes each street by its rank within the city and never by a fixed probability cut-off.

## 2. How good are the estimates?

Source: `docs/validation.md`. Method: hold-one-out on tagged segments. `tagged_lit` streets are the positives and `tagged_unlit` streets are the only negatives. Untagged streets are unknown, not unlit, and are left out of the metrics.

| City (walking paths) | Model AUC | Highway-footway-rate baseline AUC | Result |
|---|---|---|---|
| London | 0.652 | 0.627 | Model beat the baseline |
| Berlin | 0.776 | 0.828 | Model did **not** beat the baseline |
| Manchester | 0.744 | 0.845 | Model did **not** beat the baseline |

- The model beat the two simpler baselines in all three cities (rule baseline 0.500 everywhere; highway-rate baseline 0.505 Berlin, 0.556 London, 0.534 Manchester). It did not beat the baseline that knows the highway type and footway kind, in two of three cities. On walking paths, most of the signal is road type and path kind, and nearby places add little.
- Seattle and Kuala Lumpur were not validated. Hold-out validation was skipped because they have too few `tagged_unlit` segments (Seattle 47, Kuala Lumpur 12, threshold 200).
- Metrics for vehicle roads were skipped in all three cities (72, 20 and 27 `tagged_unlit` segments against a threshold of 100).
- Precision is not quoted anywhere in the app or here. The negatives are few (for example London: 7,969 tagged lit against 423 tagged unlit), so precision mostly reflects the base rate, and the fitted probabilities are biased low.
- What the AUC does not show: it measures how well the model separates tagged-lit from tagged-unlit streets. It says nothing directly about the untagged streets, which are the ones the app has to guess, and mappers may not tag unlit streets at random.
- Ground truth: not run. No ground-truth file was provided.

## 3. The Kuala Lumpur case

KL is the case Gloam is built around: lighting records are missing.

| City | Segments | Tagged lit | Tagged unlit | Untagged (share) |
|---|---|---|---|---|
| Kuala Lumpur | 10,225 | 133 | 12 | 10,080 (98.6%) |
| Seattle | 17,402 | 5,728 | 47 | 11,627 (66.8%) |
| Manchester | 21,792 | 7,085 | 219 | 14,488 (66.5%) |
| London | 15,296 | 7,969 | 423 | 6,904 (45.1%) |
| Berlin | 16,668 | 11,602 | 1,215 | 3,851 (23.1%) |

- In KL almost every street is an estimate, and there was not enough tagged data to validate the model there.
- I could not get on-the-ground ground truth for KL, so the KL estimates are unverified. The app labels them as estimates with their confidence.

## 4. Does routing change the walk?

Source: `app/scripts/routeStats.ts`, seed 20260. For each city the script draws 40 start-and-end pairs 800 to 1,500 m apart in a straight line, with all personal settings off. Each pair is routed at λ = 1, 3 (the default), 6 and 10 and compared with the shortest route (λ = 0) for the same pair. These are random pairs inside each city pack, not real walks.
 
At the default λ = 3 (median; range in brackets):
 
| City | Pairs where the route differs | Change in dread exposure | Extra distance |
|---|---|---|---|
| Seattle | 39 of 40 | −22.5% (−49.6 to 0.0) | 3.6% (0.0 to 25.5) |
| Kuala Lumpur | 39 of 40 | −8.9% (−46.5 to 0.0) | 1.8% (0.0 to 13.5) |
| London | 38 of 40 | −20.7% (−57.1 to 0.0) | 0.6% (0.0 to 7.3) |
| Berlin | 28 of 40 | −22.1% (−57.2 to 0.0) | 0.3% (0.0 to 7.1) |
| Manchester | 38 of 40 | −20.7% (−65.4 to 0.0) | 1.7% (0.0 to 43.5) |
 
- Dread exposure is length times dread, summed along the route. It is the quantity the router lowers, and it uses Gloam's own estimates, which already count low confidence as darker. It is not a measurement of real darkness or of safety.
- It never rose. Across all 800 pair-and-λ combinations (5 cities, 40 pairs, 4 settings) no Gloam route had more dread exposure than the shortest route, which is what Property 10 says should happen.
- The typical cost is small and the worst case is not. Median extra distance at λ = 3 is 0.3 to 3.6%, but the largest single detour was 43.5% (Manchester), then 25.5% (Seattle). The app shows both distances, so the walker sees the trade.
- Kuala Lumpur gains the least (median −8.9%, against −20.7 to −22.5% elsewhere). I have not tested why.
- The slider: at λ = 1, 6 and 10, median dread exposure falls by 15.2, 24.1 and 24.4% in Seattle and by 5.9, 9.3 and 10.5% in Kuala Lumpur. Most of the gain comes by λ = 6 in Seattle, while median extra distance keeps rising (1.1, 3.6, 6.9, 7.8%). Only these four settings were sampled.
- Dark-tier metres (metres on streets ranked "mapped unlit" or "darker than most") is a second measure, reported only for pairs where the shortest route had some (25 to 34 of the 40). At λ = 3 its median change is −42.2% in Kuala Lumpur and −84.6 to −96.2% elsewhere. I do not use it as a headline. The router does not minimise it, and on some pairs it rises (up to +4,805% in Seattle, a percentage of a very small number). Quote the dread exposure column.
- The five built-in example walks were picked by a script to show a difference (800 to 1,500 m, at least three tiers). They are best cases, not typical walks, and the app says so on screen.

## 5. Street search
 
Source: `app/scripts/streetNameStats.ts`, run on 16 Nov 2026. It runs offline over the city packs.
 
| City | Segments | With a name | Distinct names | Names with more than one stretch | Most stretches for one name |
|---|---|---|---|---|---|
| Seattle | 17,402 | 15.6% | 324 | 94 (29.0%) | 11 ("south weller street") |
| Kuala Lumpur | 10,225 | 19.1% | 430 | 31 (7.2%) | 4 ("bintang walk") |
| London | 15,296 | 32.3% | 958 | 203 (21.2%) | 32 ("oxford street") |
| Berlin | 16,668 | 22.4% | 384 | 74 (19.3%) | 8 ("lichtenberger strasse") |
| Manchester | 21,792 | 17.7% | 1,407 | 196 (13.9%) | 19 ("princess street") |
 
- Typing a street name sets the start or end point. It matches the names already in the city pack on the device, so it adds no data file and sends nothing.
- Only named streets can be found. "With a name" counts segments, footways and steps included, so it is not the share of walkable length. Tapping the map, the crosshair and "use my location" still set any point.
- A stretch is a set of same-named segments that touch each other. Pieces that do not touch are separate results, told apart by distance and direction from the map centre. For a name with many stretches the nearest come first, and at most 8 results show.
- Timing in Node, median of 3: building the index takes 12.6 ms (Kuala Lumpur) to 27.7 ms (Manchester), and one search for "st" takes under 1 ms. On a phone: ~1 s (timed by hand with a stopwatch).

## 6. Performance and hosting

Source: `docs/app-checks.md`.

- Graph build in Node, median of three (parse + build): Seattle 342 ms, Kuala Lumpur 216 ms, London 263 ms, Berlin 317 ms, Manchester 438 ms. Target: under 3 s for about 22,000 segments.
- Manchester (21,792 segments, 36,010 nodes, 47,777 edges) in Chrome 157 on a Lenovo Legion Slim 5: 435 ms.
- On a phone: about 1 second, timed by hand with a stopwatch on an iPhone 15 Pro (iOS 26.6.2, Chrome 157). This is the time until the route appeared, not graph build alone, and it includes human reaction time of roughly 0.2 s. Treat it as a rough check that the phone is nowhere near the 3 s target, not as a precise figure.
- Frame rate: 165 fps with effects on and with Reduced_Effects on, on the laptop. The laptop's built-in display refreshes at 165 Hz (checked 16 Nov 2026), so 165 fps is the display's cap. It shows the laptop is not struggling and says nothing about phones. Frame rate was not measured on a phone.
- Hosting: Render static site over HTTPS. Pack files are served Brotli-compressed (all 11 `/assets/` files, checked with `checkHost` on 12 Nov 2026). The first check failed because Render served the `.geojson` files as `binary/octet-stream` with no compression; the build now emits them as `.json`.
- Largest built pack files (before Brotli): Manchester segments 6.6 MB, Seattle 5.1 MB, Berlin 4.8 MB, London 4.3 MB, Kuala Lumpur 3.1 MB. Segment files as sent by Render with Brotli (measured 16 Nov 2026): Manchester 0.85 MB, Seattle 0.56 MB, Berlin 0.56 MB, London 0.50 MB, Kuala Lumpur 0.44 MB.
- Load time on a 10 Mbit/s connection: Ningbo 5.85s, Malaysia not tested, US not tested.
- Browsers tested: Chrome 157 on a Windows laptop; Chrome and Safari on an iPhone 15 Pro, iOS 26.6.2. Layouts checked at 390 x 844 and 768 px, plus keyboard use and focus order.

## 7. Privacy

- The app makes only these requests: its own files, the map tiles, the two pack files for the chosen city, and one sample-data file while Demo mode is on. Route planning and street search make no network requests.
- A typed street name stays in the input and in memory. It is not stored, logged or sent. A test stubs the network and storage and runs the search over generated input.
- It stores two things on the device (`gloam.settings.v1` and `gloam.corrections.v1`). No accounts, no cookies, no analytics.
- A saved correction holds only the street id, the report type and the date.
- The tile provider can see the area being viewed, never the routes.
- A test checks these limits by stubbing `fetch`, `XMLHttpRequest`, `WebSocket` and `sendBeacon` and running the graph, tiers, router, snapping and status code over generated input.

## 8. What the tests found

The suite has 357 tests across 61 files, including 37 numbered properties that run at least 100 generated cases each. Two real bugs came from them:

- A router property found a null route for a snap position so close to an edge end that float rounding made the piece cost vanish. The fix collapses a snap within 1 mm onto the end node and adds a regression test.
- The brightness-change limit for flicker failed when the sampled curve was checked with the real 33 ms update step. The fix lowered the dip depth to 0.25 and made the property test four steps.

## 9. Limits and what is unverified

- Street search finds named streets only: 15.6 to 32.3% of segments carry a name (section 5). Streets without a name can be set only by tapping the map, the crosshair or "use my location".
- A street can be several search results, and a result sets the point at the middle of its stretch, so on a long street the point may be far from where the walker means.
- Berlin and Manchester: the model did not beat the highway-footway baseline on walking paths.
- Kuala Lumpur and Seattle: not validated. KL has no ground truth.
- Community reports in the demo are sample data and labelled as such. Real corrections stay on the device, so no report reaches anyone else.
- Example walks are best cases.
- Not measured: load time on 10 Mbit/s from the US, China and Malaysia; whether the URL stays stable; uptime from 16 Dec to 29 Jan; frame rate on a phone.
- The site must stay up from 16 Dec to 29 Jan. Last checked: 16 Nov 2026 (`checkHost`: HTTPS, page and all 11 pack files reachable, Brotli). Recheck before submitting.

## 10. What I would do next

- Street search that joins the pieces of one street into a single result and lets the walker choose a point along it. Today a street can come back as several results, and a result sets the point at the middle of its stretch.
- Ground truth for Kuala Lumpur, to test the case the app is built for.
- More cities, each with its own validation, starting with ones that have enough tagged unlit streets.
- A wider area per city. Today each city is limited to its pack.