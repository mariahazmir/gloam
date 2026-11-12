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

Required text: "© OpenStreetMap contributors", plus OpenFreeMap and OpenMapTiles credits.

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

## 9. Hosting results (task 16.2 fills this section)

Placeholder. Task 16.2 runs `app/scripts/checkHost.ts` against the deployed Render URL and records the results here. Req 15.5, 17.3, 17.5, 17.6.

- Deployed URL:
- [ ] Pack files compressed (Content-Encoding: gzip or Brotli)
  - Content-Encoding per pack file:
- [ ] HTTPS
- [ ] URL stable
- [ ] Up from 16 Dec to 29 Jan (recheck before submitting)
  - Rechecked on:
- [ ] Loads within 10 s on 10 Mbit/s from the US
  - Result / date / tester:
- [ ] Loads within 10 s on 10 Mbit/s from China
  - Result / date / tester:
- [ ] Loads within 10 s on 10 Mbit/s from Malaysia
  - Result / date / tester:
- Reference phone used for the fps and graph-time checks:
