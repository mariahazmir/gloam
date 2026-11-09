"""Command line for the Gloam pipeline (R5.2, R7.6, R7.10, R9.1 to R9.7).

Run as `python -m gloam_pipeline <command> [options]`. Each command runs only its own
stage, reading the files earlier stages left on disk. Only this module and io.py touch
files or stdout; every calculation is done by the pure modules.

Exit status: 0 success; 1 data error; 2 missing or invalid argument or input file
(including a ground-truth city that does not match the model); 3 validation written
with the ground-truth section "not run".
"""

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from . import io as gio
from .artifacts import (
    CityArtifact,
    CityReport,
    FeaturesArtifact,
    city_from_dict,
    city_to_dict,
    features_from_dict,
    features_to_dict,
    model_from_dict,
)
from .classify import classify
from .config import PipelineConfig
from .errors import GloamError, InputFileError, InvalidArgumentError
from .export import build_buildings_collection, build_city_collection
from .features import (
    FOOTWAY_ORDER,
    HIGHWAY_ORDER,
    LANDUSE_ORDER,
    LanduseAreas,
    PointSets,
    ScaledCounts,
    raw_features,
    scale_counts,
    scale_length,
    to_vector,
)
from .model import TrainingRow, fit, predict
from .report import render_validation
from .scoring import score_segment
from .segments import build_segments
from .shift import city_proportions, city_shift, count_histograms
from .validation import (
    check_ground_truth_city,
    evaluate_ground_truth,
    hold_one_out,
    pair_rates_from_model,
    rates_from_model,
    score_methods,
    scores_by_id,
)

PROG = "python -m gloam_pipeline"
CITY_ID = re.compile(r"[a-z0-9_]{1,50}")
PACKAGE_ROOT = Path(__file__).resolve().parents[1]  # pipeline/
DEFAULT_DATA_DIR = PACKAGE_ROOT / "data"
DEFAULT_OUT_DIR = PACKAGE_ROOT.parent / "data"
DEFAULT_DOCS_DIR = PACKAGE_ROOT.parent / "docs"
_D = PipelineConfig()

FEATURE_NAMES = tuple(
    [f"highway_{h}" for h in HIGHWAY_ORDER]
    + [f"footway_{f}" for f in FOOTWAY_ORDER]
    + ["length", "bus_stops", "food_places", "shops", "buildings"]
    + [f"landuse_{u}" for u in LANDUSE_ORDER]
)


class DataFileError(GloamError):
    """An intermediate file exists but its contents are damaged or out of step (exit 1)."""


@dataclass
class Outcome:
    """What a command did; the summary is printed from this."""

    city: str
    records: int = 0
    files: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    notes: list = field(default_factory=list)  # extra lines printed before the summary
    status: int = 0


# --------------------------------------------------------------- file helpers


def _city_dir(data_dir, city_id) -> Path:
    return Path(data_dir) / city_id


def _read_artifact(path, from_dict):
    data = gio.read_json(path)
    try:
        return from_dict(data)
    except (InvalidArgumentError, KeyError, TypeError, ValueError, AttributeError) as exc:
        raise DataFileError(f"{path}: damaged contents ({exc})") from exc


def _load_city_and_features(data_dir, city_id) -> tuple[CityArtifact, FeaturesArtifact]:
    folder = _city_dir(data_dir, city_id)
    city = _read_artifact(folder / "city.json", city_from_dict)
    feats = _read_artifact(folder / "features.json", features_from_dict)
    if {s.osm_id for s in city.segments} != {r.segment_id for r in feats.raw}:
        raise DataFileError(
            f"{folder / 'features.json'}: segments do not match city.json; "
            f"rerun the features command for '{city_id}'"
        )
    return city, feats


def _vector(feats: FeaturesArtifact, i: int) -> list:
    return to_vector(feats.raw[i], feats.scaled[i], feats.length_scaled[i])


