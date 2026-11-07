---
inclusion: always
---

# Gloam: Repository Structure (proposed)

```
gloam/
├── .kiro/                 # specs, steering, hooks (committed; never gitignored)
├── pipeline/              # offline Python: data pull, features, model, validation, export
│   ├── data/              # raw and intermediate files (large files gitignored, never .kiro)
│   ├── gloam_pipeline/    # importable package
│   └── tests/
├── app/                   # web front end: map, routing, UI, corrections
│   ├── src/
│   └── tests/
├── data/                  # small exported score files used by the demo (with OSM attribution)
├── docs/                  # write-up notes, validation results, demo script
├── LICENSE                # MIT
└── README.md              # what it is, how to run it, data credits, disclaimer
```

## Conventions
- One concern per module; no circular imports.
- Tests sit next to the thing they test (`pipeline/tests`, `app/tests`).
- Anything derived from OpenStreetMap carries attribution in the README and in the app.
- Validation results (accuracy against the baseline and the ground-truth set) live in `docs/validation.md`.
- Keep a running `docs/kiro-log.md` of which Kiro features were used and what they changed.