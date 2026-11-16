# Gloam

*Roam the Gloam.*

**Gloam** is a haunted map for night walkers. It guesses which streets are
glowing, which are flickering, and which are swallowed by fog, then plans a
route that trades a few extra minutes for better light.

Built with Kiro for **Kiroween 2026** (Costume Contest).

**Live app:** [Click here!](https://gloam.tapau.me/)

**Demo video:** [YouTube link coming soon]

## The problem

Most cities don't keep a public record of which streets are lit. 
So Gloam does some detective work: it reads clues from the map
(road type, bus stops, food places, shops, how packed the buildings are) and
makes an educated guess.

## What you'll see

- **Steady glow:** confirmed lit by people who walked it
- **Flicker:** a guess. The more it flickers, the less sure Gloam is
- **Fog:** likely dark, or not enough to go on
- **Lantern path:** your chosen way home

Think Gloam got a street wrong? Tap once to correct it. Enough agreeing
reports and the glow updates. Old reports fade.

## Honest by design

Gloam estimates which streets are likely well lit from map data. Estimates can
be wrong, and Gloam can't tell you whether a route is safe. Trust your
surroundings.

## Your secrets stay with you

No accounts, no sign-in. Where you start, where you're going and your route
never leave your device.

## Run it

The web app lives in `app/`. See [The app](#the-app) below for setup, tests,
credits and privacy. The offline pipeline is described under
[Pipeline notes](#pipeline-notes).

## Built with Kiro

Specs, steering docs and hooks live in [`.kiro/`](.kiro/). The story of how
Kiro helped build this is in [`docs/kiro-log.md`](docs/kiro-log.md).

## Data credits

Map data © OpenStreetMap contributors, available under the
[Open Database License (ODbL)](https://www.openstreetmap.org/copyright).

## License

MIT. See [LICENSE](LICENSE).

## Pipeline notes

The offline pipeline turns OpenStreetMap extracts into per-street estimates of
which streets are likely well lit. Run it from the `pipeline/` folder. Each
command runs one stage and reads the files the earlier stage left in
`pipeline/data/`.

```
python -m gloam_pipeline summarise --city-id kl --city-name "Kuala Lumpur" --input data/raw/kl_core.geojson
python -m gloam_pipeline summarise --city-id london --city-name "London" --input data/raw/london_core_a.geojson data/raw/london_core_b.geojson
python -m gloam_pipeline summarise --city-id berlin --city-name "Berlin" --input data/raw/berlin_core.geojson
python -m gloam_pipeline summarise --city-id manchester --city-name "Manchester" --input data/raw/manchester_core.geojson
python -m gloam_pipeline summarise --city-id seattle --city-name "Seattle" --input data/raw/seattle_core.geojson

python -m gloam_pipeline features --city-id kl
python -m gloam_pipeline features --city-id london
python -m gloam_pipeline features --city-id berlin
python -m gloam_pipeline features --city-id manchester
python -m gloam_pipeline features --city-id seattle

python -m gloam_pipeline train --cities kl london berlin manchester seattle --held-out kl
python -m gloam_pipeline validate --cities kl london berlin manchester seattle

python -m gloam_pipeline export --city-id kl --out-dir ..\data
python -m gloam_pipeline export --city-id london --out-dir ..\data
python -m gloam_pipeline export --city-id berlin --out-dir ..\data
python -m gloam_pipeline export --city-id manchester --out-dir ..\data
python -m gloam_pipeline export --city-id seattle --out-dir ..\data
```

- `summarise` reads 1 to 50 GeoJSON files, removes duplicates, builds street
  segments and writes `city.json`.
- `features` builds per-segment features and writes `features.json`.
- `train` fits the lit-probability model and writes `model.json` and `train.log`.
- `validate` runs hold-one-out validation and writes `docs/validation.md`. The
  ground-truth CSV (columns `osm_id,label`) is optional. Its city must match
  the `--held-out` city used in `train`.
- `export` scores a city and writes `<city>.segments.geojson` and
  `<city>.buildings.geojson` to `data/`.

Run any command with `-h` to see every option and its default.

Exit codes: 0 done, 1 data error, 2 missing or invalid argument or file, 3
validation written with the ground-truth section marked "not run".

Buildings without a usable height tag are drawn at a default height of 8.0 m
(config field `default_building_height_m`). That height is an assumption, not
a measurement.

Every score is an estimate from map data, shown with a confidence. The files
in `data/` are sample data.

## The app

Live app: https://gloam.tapau.me/

The app in `app/` is a dark 2.5D map built with TypeScript, Vite and
MapLibre GL JS. It loads small precomputed city packs from `data/`, draws each
street as glow, flicker or fog, and plans routes in your browser. A slider
trades walking distance against dread, so you can see a shorter route next to
one that favours better-lit streets. Every score is an estimate from map data,
shown with its confidence. There is a reduced-effects switch for people who
want no flicker or animation.

### Run and test the app

Run these from the `app/` folder:

```
npm ci
npm run dev
npx tsc --noEmit
npx vitest --run
```

- `npm ci` installs the exact dependencies from `package-lock.json`.
- `npm run dev` starts the Vite dev server and prints the local address.
- `npx tsc --noEmit` type-checks the code.
- `npx vitest --run` runs the unit and property-based tests once.

A GitHub Pages build is available with `npm run build:pages` (base path `/gloam/`).

### Not a safety tool

Gloam does not say that any street or route is safe. It shows which streets
are likely better lit or likely darker than most streets in the same city, and
it can be wrong. Treat it as one input and trust your surroundings.

Disclaimer, shown on every screen that shows a route:

> Gloam estimates which streets are likely well lit from map data. Estimates can
> be wrong, and Gloam can't tell you whether a route is safe. Trust your
> surroundings.

### Privacy

- No accounts and no sign-in.
- Start points, end points and routes stay on your device. Routing runs in the
  browser, and no route request is sent over the network.
- Corrections are kept in your browser's local storage only. Each one holds the
  street segment id, the report type and the date. It holds no name, device
  identifier or location trail.
- The map tile provider can see the area you are viewing, as with any web map.
  It does not see your routes or your start and end points.

### App data credits

- Map data © OpenStreetMap contributors, under the
  [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
- Map tiles from [OpenFreeMap](https://openfreemap.org).
- Tile schema and vector data from [OpenMapTiles](https://openmaptiles.org).
- Fonts bundled with the app, both under the SIL Open Font License 1.1:
  Caprasimo (Copyright 2023 The Caprasimo Project Authors) and DM Sans
  (Copyright 2014 The DM Sans Project Authors). Full copyright lines and licence
  text are in [docs/font-licences.txt](docs/font-licences.txt).

The app shows these three attributions on the map wherever it appears. The city
packs in `data/` and the community totals in the demo are sample data and are
labelled that way in the app.