def _training_rows(city_id, city: CityArtifact, feats: FeaturesArtifact) -> list:
    label = {s.osm_id: s.label for s in city.segments}
    return [
        TrainingRow(city_id, r.segment_id, r.highway, r.footway_kind, label[r.segment_id],
                    tuple(_vector(feats, i)))
        for i, r in enumerate(feats.raw)
    ]


# --------------------------------------------------------------- geometry helpers (pure)


def _mean_point(points) -> tuple | None:
    pts = [tuple(p) for p in points]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if not pts:
        return None
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def _location(feature: dict) -> tuple | None:
    """A Point as-is; any other geometry as the mean of its outer-ring or line vertices."""
    try:
        g = feature["geometry"]
        kind, c = g["type"], g["coordinates"]
        if kind == "Point":
            pts = [c]
        elif kind in ("LineString", "MultiPoint"):
            pts = c
        elif kind == "Polygon":
            pts = c[0]
        elif kind == "MultiPolygon":
            pts = [p for poly in c for p in poly[0]]
        else:
            return None
        loc = _mean_point([(float(p[0]), float(p[1])) for p in pts])
    except (KeyError, TypeError, ValueError, IndexError):
        return None
    if loc is None or not (-180 <= loc[0] <= 180 and -90 <= loc[1] <= 90):
        return None
    return loc


def _landuse_areas(feature: dict) -> list:
    try:
        g = feature["geometry"]
        rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [
            poly[0] for poly in g["coordinates"]
        ]
        value = feature["properties"]["landuse"]
        return [(value, tuple((float(p[0]), float(p[1])) for p in ring)) for ring in rings]
    except (KeyError, TypeError, ValueError, IndexError):
        return []


# --------------------------------------------------------------- commands


def cmd_summarise(args) -> Outcome:
    dataset = gio.load_city(args.input, args.city_name)  # reads every file before any build
    merged, fp = dataset.merged, dataset.footprints
    seg = build_segments(merged.features)
    warnings = list(merged.warnings) + list(fp.warnings)

    buckets = {"bus_stop": [], "food": [], "shop": []}
    areas = []
    for position, feature in enumerate(merged.features):
        kind = classify(feature)
        if kind in buckets:
            loc = _location(feature)
            if loc is None:
                warnings.append(f"feature {position} ({kind}) has no usable location")
            else:
                buckets[kind].append(loc)
        elif kind == "landuse":
            areas.extend(_landuse_areas(feature))
    centroids = [c for c in (_mean_point(b.ring) for b in fp.footprints) if c is not None]

    city = CityArtifact(
        city_name=args.city_name,
        segments=seg.segments,
        points=PointSets(tuple(buckets["bus_stop"]), tuple(buckets["food"]),
                         tuple(buckets["shop"]), tuple(centroids)),
        footprints=fp.footprints,
        landuse=LanduseAreas(tuple(areas)),
        report=CityReport(
            counts=dict(merged.counts), unmatched=merged.unmatched, duplicates=merged.duplicates,
            warnings=tuple(warnings), skipped_ways=seg.skipped_ways, closed_ways=seg.closed_ways,
            unrecognised_lit=dict(seg.unrecognised_lit),
        ),
    )
    out = _city_dir(args.data_dir, args.city_id) / "city.json"
    gio.write_json(out, city_to_dict(city))

    labels = [s.label for s in seg.segments]
    notes = ["counts by type (exclusive):"]
    notes += [f"  {k}: {v}" for k, v in merged.counts.items()]
    notes += [
        f"  unmatched: {merged.unmatched}",
        f"  duplicates removed: {merged.duplicates}",
        f"  building footprints: {len(fp.footprints)}",
        f"  skipped ways: {len(seg.skipped_ways)}, closed ways: {seg.closed_ways}",
        "  segments by label: "
        + ", ".join(f"{k}={labels.count(k)}" for k in ("tagged_lit", "tagged_unlit", "untagged")),
    ]
    notes += [f"  unrecognised lit value {v!r}: {n}" for v, n in sorted(seg.unrecognised_lit.items())]
    return Outcome(args.city_id, len(merged.features) + merged.duplicates, [out], warnings, notes)


