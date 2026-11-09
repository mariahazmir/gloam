"""Dict <-> dataclass conversions for the intermediate files (pure, no I/O).

city.json, features.json and model.json. Covers R8.2, R9.2.
Each `*_from_dict` checks the shape and raises InvalidArgumentError naming the
offending key, so a damaged file never becomes a half-built object.
"""

import math
from dataclasses import dataclass, field

from .errors import InvalidArgumentError
from .features import LanduseAreas, PointSets, RawFeatures, ScaledCounts
from .loader import BuildingFootprint
from .segments import Segment

SCHEMA_VERSION = 1
POINT_KEYS = ("bus_stops", "food_places", "shops", "buildings")


# --- shape helpers -----------------------------------------------------------


def _get(d: object, key: str, kind, where: str):
    """Return d[key] if d is a dict holding a value of `kind` (bool never counts as a number)."""
    if not isinstance(d, dict) or key not in d:
        raise InvalidArgumentError(f"{where}.{key}", "missing", "a value")
    v = d[key]
    numeric = kind is float or kind == (int, float)
    if isinstance(v, bool) and kind is not bool:
        ok = False
    elif kind is float:
        ok = isinstance(v, (int, float)) and math.isfinite(v)
    else:
        ok = isinstance(v, kind)
    if not ok:
        want = "a finite number" if numeric else getattr(kind, "__name__", str(kind))
        raise InvalidArgumentError(f"{where}.{key}", v, want)
    return float(v) if kind is float else v


def _points(raw: object, name: str) -> tuple:
    if not isinstance(raw, list):
        raise InvalidArgumentError(name, raw, "a list of [lon, lat] pairs")
    out = []
    for p in raw:
        if not (isinstance(p, (list, tuple)) and len(p) == 2):
            raise InvalidArgumentError(name, p, "a [lon, lat] pair")
        out.append((_get({"v": p[0]}, "v", float, name), _get({"v": p[1]}, "v", float, name)))
    return tuple(out)


def _list(d: dict, key: str, where: str) -> list:
    return _get(d, key, list, where)


# --- city.json ---------------------------------------------------------------


@dataclass(frozen=True)
class CityReport:
    """What the summarise stage found and left out."""

    counts: dict = field(default_factory=dict)  # exclusive count per summary type
    unmatched: int = 0
    duplicates: int = 0
    warnings: tuple = ()
    skipped_ways: tuple = ()  # (osm_id or None, reason)
    closed_ways: int = 0
    unrecognised_lit: dict = field(default_factory=dict)


@dataclass(frozen=True)
class CityArtifact:
    city_name: str
    segments: tuple
    points: PointSets
    footprints: tuple
    landuse: LanduseAreas
    report: CityReport


def city_to_dict(city: CityArtifact) -> dict:
    r = city.report
    return {
        "schema_version": SCHEMA_VERSION,
        "city_name": city.city_name,
        "segments": [
            {"osm_id": s.osm_id, "name": s.name, "highway": s.highway, "footway": s.footway,
             "coords": [list(c) for c in s.coords], "length_m": s.length_m, "label": s.label}
            for s in city.segments
        ],
        "points": {k: [list(p) for p in getattr(city.points, k)] for k in POINT_KEYS},
        "footprints": [
            {"osm_id": b.osm_id, "ring": [list(p) for p in b.ring], "height_tag": b.height_tag}
            for b in city.footprints
        ],
        "landuse": [{"landuse": v, "ring": [list(p) for p in ring]} for v, ring in city.landuse.areas],
        "report": {
            "counts": dict(r.counts), "unmatched": r.unmatched, "duplicates": r.duplicates,
            "warnings": list(r.warnings),
            "skipped_ways": [[i, why] for i, why in r.skipped_ways],
            "closed_ways": r.closed_ways, "unrecognised_lit": dict(r.unrecognised_lit),
        },
    }


