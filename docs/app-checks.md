# Gloam app checks

Checklist and results file for the DOM, layout, browser, frame-rate, graph-time and hosting checks of the web app.

- Record results here, never in `docs/validation.md` (the pipeline generates that file and the app parses it).
- These checks are done by hand. The numbers below are targets to measure, not promises. A pass on one device on one day says nothing about other devices or other days.
- Leave a field empty until the check has been run. Do not fill in expected values.

## How to record a result

For each item, tick the box only after running the check, then fill in the four fields.

- Result: what you saw (numbers where the item asks for them)
- Date:
- Device:
- Tester:

## 1. Focus order and visible focus (Req 4.10, 15.1)

- [ ] Tab order follows the visual order: header, city picker, start/end controls, Plan/Report switch, route panel, settings, About
- [ ] Every control shows a visible focus ring against the dark background
- [ ] Focus is not lost after a report tap
- [ ] No keyboard trap: Tab and Shift+Tab leave every panel and dialog; Escape closes dialogs

- Result:
- Date:
- Device:
- Tester:

## 2. Attribution not covered by any element (Req 5.3)

Required text: "Â© OpenStreetMap contributors", plus OpenFreeMap and OpenMapTiles credits.

- [ ] Attribution is readable at 390 x 844
- [ ] Attribution is readable at 768 px wide
- [ ] Attribution is readable on a laptop-width window
- [ ] Attribution stays readable with the route panel open, with a dialog open and with the legend open
- [ ] No panel, marker, toast or the disclaimer overlaps it

- Result:
- Date:
- Device:
- Tester:

## 3. Layout at 390 x 844 (Req 15.2)

- [ ] No horizontal scroll on the page
- [ ] No control cut off or overlapping another
- [ ] Disclaimer visible wherever a route is shown
- [ ] Text readable without zooming

- Result:
- Date:
- Device:
- Tester:

## 4. Layout at 768 px (Req 15.2)

- [ ] No horizontal scroll on the page
- [ ] No control cut off or overlapping another
- [ ] Disclaimer visible wherever a route is shown

- Result:
- Date:
- Device:
- Tester:

## 5. Browsers (Req 15.3)

### Chrome on a laptop

- [ ] Map loads, a route can be planned, panels open and close
- [ ] Sections 1 to 4 and 8 repeated here with no new problems

- Result:
- Date:
- Device:
- Tester:

### Chrome on a phone

- [ ] Map loads, a route can be planned, panels open and close
- [ ] Touch pan, pinch zoom and tilt work; tapping a street in Report mode selects it

- Result:
- Date:
- Device:
- Tester:

### Safari on iPhone (where available)

- [ ] Map loads, a route can be planned, panels open and close
- [ ] Touch pan, pinch zoom and tilt work; tapping a street in Report mode selects it
- [ ] Fonts and layout match Chrome at 390 x 844

- Not available? Write "not tested" and why:
- Result:
- Date:
- Device:
- Tester:

## 6. Frame rate on the reference phone (Req 5.5)

Target: 30 fps. Measure, do not assume.

- [ ] Reference phone recorded below
- [ ] 10 s of continuous pan, zoom and tilt on a loaded pack with 3D buildings on
- [ ] Frame rate recorded (average, and lowest if the tool shows it)
- [ ] Repeated with Reduced_Effects on

- Reference phone (model, OS, browser version):
- Pack used:
- Measured fps (effects on):
- Measured fps (Reduced_Effects on):
- Result:
- Date:
- Tester:

## 7. Graph build time for a 22,000-segment pack (Req 2.7)

Target: under 3 s.

- [ ] Pack with about 22,000 segments loaded (name the pack and the exact segment count)
- [ ] Build time measured from start of graph build to graph ready
- [ ] Measured on the reference phone
- [ ] Measured on a laptop for comparison

- Pack and segment count:
- Time on reference phone:
- Time on laptop:
- Result:
- Date:
- Device:
- Tester:

## 8. Keyboard use (Req 4.10, 6.10, 6.11, 10.1)

Use only the keyboard (Tab, Shift+Tab, Enter, Space, arrow keys where a control uses them).

- [ ] Mode_Switch (Plan/Report) can be reached and changed
- [ ] Reduced_Effects switch can be reached and toggled; flicker and animation stop when on
- [ ] Report buttons can be reached and activated; the report is recorded and focus stays somewhere sensible
- [ ] The state of each control (on/off, selected) is announced or visible without a mouse

- Result:
- Date:
- Device:
- Tester:

## 9. Hosting results (task 16.2) (Req 15.5, 17.3, 17.5, 17.6)

Run on 12 Nov 2026 (10:01 +08:00) from the developer's machine (clock at +08:00; exact location not verified; the edge node that answered was LAX) with `app/scripts/checkHost.ts` against https://gloam.onrender.com/. Only what was measured is recorded. Empty items are not yet measured.

- Deployed URL: https://gloam.onrender.com/

### checkHost output (verbatim)

```
PASS  HTTPS
PASS  page reachable (200)
FAIL  https://gloam.onrender.com/assets/berlin.buildings-BZ7f3Ivm.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/berlin.segments-ClvanFG1.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/kl.buildings-BBl4d63W.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/kl.segments-DuqRM6vd.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/london.buildings-CoN6ifw3.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/london.segments-CQkqWw-o.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/manchester.buildings-NgzPwU0d.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/manchester.segments-DXM6p5Xg.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/seattle.buildings-CJS0d0JW.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/assets/seattle.segments-DSEsUxXh.geojson  reachable=true encoding=none
FAIL  https://gloam.onrender.com/data/berlin.buildings.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/berlin.segments.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/kl.buildings.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/kl.segments.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/london.buildings.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/london.segments.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/manchester.buildings.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/manchester.segments.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/seattle.buildings.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/data/seattle.segments.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/e.properties.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/this._data.geojson  reachable=false encoding=br
FAIL  https://gloam.onrender.com/this.workerOptions.geojson  reachable=false encoding=br
Some checks failed.
```

Extra check with `curl -I -H "Accept-Encoding: br, gzip"` on `/assets/kl.segments-DuqRM6vd.geojson`: 200, `Content-Type: binary/octet-stream`, `Content-Length: 3147509`, no `Content-Encoding` header. `/data/kl.segments.geojson` returned 404 with a 1-byte body.

### What the output means

- **Pack files are NOT compressed (check failed).** The 10 real pack files under `/assets/` (5 cities x segments and buildings) are reachable but sent with no Content-Encoding. They are served as `binary/octet-stream`, which the host most likely does not compress. KL segments alone is about 3.1 MB uncompressed. This is a real finding that needs a fix (for example, ship `.br`/`.gz` files, or change how the files are served so they get a compressible type). Not fixed in this task.
- **The 13 `reachable=false` lines are not real pack files.** The 10 `/data/*.geojson` paths are source paths found in the built JavaScript, but they do not exist on the host (404); the built files live under `/assets/` with hashed names. The 3 others (`e.properties.geojson`, `this._data.geojson`, `this.workerOptions.geojson`) are text fragments from the map library code that the script's path finder matched by mistake. The `encoding=br` on those lines is from the 404 error page, not a pack file. The script's path finder over-matches, so its exit status is "failed" even once the real files are fixed. Not changed in this task.
- HTTPS and the page being reachable passed. The `Strict-Transport-Security` header was present.

### Checklist

- [x] HTTPS: PASS (checkHost, 12 Nov 2026)
- [ ] Pack files compressed (Content-Encoding: gzip or Brotli): **FAILED on 12 Nov 2026**, see above. Re-run after the fix.
  - Content-Encoding per pack file: `none` for all 10 files under `/assets/` (listed in the output above)
- [ ] URL stable (the same URL stays in use for the whole period): not yet checked
- [ ] Up from 16 Dec to 29 Jan: **recheck before submitting.** Only a single reading on 12 Nov 2026 exists. Rechecked on: (empty)
- [ ] Loads within 10 s on 10 Mbit/s from the US: not yet measured, to be filled in by the owner
  - Result / date / tester:
- [ ] Loads within 10 s on 10 Mbit/s from China: not yet measured, to be filled in by the owner (the 12 Nov script run did not time a page load)
  - Result / date / tester:
- [ ] Loads within 10 s on 10 Mbit/s from Malaysia: not yet measured, to be filled in by the owner
  - Result / date / tester:
- Reference phone used for the fps and graph-time checks (sections 6 and 7): not yet chosen, to be filled in by the owner (model, OS, browser version)

### Prior manual test (not part of this run)

Project notes say the site was reached from Ningbo and Kuala Lumpur on 9 Nov. This was a manual reachability test, with no timings or encoding checks recorded, and it was on an earlier deploy. It does not replace the checks above.

### How to measure the load times

Use Chrome DevTools, Network tab, "Disable cache", throttling set to a custom profile of 10 Mbit/s down, then hard reload. Record the time until the map and the first city pack are shown. Repeat from each location (or through a tester there) and write the date and tester above.
