# Gloam app checks

Checklist and results file for the DOM, layout, browser, frame-rate, graph-time and hosting checks of the web app.

- Record results here, never in `docs/validation.md` (the pipeline generates that file and the app parses it).
- These checks are done by hand. The numbers below are targets to measure, not promises. A pass on one device on one day says nothing about other devices or other days.
- Leave a field empty until the check has been run. Do not fill in expected values.

## How to record a result

For each item, tick the box only after running the check, then fill in the four fields.

- Date:
- Device:
- Tester:

## 1. Focus order and visible focus (Req 4.10, 15.1)

- [x] Tab order follows the visual order: header, city picker, start/end controls, Plan/Report switch, route panel, settings, About
- [x] Every control shows a visible focus ring against the dark background
- [x] Focus is not lost after a report tap
- [x] No keyboard trap: Tab and Shift+Tab leave every panel and dialog; Escape closes dialogs

- Date: 16 Nov 2026
- Device: Lenovo Legion Slim 5, Windows 11, Chrome 157
- Tester: Mariah

### Screens and addresses (Req 18.1)

Screens: Map (`#/`), Route (`#/route`), Report (`#/report`), How Gloam guesses (`#/about`), Credits (`#/credits`).

- [ ] Tab order follows the visual order on each of the five screens
- [ ] Opening the Route, How Gloam guesses or Credits screen moves focus to its title, and the back control is reachable next
- [ ] The grab handle, the ? button, the route details button, the report link and every back control show a visible focus ring
- [ ] After the browser back button, focus is on the screen shown and not lost

- Date:
- Device:
- Tester:

## 2. Attribution not covered by any element (Req 5.3)

Required text: "© OpenStreetMap contributors", plus OpenFreeMap and OpenMapTiles credits.

- [x] Attribution is readable at 390 x 844
- [x] Attribution is readable at 768 px wide
- [x] Attribution is readable on a laptop-width window
- [x] Attribution stays readable with the route panel open, with a dialog open and with the legend open
- [x] No panel, marker, toast or the disclaimer overlaps it

- Date: 16 Nov 2026
- Device: Lenovo Legion Slim 5, Windows 11, Chrome 157; iPhone 15 Pro, iOS 26.6.2, Chrome 157
- Tester: Mariah

## 3. Layout at 390 x 844 (Req 15.2)

- [x] No horizontal scroll on the page
- [x] No control cut off or overlapping another
- [x] Disclaimer visible wherever a route is shown
- [x] Text readable without zooming

- Date: 16 Nov 2026
- Device: iPhone 15 Pro, iOS 26.6.2, Chrome 157
- Tester: Mariah

### Screens and addresses at 390 x 844 (Req 18.1 to 18.10)

- [ ] Map: no horizontal scroll, no control cut off; the sheet stops below the attribution strip
- [ ] Map: the Disclaimer is visible with the sheet expanded and collapsed while a route is shown
- [ ] Route: no horizontal scroll, no control cut off; the routing settings and the Disclaimer are visible
- [ ] Report: no horizontal scroll, no control cut off; the attribution strip and the Disclaimer are visible
- [ ] How Gloam guesses: no horizontal scroll, no control cut off
- [ ] Credits: no horizontal scroll, no control cut off
- [ ] The browser back button goes from Route, Report, How Gloam guesses and Credits to the screen before, without reloading the map or the city
- [ ] Opening `#/route`, `#/report`, `#/about` and `#/credits` directly shows that screen
- [ ] Opening `#/nonsense`, `#` and no hash shows the Map screen; `#/route/` and `#/route?x=1` show the Route screen

- Date:
- Device:
- Tester:

## 4. Layout at 768 px (Req 15.2)

- [x] No horizontal scroll on the page
- [x] No control cut off or overlapping another
- [x] Disclaimer visible wherever a route is shown

- Date: 16 Nov 2026
- Device: Lenovo Legion Slim 5, Windows 11, Chrome 157
- Tester: Mariah

### Screens and addresses at 768 px (Req 18.1 to 18.10)

- [ ] Map and Report: the sheet is a 390 px column at the left and the map is visible to its right
- [ ] Route, How Gloam guesses and Credits: the page is centred and no wider than 480 px
- [ ] Each of the five screens: no horizontal scroll, no control cut off or overlapping another
- [ ] Disclaimer visible on the Map, Route and Report screens while a route is shown
- [ ] The browser back button goes from each screen to the screen before, without reloading the map or the city
- [ ] Opening each screen's address directly shows that screen; an unknown address shows the Map screen

- Date:
- Device:
- Tester:

## 5. Browsers (Req 15.3)

### Chrome on a laptop

- [x] Map loads, a route can be planned, panels open and close
- [x] Sections 1 to 4 and 8 repeated here with no new problems

- Date: 16 Nov 2026
- Device: Lenovo Legion Slim 5, Windows 11, Chrome 157
- Tester: Mariah

### Chrome on a phone

- [x] Map loads, a route can be planned, panels open and close
- [x] Touch pan, pinch zoom and tilt work; tapping a street in Report mode selects it

- Date: 16 Nov 2026
- Device: iPhone 15 Pro, iOS 26.6.2, Chrome 157
- Tester: Mariah

### Safari on iPhone (where available)