def cmd_features(args) -> Outcome:
    cfg = PipelineConfig(feature_distance_m=args.feature_distance_m)
    city = _read_artifact(_city_dir(args.data_dir, args.city_id) / "city.json", city_from_dict)
    raw = raw_features(city.segments, city.points, city.landuse, cfg.feature_distance_m)
    flags = [r.missing for r in raw]
    cols = {k: scale_counts([getattr(r, k) for r in raw], flags)
            for k in ("bus_stops", "food_places", "shops", "buildings")}
    scaled = tuple(
        ScaledCounts(cols["bus_stops"][i], cols["food_places"][i], cols["shops"][i],
                     cols["buildings"][i])
        for i in range(len(raw))
    )
    length = tuple(scale_length([r.length_m for r in raw], flags))
    out = _city_dir(args.data_dir, args.city_id) / "features.json"
    gio.write_json(out, features_to_dict(
        FeaturesArtifact(cfg.feature_distance_m, tuple(raw), scaled, length)))
    warnings = [f"segment {r.segment_id}: features could not be computed; defaults used"
                for r in raw if r.missing]
    return Outcome(args.city_id, len(raw), [out], warnings)


def cmd_train(args) -> Outcome:
    cfg = PipelineConfig(untagged_weight=args.untagged_weight, seed=args.seed)
    cities = sorted(set(args.cities))
    rows, hists = [], {}
    for c in cities:
        city, feats = _load_city_and_features(args.data_dir, c)
        rows += _training_rows(c, city, feats)
        hists[c] = count_histograms(feats.raw)
    model, log = fit(rows, FEATURE_NAMES, hists, cfg.untagged_weight, cfg.seed, args.held_out)
    model_path, log_path = Path(args.data_dir) / "model.json", Path(args.data_dir) / "train.log"
    gio.write_json(model_path, model)
    gio.write_text(log_path, log)
    return Outcome(",".join(cities), len(rows), [model_path, log_path])


def cmd_validate(args) -> Outcome:
    cfg = PipelineConfig(min_unlit_city=args.min_unlit_city,
                         min_unlit_road_type=args.min_unlit_road_type,
                         untagged_weight=args.untagged_weight)
    cities = sorted(set(args.cities))
    gt_rows = gt_model = None
    if args.ground_truth:
        # Checked before any work; nothing has been written at this point.
        model_path = Path(args.data_dir) / "model.json"
        _read_artifact(model_path, model_from_dict)  # shape check
        gt_model = gio.read_json(model_path)
        check_ground_truth_city(args.ground_truth_city, gt_model.get("held_out_city"))
        gt_city, gt_feats = _load_city_and_features(args.data_dir, args.ground_truth_city)
        gt_rows = _training_rows(args.ground_truth_city, gt_city, gt_feats)

    rows_by_city, hists = {}, {}
    for c in cities:
        city, feats = _load_city_and_features(args.data_dir, c)
        rows_by_city[c] = _training_rows(c, city, feats)
        hists[c] = count_histograms(feats.raw)
    result = hold_one_out(rows_by_city, hists, FEATURE_NAMES, cfg.min_unlit_city,
                          cfg.min_unlit_road_type, cfg.untagged_weight, cfg.seed)

    gt = None
    if args.ground_truth:
        text, problem = gio.read_text_optional(args.ground_truth)
        scored = score_methods(gt_model, rates_from_model(gt_model),
                               pair_rates_from_model(gt_model), gt_rows)
        gt = evaluate_ground_truth(text, scores_by_id(scored), problem or "missing")

    out = Path(args.docs_dir) / "validation.md"
    gio.write_text(out, render_validation(result, gt))

    warnings = [f"city {s.city} skipped: {s.tagged_unlit} tagged_unlit segments, "
                f"threshold {s.threshold}" for s in result.skipped_cities]
    outcome = Outcome(",".join(cities), sum(len(r) for r in rows_by_city.values()), [out], warnings)
    if gt is not None and gt.status != "run":
        warnings.append(f"ground truth not run: {gt.reason}")
        outcome.status = 3
    return outcome