def city_from_dict(d: dict) -> CityArtifact:
    where = "city"
    _check_version(d, where)
    segments = tuple(
        Segment(
            osm_id=_get(s, "osm_id", int, "segment"), name=_get(s, "name", str, "segment"),
            highway=_get(s, "highway", str, "segment"), footway=_get(s, "footway", str, "segment"),
            coords=_points(s.get("coords"), "segment.coords"),
            length_m=_get(s, "length_m", float, "segment"), label=_get(s, "label", str, "segment"),
        )
        for s in _list(d, "segments", where)
    )
    pts = _get(d, "points", dict, where)
    points = PointSets(**{k: _points(pts.get(k), f"points.{k}") for k in POINT_KEYS})
    footprints = tuple(
        BuildingFootprint(
            _get(b, "osm_id", int, "footprint"), _points(b.get("ring"), "footprint.ring"),
            _get(b, "height_tag", str, "footprint"),
        )
        for b in _list(d, "footprints", where)
    )
    landuse = LanduseAreas(tuple(
        (_get(a, "landuse", str, "landuse"), _points(a.get("ring"), "landuse.ring"))
        for a in _list(d, "landuse", where)
    ))
    r = _get(d, "report", dict, where)
    skipped = []
    for item in _list(r, "skipped_ways", "report"):
        if not (isinstance(item, list) and len(item) == 2 and isinstance(item[1], str)
                and (item[0] is None or (isinstance(item[0], int) and not isinstance(item[0], bool)))):
            raise InvalidArgumentError("report.skipped_ways", item, "[osm_id or null, reason]")
        skipped.append((item[0], item[1]))
    report = CityReport(
        counts=_get(r, "counts", dict, "report"), unmatched=_get(r, "unmatched", int, "report"),
        duplicates=_get(r, "duplicates", int, "report"),
        warnings=tuple(_get({"v": w}, "v", str, "report.warnings") for w in _list(r, "warnings", "report")),
        skipped_ways=tuple(skipped), closed_ways=_get(r, "closed_ways", int, "report"),
        unrecognised_lit=_get(r, "unrecognised_lit", dict, "report"),
    )
    return CityArtifact(_get(d, "city_name", str, where), segments, points, footprints, landuse, report)


# --- features.json -----------------------------------------------------------


@dataclass(frozen=True)
class FeaturesArtifact:
    feature_distance_m: float
    raw: tuple  # RawFeatures, sorted by segment id
    scaled: tuple  # ScaledCounts, same order
    length_scaled: tuple  # one value per segment, same order
    shift: float | None = None  # set once a model exists to compare against


def features_to_dict(f: FeaturesArtifact) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "feature_distance_m": f.feature_distance_m,
        "raw": [
            {"segment_id": r.segment_id, "highway": r.highway, "footway_kind": r.footway_kind,
             "length_m": r.length_m, "bus_stops": r.bus_stops, "food_places": r.food_places,
             "shops": r.shops, "buildings": r.buildings, "landuse": r.landuse, "missing": r.missing}
            for r in f.raw
        ],
        "scaled": [
            {"bus_stops": s.bus_stops, "food_places": s.food_places, "shops": s.shops,
             "buildings": s.buildings}
            for s in f.scaled
        ],
        "length_scaled": list(f.length_scaled),
        "shift": f.shift,
    }