- [x] Map loads, a route can be planned, panels open and close
- [x] Touch pan, pinch zoom and tilt work; tapping a street in Report mode selects it
- [x] Fonts and layout match Chrome at 390 x 844

- Not available? Write "not tested" and why:
- Date: 16 Nov 2026
- Device: iPhone 15 Pro, iOS 26.6.2, Safari
- Tester: Mariah

## 6. Frame rate on the reference phone (Req 5.5)

Target: 30 fps. Measure, do not assume.

- [x] Reference phone recorded below
- [x] 10 s of continuous pan, zoom and tilt on a loaded pack with 3D buildings on
- [x] Frame rate recorded (average, and lowest if the tool shows it)
- [x] Repeated with Reduced_Effects on

- Reference phone (model, OS, browser version): iPhone 16, iOS, Chrome 157 on Lenovo Legion Slim 5, Windows 11
- Pack used: Manchester
- Measured fps (effects on): 165
- Measured fps (Reduced_Effects on): 165
- Date: 16 Nov 2026
- Tester: Mariah

## 7. Graph build time for a 22,000-segment pack (Req 2.7)

Target: under 3 s.

- [x] Pack with about 22,000 segments loaded (name the pack and the exact segment count)
- [x] Build time measured from start of graph build to graph ready
- [x] Measured on the reference phone
- [x] Measured on a laptop for comparison

- Pack and segment count: Manchester, 21,792 segments (36,010 nodes, 47,777 edges)
- Time on laptop: Node (not a browser), median of 3: parse 64 ms + graph build 374 ms = 438 ms. Browser time: 435 ms
- Time on reference phone: 980 ms

- Date: 16 Nov 2026
- Device: Lenovo Legion Slim 5, Windows 11, Chrome 157; iPhone 15 Pro, iOS 26.6.2, Chrome 157
- Tester: Mariah

## 8. Keyboard use (Req 4.10, 6.10, 6.11, 10.1)

Use only the keyboard (Tab, Shift+Tab, Enter, Space, arrow keys where a control uses them).

- [x] Mode_Switch (Plan/Report) can be reached and changed
- [x] Reduced_Effects switch can be reached and toggled; flicker and animation stop when on
- [x] Report buttons can be reached and activated; the report is recorded and focus stays somewhere sensible
- [x] The state of each control (on/off, selected) is announced or visible without a mouse

- Date: 16 Nov 2026
- Device: Lenovo Legion Slim 5, Windows 11, Chrome 157
- Tester: Mariah

### Screens and addresses by keyboard (Req 18.1 to 18.5)

- [ ] The ? button opens How Gloam guesses with Enter
- [ ] The sources and licences link opens Credits with Enter
- [ ] The route details button opens Route with Enter
- [ ] The Report half of the Mode_Switch opens Report, and Plan returns to Map
- [ ] Every back control returns with Enter, and the browser back shortcut (Alt+Left) returns to the screen before
- [ ] The four routing settings on the Route screen toggle with Space, and the route redraws
- [ ] The grab handle collapses and expands the sheet with Enter and Space, and its state is announced

- Date:
- Device:
- Tester:

## 9. Hosting results (task 16.2) (Req 15.5, 17.3, 17.5, 17.6)

Run on 12 Nov 2026 (Shanghai time, +08:00) from the developer's machine with `app/scripts/checkHost.ts` against https://gloam.onrender.com/. Only what was measured is recorded. Empty items are not yet measured.

- Deployed URL: https://gloam.onrender.com/

An earlier run on 12 Nov 2026 FAILED the compression check: the packs were served as `binary/octet-stream` with no `Content-Encoding`. This was fixed in task 16.3 (built packs now emit as `.json`), and the run below is after that fix and redeploy.

### checkHost output (verbatim)

```
PASS  HTTPS
PASS  page reachable (200)
PASS  https://gloam.onrender.com/assets/berlin.buildings-BZ7f3Ivm.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/berlin.segments-ClvanFG1.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/kl.buildings-BBl4d63W.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/kl.segments-DuqRM6vd.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/london.buildings-CoN6ifw3.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/london.segments-CQkqWw-o.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/manchester.buildings-NgzPwU0d.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/manchester.segments-DXM6p5Xg.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/seattle.buildings-CJS0d0JW.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/seattle.segments-DSEsUxXh.json  reachable=true encoding=br
PASS  https://gloam.onrender.com/assets/sample-data-BdC1iuu5.json  reachable=true encoding=br
All checks passed.
```

### What the output means

- **Pack files are compressed (check passed).** All 11 files under `/assets/` (the ten city packs plus `sample-data`) are reachable and served with `Content-Encoding: br`. The path finder was tightened in task 16.3, so only real `/assets/` packs are checked; the earlier false failures for `/data/*.geojson` source paths and map-library strings are gone.
- HTTPS and the page being reachable passed.

### Checklist

- [x] HTTPS: PASS (checkHost, 12 Nov 2026)
- [x] Pack files compressed (Content-Encoding: gzip or Brotli): PASS (checkHost, 12 Nov 2026). An earlier run the same day failed (served as `binary/octet-stream`, no `Content-Encoding`); fixed in task 16.3.
  - Content-Encoding per pack file: `br` for all 11 files under `/assets/` (the ten packs plus `sample-data`, listed in the output above)
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