def cmd_export(args) -> Outcome:
    cfg = PipelineConfig(
        high_value=args.high_value, low_value=args.low_value,
        tagged_confidence=args.tagged_confidence,
        max_city_file_kb=args.max_city_file_kb, max_buildings_file_kb=args.max_buildings_file_kb,
    )
    city, feats = _load_city_and_features(args.data_dir, args.city_id)
    model_path = Path(args.data_dir) / "model.json"
    artifact = _read_artifact(model_path, model_from_dict)
    model = gio.read_json(model_path)
    if list(artifact.feature_names) != list(FEATURE_NAMES):
        raise DataFileError(f"{model_path}: feature names do not match this pipeline; retrain")

    shift = city_shift(city_proportions(feats.raw), artifact.training_histograms)
    probs = predict(model, [_vector(feats, i) for i in range(len(feats.raw))])
    by_id = {s.osm_id: s for s in city.segments}
    segments = [by_id[r.segment_id] for r in feats.raw]
    scores = [
        score_segment(segments[i].label, probs[i], feats.scaled[i], r.missing, shift, cfg)
        for i, r in enumerate(feats.raw)
    ]
    seg_doc = build_city_collection(city.city_name, segments, scores, shift, cfg)
    bld_doc = build_buildings_collection(city.city_name, city.footprints, cfg)

    seg_path = Path(args.out_dir) / f"{args.city_id}.segments.geojson"
    bld_path = Path(args.out_dir) / f"{args.city_id}.buildings.geojson"
    seg_kb = gio.write_geojson_checked(seg_path, seg_doc, cfg.max_city_file_kb)
    bld_kb = gio.write_geojson_checked(bld_path, bld_doc, cfg.max_buildings_file_kb)
    notes = [f"distribution shift: {shift:.3f}", f"{seg_path.name}: {seg_kb:.1f} KB",
             f"{bld_path.name}: {bld_kb:.1f} KB"]
    return Outcome(args.city_id, len(segments), [seg_path, bld_path], [], notes)


# --------------------------------------------------------------- parser