def features_from_dict(d: dict) -> FeaturesArtifact:
    where = "features"
    _check_version(d, where)
    raw = tuple(
        RawFeatures(
            _get(r, "segment_id", int, "raw"), _get(r, "highway", str, "raw"),
            _get(r, "footway_kind", str, "raw"), _get(r, "length_m", float, "raw"),
            _get(r, "bus_stops", int, "raw"), _get(r, "food_places", int, "raw"),
            _get(r, "shops", int, "raw"), _get(r, "buildings", int, "raw"),
            _get(r, "landuse", str, "raw"), _get(r, "missing", bool, "raw"),
        )
        for r in _list(d, "raw", where)
    )
    scaled = tuple(
        ScaledCounts(*(_get(s, k, float, "scaled") for k in POINT_KEYS))
        for s in _list(d, "scaled", where)
    )
    length_scaled = tuple(
        _get({"v": v}, "v", float, "length_scaled") for v in _list(d, "length_scaled", where)
    )
    if not len(raw) == len(scaled) == len(length_scaled):
        raise InvalidArgumentError(
            "features", f"{len(raw)} raw, {len(scaled)} scaled, {len(length_scaled)} length_scaled",
            "the same number of entries in raw, scaled and length_scaled",
        )
    shift = d.get("shift")
    if shift is not None:
        shift = _get(d, "shift", float, where)
    return FeaturesArtifact(_get(d, "feature_distance_m", float, where), raw, scaled, length_scaled, shift)


# --- model.json --------------------------------------------------------------


@dataclass(frozen=True)
class ModelArtifact:
    feature_names: tuple
    intercept: float
    coefficients: tuple
    training_cities: tuple
    held_out_city: str | None
    untagged_weight: float
    seed: int
    highway_rates: dict
    pair_rates: dict  # {highway: {footway_kind: rate}}
    overall_lit_rate: float
    unseen_highway_types: int
    training_histograms: dict  # {feature: [bin proportions]}


def model_to_dict(m: ModelArtifact) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "feature_names": list(m.feature_names),
        "intercept": m.intercept,
        "coefficients": list(m.coefficients),
        "training_cities": list(m.training_cities),
        "held_out_city": m.held_out_city,
        "untagged_weight": m.untagged_weight,
        "seed": m.seed,
        "highway_rates": dict(m.highway_rates),
        "pair_rates": {h: dict(k) for h, k in m.pair_rates.items()},
        "overall_lit_rate": m.overall_lit_rate,
        "unseen_highway_types": m.unseen_highway_types,
        "training_histograms": {f: list(p) for f, p in m.training_histograms.items()},
    }


def model_from_dict(d: dict) -> ModelArtifact:
    where = "model"
    _check_version(d, where)
    names = tuple(_get({"v": v}, "v", str, "feature_names") for v in _list(d, "feature_names", where))
    coefs = tuple(_get({"v": v}, "v", float, "coefficients") for v in _list(d, "coefficients", where))
    if len(names) != len(coefs):
        raise InvalidArgumentError(
            "coefficients", f"{len(coefs)} values", f"one per feature name ({len(names)})"
        )
    held = d.get("held_out_city")
    if held is not None:
        held = _get(d, "held_out_city", str, where)
    pairs = {}
    for h, kinds in _get(d, "pair_rates", dict, where).items():
        pairs[h] = {k: _get(kinds, k, float, f"pair_rates.{h}") for k in kinds}
    hist = {
        f: tuple(_get({"v": v}, "v", float, f"training_histograms.{f}") for v in p)
        for f, p in _get(d, "training_histograms", dict, where).items()
    }
    rates = _get(d, "highway_rates", dict, where)
    return ModelArtifact(
        feature_names=names,
        intercept=_get(d, "intercept", float, where),
        coefficients=coefs,
        training_cities=tuple(
            _get({"v": v}, "v", str, "training_cities") for v in _list(d, "training_cities", where)
        ),
        held_out_city=held,
        untagged_weight=_get(d, "untagged_weight", float, where),
        seed=_get(d, "seed", int, where),
        highway_rates={h: _get(rates, h, float, "highway_rates") for h in rates},
        pair_rates=pairs,
        overall_lit_rate=_get(d, "overall_lit_rate", float, where),
        unseen_highway_types=_get(d, "unseen_highway_types", int, where),
        training_histograms={f: list(p) for f, p in hist.items()},
    )


def _check_version(d: object, where: str) -> None:
    if _get(d, "schema_version", int, where) != SCHEMA_VERSION:
        raise InvalidArgumentError(
            f"{where}.schema_version", d["schema_version"], f"version {SCHEMA_VERSION}"
        )
