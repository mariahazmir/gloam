# Gloam

*Roam the Gloam.*

**Gloam** is a haunted map for night walkers. It guesses which streets are
glowing, which are flickering, and which are swallowed by fog, then plans a
route that trades a few extra minutes for better light.

Built with [Kiro](https://kiro.dev) for **Kiroween 2026** (Costume Contest 🎃).

**[Walk into the Gloam →](https://gloam.tapau.me/)**  ·  **Demo video:** [YouTube link coming soon]

## Why I made this

I'm a city girl, born and raised in Kuala Lumpur, and I LOVE my city. I love cafe-hopping, taking pics, playing dress-up, and I take
public transport because driving in KL is a traffic _nightmare_. But public
transport only takes you so far, so the last bit is usually on foot. More than
once my friends and I have ended up in a dark, sketchy walkway and thought, well,
*nope*.

Then I came to Ningbo on a study exchange, and suddenly lit walkways were EVERYWHERE.
It's such an easy city to walk at night. So I started wondering: why can't KL 
have that feeling too?

Thing is, KL doesn't have the data. In OpenStreetMap, only about 0.8% of KL's
vehicle roads are tagged as lit. Night-walking apps usually lean on lighting
records that already exist, so cities like KL get left in the dark (pun-intended, wink wink).

So Gloam does some detective work instead. It reads clues from the map (road
type, bus stops, food places, shops, how packed the buildings are) and makes an
educated guess.

## What you'll see

- **Steady glow:** streets already mapped as lit
- **Flicker:** a guess. The more it flickers, the less sure Gloam is
- **Fog:** likely dark, or not enough to go on
- **Lantern path:** your chosen way home
- **Heartbeat line:** how the dread builds along your whole route, before you
  leave

Tap a street Gloam got wrong to correct it. Enough agreeing reports and the
glow updates. Old reports fade, because lights get fixed and lights break.

## Try it

1. Open the [live app](https://gloam.tapau.me/). A sample walk loads so you can
   see glow, flicker and fog straight away.
2. Pick a city: Kuala Lumpur, London, Seattle, Berlin or Manchester.
3. Type a street name (or tap the map) to set your start and end.
4. Drag the dread slider and watch the lantern path bend towards better light.
5. Switch on your own dread settings: dark, empty, enclosed, long stretches.

Prefer less flicker? There's a reduced-effects switch!

## Honest by design

Gloam estimates which streets are likely well lit from map data. Estimates can
be wrong, and Gloam can't tell you whether a route is safe. Trust your
surroundings.

It never says "safe route", it uses no crime data, and it shows its uncertainty
on the map instead of hiding it. In the cities where the data lets me check, the
model beats the simple baselines, but it does **not** beat the strongest one
(road type plus footway kind) in Berlin or Manchester. KL couldn't be validated,
so its estimates are shown as estimates. All the numbers, good and not so good,
are in [`docs/findings.md`](docs/findings.md).

## Your secrets stay with you

No accounts, no sign-in. Where you start, where you're going, what you type in
street search and your route never leave your device.

## What's next

Not built yet, but this is where I'd like Gloam to go:

- **More cities.** Today Gloam ships five fixed city packs. The method isn't
  tied to them, so I'd like to add more.
- **A map for anywhere.** Eventually, pan anywhere and get estimates, like any
  other map. That needs the pipeline to run on demand, plus checks of how well
  the guesses hold up in each new place. Where OpenStreetMap is sparse,
  confidence will be lower, and I won't claim it works everywhere until it's
  been tested.
- **Better street search**, so one street comes back as one result.
- **Real night-walk ground truth for KL.**

## Built with Kiro

Specs, steering docs and hooks live in [`.kiro/`](.kiro/). The story of how
Kiro helped build this (including where it got things wrong) is in
[`docs/kiro-log.md`](docs/kiro-log.md).

- **Specs:** two Build a Feature specs, `gloam-data-pipeline` and `gloam-web-app`.
- **Steering:** product, tech, structure and design rules that every spec inherits.
- **Hooks:** one protects my hand-written Kiro log, one runs the wording tests on
  save, and one type-checks when the agent stops.
- **Property-based testing:** Hypothesis for the pipeline, fast-check for the app.

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