def _city_id(value: str) -> str:
    if not CITY_ID.fullmatch(value):
        raise argparse.ArgumentTypeError(
            f"invalid city id {value!r}; allowed: lowercase letters, digits and _, 1 to 50 characters"
        )
    return value


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        description="Gloam pipeline: turns OpenStreetMap extracts into per-city estimates of "
                    "which streets are likely well lit. Run one stage at a time.",
    )
    sub = parser.add_subparsers(dest="command", required=True, metavar="command")

    def add(name, purpose, func):
        p = sub.add_parser(name, prog=f"{PROG} {name}", help=purpose, description=purpose)
        p.set_defaults(func=func)
        p.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR),
                       help="folder for intermediate files (default: pipeline/data)")
        return p

    p = add("summarise", "Load OSM GeoJSON files for a city, remove duplicates, build segments, "
            "print counts and write city.json.", cmd_summarise)
    p.add_argument("--city-id", required=True, type=_city_id, help="city folder name, [a-z0-9_]{1,50}")
    p.add_argument("--city-name", required=True, help="display name, 1 to 100 characters")
    p.add_argument("--input", required=True, nargs="+", metavar="FILE", help="1 to 50 GeoJSON files")

    p = add("features", "Build per-segment features from city.json and write features.json.",
            cmd_features)
    p.add_argument("--city-id", required=True, type=_city_id, help="city folder name")
    p.add_argument("--feature-distance-m", type=float, default=_D.feature_distance_m,
                   help="reach for nearby places, 10 to 1000 (default: %(default)s)")

    p = add("train", "Fit the lit-probability model on cities' features and write model.json "
            "and train.log.", cmd_train)
    p.add_argument("--cities", required=True, nargs="+", type=_city_id, metavar="ID",
                   help="1 to 20 city ids")
    p.add_argument("--held-out", type=_city_id, default=None, metavar="ID",
                   help="city to leave out of training (default: none)")
    p.add_argument("--untagged-weight", type=float, default=_D.untagged_weight,
                   help="weight of untagged rows, between 0 and 1 (default: %(default)s)")
    p.add_argument("--seed", type=int, default=_D.seed, help="recorded seed (default: %(default)s)")

    p = add("validate", "Run hold-one-out validation (and optional ground-truth accuracy) and "
            "write docs/validation.md.", cmd_validate)
    p.add_argument("--cities", required=True, nargs="+", type=_city_id, metavar="ID",
                   help="1 to 20 city ids")
    p.add_argument("--ground-truth", default=None, metavar="FILE",
                   help="hand-labelled CSV with columns osm_id,label")
    p.add_argument("--ground-truth-city", type=_city_id, default=None, metavar="ID",
                   help="city the CSV describes; must equal model.json held_out_city")
    p.add_argument("--min-unlit-city", type=int, default=_D.min_unlit_city,
                   help="minimum tagged_unlit segments per city (default: %(default)s)")
    p.add_argument("--min-unlit-road-type", type=int, default=_D.min_unlit_road_type,
                   help="minimum tagged_unlit segments per road type (default: %(default)s)")
    p.add_argument("--untagged-weight", type=float, default=_D.untagged_weight,
                   help="weight of untagged rows (default: %(default)s)")
    p.add_argument("--docs-dir", default=str(DEFAULT_DOCS_DIR),
                   help="folder for validation.md (default: docs)")

    p = add("export", "Score a city and write its segments and buildings GeoJSON files.", cmd_export)
    p.add_argument("--city-id", required=True, type=_city_id, help="city folder name")
    p.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR),
                   help="folder for the GeoJSON files (default: data)")
    p.add_argument("--high-value", type=float, default=_D.high_value,
                   help="lit probability of tagged-lit segments (default: %(default)s)")
    p.add_argument("--low-value", type=float, default=_D.low_value,
                   help="lit probability of tagged-unlit segments (default: %(default)s)")
    p.add_argument("--tagged-confidence", type=float, default=_D.tagged_confidence,
                   help="confidence of tagged segments (default: %(default)s)")
    p.add_argument("--max-city-file-kb", type=float, default=_D.max_city_file_kb,
                   help="size limit of the segments file in KB (default: %(default)s)")
    p.add_argument("--max-buildings-file-kb", type=float, default=_D.max_buildings_file_kb,
                   help="size limit of the buildings file in KB (default: %(default)s)")
    return parser


def _check_args(parser, args) -> None:
    if args.command == "validate":
        if args.ground_truth and not args.ground_truth_city:
            parser.error("argument --ground-truth-city is required with --ground-truth")
        if args.ground_truth_city and not args.ground_truth:
            parser.error("argument --ground-truth is required with --ground-truth-city")


def _print_summary(command: str, o: Outcome) -> None:
    for w in o.warnings:  # one per line, before the summary
        print(f"warning: {w}")
    print(f"command: {command}")
    print(f"city: {o.city}")
    print(f"records processed: {o.records}")
    for line in o.notes:
        print(line)
    print("files written:")
    for f in o.files:
        print(f"  {f}")
    print(f"warnings: {len(o.warnings)}")


def main(argv=None) -> int:
    """Run one command; returns 0 success, 1 data error, 2 argument or input error, 3 gt not run."""
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
        _check_args(parser, args)
    except SystemExit as exc:  # -h gives 0; argparse errors give 2
        return exc.code if isinstance(exc.code, int) else 0
    try:
        outcome = args.func(args)
    except (InvalidArgumentError, InputFileError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except (GloamError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    _print_summary(args.command, outcome)
    return outcome.status
