"""Merge, dedupe and count parsed features; gather building footprints (pure, no I/O).

Covers R1.1, R1.2, R1.5, R1.6, R3.1, R8.4.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from .classify import classify, parse_osm_key
from .errors import InvalidArgumentError

SUMMARY_TYPES = ("segment", "bus_stop", "food", "shop", "building", "landuse")


@dataclass(frozen=True)
class BuildingFootprint:
    osm_id: int
    ring: tuple  # exterior ring as ((lon, lat), ...)
    height_tag: str  # raw `height` tag, empty when missing


@dataclass(frozen=True)
class MergeResult:
    features: tuple  # deduplicated features, first occurrence wins
    counts: dict  # exclusive count per summary type
    unmatched: int
    duplicates: int
    warnings: tuple  # one message per feature with no parseable id

    @property
    def warning_count(self) -> int:
        return len(self.warnings)


@dataclass(frozen=True)
class FootprintResult:
    footprints: tuple
    warnings: tuple  # one message per non-Polygon feature with a building tag

    @property
    def warning_count(self) -> int:
        return len(self.warnings)


def merge_features(files: Sequence[Sequence[dict]]) -> MergeResult:
    """Dedupe by (element type, id) in file-list order and count features per type.

    input = unique + duplicates, and unique = sum(six types) + unmatched.
    """
    if isinstance(files, (str, bytes)) or not isinstance(files, Sequence):
        raise InvalidArgumentError("files", files, "a sequence of feature lists")
    seen: set = set()
    kept: list = []
    warnings: list = []
    counts = {name: 0 for name in SUMMARY_TYPES}
    unmatched = duplicates = 0
    for file_index, features in enumerate(files):
        if isinstance(features, (str, bytes)) or not isinstance(features, Sequence):
            raise InvalidArgumentError(
                f"files[{file_index}]", features, "a sequence of features"
            )
        for position, feature in enumerate(features):
            key = parse_osm_key(feature)  # raises InvalidArgumentError if not a dict
            if key is None:
                key = ("unknown", file_index, position)
                warnings.append(
                    f"feature {position} in file {file_index} has no parseable id"
                )
            if key in seen:
                duplicates += 1
                continue
            seen.add(key)
            kept.append(feature)
            kind = classify(feature)
            if kind in counts:
                counts[kind] += 1
            else:
                unmatched += 1
    return MergeResult(tuple(kept), counts, unmatched, duplicates, tuple(warnings))


def collect_building_footprints(features: Sequence[dict]) -> FootprintResult:
    """Keep every Polygon with a `building` tag, whatever its summary type.

    Outside the exclusive counts. Building-tagged non-Polygons become warnings.
    """
    if isinstance(features, (str, bytes)) or not isinstance(features, Sequence):
        raise InvalidArgumentError("features", features, "a sequence of features")
    footprints: list = []
    warnings: list = []
    for position, feature in enumerate(features):
        if not isinstance(feature, dict):
            raise InvalidArgumentError(
                f"features[{position}]", feature, "a dict (GeoJSON feature)"
            )
        props = feature.get("properties")
        if not isinstance(props, dict) or "building" not in props:
            continue
        geometry = feature.get("geometry")
        gtype = geometry.get("type") if isinstance(geometry, dict) else None
        coords = geometry.get("coordinates") if isinstance(geometry, dict) else None
        if gtype != "Polygon" or not coords:
            warnings.append(
                f"feature {position} has a building tag but is not a Polygon"
            )
            continue
        key = parse_osm_key(feature)
        osm_id = key[1] if key is not None else -(position + 1)  # negative = no id
        ring = tuple((float(p[0]), float(p[1])) for p in coords[0])
        height = props.get("height")
        footprints.append(
            BuildingFootprint(osm_id, ring, "" if height is None else str(height))
        )
    return FootprintResult(tuple(footprints), tuple(warnings))
