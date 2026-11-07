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

## Not decided yet (ask me before choosing; don't pick silently)
- Map library and tile source (must load from China and Malaysia, and support extruded 3D buildings).
- Front-end language and framework.
- Whether routing runs fully in the browser or needs a small hosted service.
- Hosting for the optional corrections store.

## How to work
- **Spec first.** If behaviour changes, update the requirements and design before the code.
- **Small diffs.** Prefer minimal, targeted edits. Don't rewrite or regenerate whole files unless asked. (Credits are limited.)
- **Pure logic stays pure.** Scoring and routing functions have no I/O and no hidden state.
- **Validate inputs.** Reject NaN, infinite and out-of-range values with a clear error that names the argument.
- **Examples need checking.** When writing example values in tests or docs, compute them by hand against the formula first.
- **Dependencies:** keep them minimal, and explain any new one before adding it.

## Core formulas (current)
- `raw = 1 - lit_probability`
- `dread = raw + (1 - confidence) * max(0, 0.5 - raw)`
- `route_cost = total_distance + lambda * sum(distance * dread)`
- Higher lambda must never increase the chosen route's dark exposure. Ties go to the first route in the list.