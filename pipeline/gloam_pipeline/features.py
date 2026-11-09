"""Feature scaling for street segments (pure, no I/O)."""

import math
from collections.abc import Sequence

from .errors import InvalidArgumentError


def _check_finite(name: str, value: float, allowed: str = "a finite number") -> None:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    ):
        raise InvalidArgumentError(name, value, allowed)


def _check_missing(values: Sequence[float], missing: Sequence[bool] | None) -> list[bool]:
    if missing is None:
        return [False] * len(values)
    if len(missing) != len(values):
        raise InvalidArgumentError(
            "missing", len(missing), f"a flag list of the same length as values ({len(values)})"
        )
    return [bool(m) for m in missing]


def percentile_linear(sorted_values: Sequence[float], q: float) -> float:
    """Percentile by linear interpolation; `sorted_values` ascending, `q` in 0..1."""
    _check_finite("q", q)
    if not 0.0 <= q <= 1.0:
        raise InvalidArgumentError("q", q, "0 to 1")
    n = len(sorted_values)
    if n == 0:
        raise InvalidArgumentError("sorted_values", [], "at least one value")
    for v in sorted_values:
        _check_finite("sorted_values", v)
    pos = q * (n - 1)
    lo = math.floor(pos)
    frac = pos - lo
    if lo >= n - 1:
        return float(sorted_values[n - 1])
    return sorted_values[lo] + frac * (sorted_values[lo + 1] - sorted_values[lo])


def scale_counts(
    values: Sequence[int], missing: Sequence[bool] | None = None
) -> list[float]:
    """Scale counts as min(1, c / p95) over non-missing segments.

    Gives 0.0 for every segment when fewer than two distinct values exist or
    p95 is 0. Segments flagged missing get 0.0 and are left out of the
    distribution.
    """
    for c in values:
        _check_finite("values", c)
        if c < 0:
            raise InvalidArgumentError("values", c, "0 or more")
    flags = _check_missing(values, missing)
    kept = sorted(c for c, m in zip(values, flags) if not m)
    if len(set(kept)) < 2:
        return [0.0] * len(values)
    p95 = percentile_linear(kept, 0.95)
    if p95 == 0:
        return [0.0] * len(values)
    return [0.0 if m else min(1.0, c / p95) for c, m in zip(values, flags)]


def scale_length(
    values: Sequence[float], missing: Sequence[bool] | None = None
) -> list[float]:
    """Min-max scale lengths over non-missing segments.

    Gives 0.0 when fewer than two distinct lengths exist and for missing segments.
    """
    for x in values:
        _check_finite("values", x)
        if x < 0:
            raise InvalidArgumentError("values", x, "0 or more")
    flags = _check_missing(values, missing)
    kept = [x for x, m in zip(values, flags) if not m]
    if len(set(kept)) < 2:
        return [0.0] * len(values)
    lo, hi = min(kept), max(kept)
    return [0.0 if m else (x - lo) / (hi - lo) for x, m in zip(values, flags)]


# --- Raw features and model vector (R3.1 to R3.5, R3.7) ----------------------

from dataclasses import dataclass, field  # noqa: E402

from .checks import check_range  # noqa: E402
from .geometry import (  # noqa: E402
    GridIndex,
    Projector,
    point_in_polygon,
    point_polyline_distance_m,
)

# R2.1 order; fixes the highway one-hot layout.
HIGHWAY_ORDER = (
    "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "service", "pedestrian", "footway", "path", "cycleway",
    "track", "steps", "primary_link", "secondary_link", "tertiary_link",
)
FOOTWAY_ORDER = ("sidewalk", "crossing", "other", "none")
LANDUSE_ORDER = ("residential", "commercial", "retail", "industrial", "other", "none")
_NAMED_LANDUSE = frozenset(LANDUSE_ORDER[:4])


@dataclass(frozen=True)
class PointSets:
    """City point locations as (lon, lat). Buildings are footprint centroids."""

    bus_stops: tuple = ()
    food_places: tuple = ()
    shops: tuple = ()
    buildings: tuple = ()


@dataclass(frozen=True)
class LanduseAreas:
    """Land-use polygons in file order: (landuse value, outer ring of (lon, lat))."""

    areas: tuple = field(default_factory=tuple)


@dataclass(frozen=True)
class RawFeatures:
    segment_id: int
    highway: str
    footway_kind: str
    length_m: float
    bus_stops: int
    food_places: int
    shops: int
    buildings: int
    landuse: str
    missing: bool


@dataclass(frozen=True)
class ScaledCounts:
    bus_stops: float
    food_places: float
    shops: float
    buildings: float


def _valid_pairs(coords) -> list[tuple[float, float]]:
    out = []
    for p in coords:
        try:
            lon, lat = float(p[0]), float(p[1])
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        if math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90:
            out.append((lon, lat))
    return out


def _midpoint(xy: list[tuple[float, float]]) -> tuple[float, float]:
    """Point at half the polyline's length."""
    total = sum(math.dist(a, b) for a, b in zip(xy, xy[1:]))
    if total == 0:
        return xy[0]
    half, walked = total / 2, 0.0
    for a, b in zip(xy, xy[1:]):
        d = math.dist(a, b)
        if d > 0 and walked + d >= half:
            t = (half - walked) / d
            return a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])
        walked += d
    return xy[-1]


def _landuse_class(value: object) -> str:
    return value if isinstance(value, str) and value in _NAMED_LANDUSE else "other"


def footway_kind_of(footway: str) -> str:
    """Map a raw `footway` tag value to sidewalk | crossing | other | none (R3.1)."""
    if not isinstance(footway, str):
        raise InvalidArgumentError("footway", footway, "a string")
    if footway == "":
        return "none"
    return footway if footway in ("sidewalk", "crossing") else "other"


def raw_features(
    segments, points: PointSets, polygons: LanduseAreas, feature_distance_m: float
) -> list[RawFeatures]:
    """Raw features per segment, sorted by segment id (independent of input order).

    Uses only the city's own geometry and tags; never reads a label or `lit`.
    A segment whose features cannot be computed gets defaults and missing=True.
    """
    check_range("feature_distance_m", feature_distance_m, 10, 1000)
    segs = sorted(segments, key=lambda s: (s.osm_id, s.highway, s.coords))

    # Origin: mean of every valid coordinate; fsum makes it order independent.
    pairs = [c for s in segs for c in _valid_pairs(s.coords)]
    sets = {k: tuple(getattr(points, k)) for k in
            ("bus_stops", "food_places", "shops", "buildings")}
    for pts in sets.values():
        pairs += _valid_pairs(pts)
    for _, ring in polygons.areas:
        pairs += _valid_pairs(ring)
    if not segs:
        return []
    if pairs:
        proj = Projector(
            math.fsum(p[1] for p in pairs) / len(pairs),
            math.fsum(p[0] for p in pairs) / len(pairs),
        )
    else:
        proj = Projector(0.0, 0.0)

    indexes = {
        k: GridIndex([(*proj.project(lon, lat), i) for i, (lon, lat) in enumerate(pts)],
                     feature_distance_m)
        for k, pts in sets.items()
    }
    rings = []  # projected polygons in file order
    for value, ring in polygons.areas:
        xy = proj.project_all(ring)
        if len(xy) >= 3:
            rings.append((_landuse_class(value), xy))

    cell = feature_distance_m
    out: list[RawFeatures] = []
    for s in segs:
        try:
            xy = proj.project_all(s.coords)
            if len(xy) < 2:
                raise InvalidArgumentError("coords", s.coords, "at least 2 points")
            counts = {}
            i0, i1 = (math.floor(min(p[0] for p in xy) / cell),
                      math.floor(max(p[0] for p in xy) / cell))
            j0, j1 = (math.floor(min(p[1] for p in xy) / cell),
                      math.floor(max(p[1] for p in xy) / cell))
            for k, index in indexes.items():
                hits = set()
                for i in range(i0, i1 + 1):
                    for j in range(j0, j1 + 1):
                        for x, y, idx in index.candidates((i + 0.5) * cell, (j + 0.5) * cell):
                            if idx not in hits and point_polyline_distance_m((x, y), xy) <= cell:
                                hits.add(idx)
                counts[k] = len(hits)
            mid = _midpoint(xy)
            landuse = next((c for c, ring in rings if point_in_polygon(mid, ring)), "none")
            length = float(s.length_m)
            if not math.isfinite(length) or length < 0:
                raise InvalidArgumentError("length_m", length, "a finite number of 0 or more")
            out.append(RawFeatures(s.osm_id, s.highway, footway_kind_of(s.footway), length, counts["bus_stops"],
                                   counts["food_places"], counts["shops"], counts["buildings"],
                                   landuse, False))
        except (InvalidArgumentError, ValueError, TypeError, AttributeError):
            out.append(RawFeatures(s.osm_id, s.highway, "none", 0.0, 0, 0, 0, 0, "none", True))
    return out


def to_vector(raw: RawFeatures, scaled: ScaledCounts, length_scaled: float) -> list[float]:
    """31 model inputs: highway (16), footway kind (4), length (1), counts (4), land use (6)."""
    if raw.highway not in HIGHWAY_ORDER:
        raise InvalidArgumentError("raw.highway", raw.highway, "a highway type from the R2.1 list")
    if raw.footway_kind not in FOOTWAY_ORDER:
        raise InvalidArgumentError("raw.footway_kind", raw.footway_kind, "one of " + ", ".join(FOOTWAY_ORDER))
    if raw.landuse not in LANDUSE_ORDER:
        raise InvalidArgumentError("raw.landuse", raw.landuse, "one of " + ", ".join(LANDUSE_ORDER))
    numeric = [("length_scaled", length_scaled), ("scaled.bus_stops", scaled.bus_stops),
               ("scaled.food_places", scaled.food_places), ("scaled.shops", scaled.shops),
               ("scaled.buildings", scaled.buildings)]
    for name, v in numeric:
        check_range(name, v, 0, 1)
    return (
        [1.0 if raw.highway == h else 0.0 for h in HIGHWAY_ORDER]
        + [1.0 if raw.footway_kind == f else 0.0 for f in FOOTWAY_ORDER]
        + [float(length_scaled), float(scaled.bus_stops), float(scaled.food_places),
           float(scaled.shops), float(scaled.buildings)]
        + [1.0 if raw.landuse == u else 0.0 for u in LANDUSE_ORDER]
    )
