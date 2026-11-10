---
inclusion: always
---

# Gloam: Technical Rules

## Decided
- **Offline pipeline in Python:** pulls OpenStreetMap data, builds features, trains and validates the lit-probability model, and exports precomputed per-segment scores (GeoJSON or vector tiles).
- **Web front end** renders a dark 2.5D map with extruded buildings, glow, flicker and fog, and does routing on-device using the precomputed scores.
- **Property-based testing is required** for scoring, routing and correction logic (Hypothesis for Python; a comparable library for the front end).
- **Open source (MIT).** The `.kiro/` folder is committed and never added to `.gitignore`.
- **Attribution:** show "© OpenStreetMap contributors" wherever the map is shown.
- **No accounts, no route storage** (see product rules).
- **Map:** MapLibre GL JS with OpenFreeMap tiles (3D extruded buildings). Loaded successfully from China in a 8 Nov test. Show attribution for OpenFreeMap, OpenMapTiles and OpenStreetMap contributors wherever the map appears.

## Decided on 9 Nov
- Routing runs fully in the browser on the exported scores. No routing server.
- Corrections are stored on the user's device only. No hosted database in version 1. Community totals in the demo come from a bundled sample file labeled "SAMPLE DATA".
- Front end: TypeScript with Vite, no UI framework. `maplibre-gl` is the only runtime dependency. Tests: Vitest plus `fast-check` for property-based tests.
- Hosting: Render static site (free, HTTPS, CDN, Brotli) as the main URL; GitHub Pages as a fallback built with a /gloam/ base path. Tested reachable from Ningbo and Kuala Lumpur on 9 Nov. Must stay up 16 Dec to 29 Jan; recheck before submitting.
  
## How to work
- **Spec first.** If behaviour changes, update the requirements and design before the code.
- **Small diffs.** Prefer minimal, targeted edits. Don't rewrite or regenerate whole files unless asked. (Credits are limited.)
- **Pure logic stays pure.** Scoring and routing functions have no I/O and no hidden state.
- **Validate inputs.** Reject NaN, infinite and out-of-range values with a clear error that names the argument.
- **Examples need checking.** When writing example values in tests or docs, compute them by hand against the formula first.
- **Dependencies:** keep them minimal, and explain any new one before adding it.
- **Every task ends clean.** Every task ends with `npx tsc --noEmit` and `npx vitest --run` both clean, with the output shown.

## Core formulas (current)
- `raw = 1 - lit_probability`
- `dread = raw + (1 - confidence) * max(0, 0.5 - raw)`
- `route_cost = total_distance + lambda * sum(distance * dread)`
- Higher lambda must never increase the chosen route's dark exposure. Ties go to the first route in the list.