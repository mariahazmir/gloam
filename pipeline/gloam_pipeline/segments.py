"""Build walkable segments from OSM features (pure, no I/O). Covers R2.1 to R2.9."""

import math
from dataclasses import dataclass, field
from typing import Sequence

from .classify import SEGMENT_HIGHWAYS, parse_osm_key
from .errors import InvalidArgumentError
from .geometry import polyline_length_m

LIT_VALUES = frozenset({"yes", "24/7", "automatic", "dusk-dawn"})
FOOTWAY_KINDS = frozenset({"sidewalk", "crossing"})


@dataclass(frozen=True)
class Segment:
    osm_id: int
    name: str
    highway: str
    footway: str  # sidewalk | crossing | other | none
    coords: tuple[tuple[float, float], ...]  # (lon, lat), closing point kept for closed ways
    length_m: float
    label: str  # tagged_lit | tagged_unlit | untagged


@dataclass(frozen=True)
class SegmentResult:
    segments: tuple[Segment, ...]
    skipped_ways: tuple[tuple[int | None, str], ...] = ()  # (osm_id or None, reason)
    closed_ways: int = 0
    unrecognised_lit: dict[str, int] = field(default_factory=dict)


def lit_label(value: str | None) -> tuple[str, bool]:
    """Map an OSM `lit` value to (label, recognised). Exact, case-sensitive match."""
    if value is not None and not isinstance(value, str):
        raise InvalidArgumentError("value", value, "a string or None")
    if value is None:
        return "untagged", True
    if value in LIT_VALUES:
        return "tagged_lit", True
    if value == "no":
        return "tagged_unlit", True
    return "untagged", False


def _footway_kind(value: object) -> str:
    if not isinstance(value, str) or value == "":
        return "none"
    return value if value in FOOTWAY_KINDS else "other"


def _ring_or_line(geometry: object) -> tuple[list | None, str]:
    """Return (raw coordinate list, '') or (None, reason)."""
    if not isinstance(geometry, dict):
        return None, "geometry missing"
    kind, raw = geometry.get("type"), geometry.get("coordinates")
    if kind == "LineString":
        line = raw
    elif kind == "Polygon":
        line = raw[0] if isinstance(raw, (list, tuple)) and raw else None
    else:
        return None, f"geometry type {kind!r} is not LineString or Polygon"
    if not isinstance(line, (list, tuple)):
        return None, "coordinates unresolvable"
    return list(line), ""


def _clean(raw: list) -> tuple[tuple[float, float], ...] | None:
    out = []
    for p in raw:
        try:
            lon, lat = float(p[0]), float(p[1])
        except (TypeError, ValueError, IndexError, KeyError):
            return None
        if not (math.isfinite(lon) and math.isfinite(lat)):
            return None
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            return None
        out.append((lon, lat))
    return tuple(out)


def build_segments(features: Sequence[dict]) -> SegmentResult:
    """Turn highway ways into Segments. Skipped ways are reported, never fatal."""
    if isinstance(features, (str, bytes, dict)) or not hasattr(features, "__iter__"):
        raise InvalidArgumentError("features", features, "a sequence of GeoJSON feature dicts")
    segments: list[Segment] = []
    skipped: list[tuple[int | None, str]] = []
    unrecognised: dict[str, int] = {}
    closed = 0

    for feature in features:
        if not isinstance(feature, dict):
            raise InvalidArgumentError("features", feature, "a sequence of GeoJSON feature dicts")
        props = feature.get("properties")
        props = props if isinstance(props, dict) else {}
        if props.get("highway") not in SEGMENT_HIGHWAYS:
            continue  # motorway, trunk, missing and unlisted values are excluded (R2.1)
        key = parse_osm_key(feature)
        if key is None:
            skipped.append((None, "no parseable OSM id"))
            continue
        if key[0] != "way":
            continue
        osm_id = key[1]

        raw, reason = _ring_or_line(feature.get("geometry"))
        coords = _clean(raw) if raw is not None else None
        if raw is not None and coords is None:
            reason = "coordinates invalid"
        if coords is not None and len(set(coords)) < 2:
            coords, reason = None, "fewer than 2 distinct coordinates"
        if coords is None:
            skipped.append((osm_id, reason))
            continue

        if coords[0] == coords[-1]:
            closed += 1
        lit = props.get("lit")
        if lit is not None and not isinstance(lit, str):
            lit = str(lit)  # odd input must not stop the run; it counts as unrecognised
        label, recognised = lit_label(lit)
        if not recognised:
            unrecognised[lit] = unrecognised.get(lit, 0) + 1
        name = props.get("name")
        segments.append(
            Segment(
                osm_id=osm_id,
                name=name if isinstance(name, str) else "",
                highway=props["highway"],
                footway=_footway_kind(props.get("footway")),
                coords=coords,
                length_m=polyline_length_m(coords),
                label=label,
            )
        )
    return SegmentResult(tuple(segments), tuple(skipped), closed, unrecognised)
