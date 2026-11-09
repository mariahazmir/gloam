"""Build city and buildings GeoJSON documents, and parse them back (pure, no I/O).

Covers R6.12, R8.1, R8.2, R8.4, R8.5, R8.6, R8.7.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from .checks import check_finite, check_range
from .config import PipelineConfig
from .errors import DataError, InvalidArgumentError
from .scoring import assert_valid_score

SCHEMA_VERSION = 1
ATTRIBUTION = "© OpenStreetMap contributors"
LICENCE = "ODbL 1.0 (https://www.openstreetmap.org/copyright)"
ESTIMATES_NOTE = (
    "Lit probabilities marked 'estimated' are model estimates, not records."
)
LABEL_SOURCES = ("tagged_lit", "tagged_unlit", "estimated")
COORD_DECIMALS = 6
SCORE_DECIMALS = 3


@dataclass(frozen=True)
class ExportedSegment:
    id: int
    name: str
    highway: str
    lit_probability: float
    confidence: float
    label_source: str
    coords: tuple  # ((lon, lat), ...)


def building_height_m(tags: dict, default: float) -> float:
    """Height from the `height` tag (optional trailing `m`) if positive and finite, else default."""
    check_finite("default", default)
    if default <= 0:
        raise InvalidArgumentError("default", default, "a finite number greater than 0")
    if not isinstance(tags, dict):
        raise InvalidArgumentError("tags", tags, "a dict of OSM tags")
    raw = tags.get("height")
    if not isinstance(raw, str):
        return float(default)
    text = raw.strip()
    if text.endswith("m"):
        text = text[:-1].strip()
    try:
        value = float(text)
    except ValueError:
        return float(default)
    return value if math.isfinite(value) and value > 0 else float(default)


def _metadata(kind: str, city: str, extra: dict) -> dict:
    if not isinstance(city, str) or not city.strip():
        raise InvalidArgumentError("city", city, "a non-empty text")
    meta = {
        "schema_version": SCHEMA_VERSION,
        "kind": kind,
        "city": city,
        "attribution": ATTRIBUTION,
        "licence": LICENCE,
    }
    meta.update(extra)
    return meta


def _coord(segment_id: object, field: str, point: object) -> list:
    """Check one (lon, lat) pair and return it rounded to 6 decimals."""
    try:
        lon, lat = point
        ok = all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
            for v in (lon, lat)
        ) and -180 <= lon <= 180 and -90 <= lat <= 90
    except (TypeError, ValueError):
        ok = False
    if not ok:
        raise DataError(segment_id, field, point)
    return [round(float(lon), COORD_DECIMALS), round(float(lat), COORD_DECIMALS)]


def build_city_collection(
    city: str,
    segments: Sequence,
    scores: Sequence,
    shift: float,
    cfg: PipelineConfig,
) -> dict:
    """Segments file document. `scores[i]` belongs to `segments[i]`. Nothing is returned on a bad value."""
    check_range("shift", shift, 0.0, 1.0)
    if len(segments) != len(scores):
        raise InvalidArgumentError(
            "scores", len(scores), f"one score per segment ({len(segments)})"
        )
    features = []
    for seg, score in zip(segments, scores):
        sid = seg.osm_id
        assert_valid_score(sid, "lit_probability", score.lit_probability)
        assert_valid_score(sid, "confidence", score.confidence)
        if score.label_source not in LABEL_SOURCES:
            raise DataError(sid, "label_source", score.label_source)
        coords = [_coord(sid, "coordinates", p) for p in seg.coords]
        if len(coords) < 2:
            raise DataError(sid, "coordinates", seg.coords)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {
                    "id": sid,
                    "name": seg.name or "",
                    "highway": seg.highway,
                    "lit_probability": round(score.lit_probability, SCORE_DECIMALS),
                    "confidence": round(score.confidence, SCORE_DECIMALS),
                    "label_source": score.label_source,
                },
            }
        )
    meta = _metadata(
        "segments",
        city,
        {
            "estimates_note": ESTIMATES_NOTE,
            "distribution_shift": round(shift, SCORE_DECIMALS),
            "segment_count": len(features),
        },
    )
    return {"type": "FeatureCollection", "metadata": meta, "features": features}


def build_buildings_collection(
    city: str, buildings: Sequence, cfg: PipelineConfig
) -> dict:
    """Buildings file document from the footprint list (outer ring and height)."""
    features = []
    for b in buildings:
        ring = [_coord(b.osm_id, "coordinates", p) for p in b.ring]
        if len(ring) < 4:
            raise DataError(b.osm_id, "coordinates", b.ring)
        height = building_height_m({"height": b.height_tag}, cfg.default_building_height_m)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {"height_m": height},
            }
        )
    meta = _metadata(
        "buildings",
        city,
        {
            "default_building_height_m": cfg.default_building_height_m,
            "building_count": len(features),
        },
    )
    return {"type": "FeatureCollection", "metadata": meta, "features": features}


def parse_city_collection(doc: dict) -> list:
    """Reload an exported segments document into ExportedSegment records."""
    if not isinstance(doc, dict) or not isinstance(doc.get("features"), list):
        raise InvalidArgumentError("doc", doc, "a segments FeatureCollection")
    meta = doc.get("metadata")
    if not isinstance(meta, dict) or meta.get("kind") != "segments":
        raise InvalidArgumentError("doc", meta, "metadata with kind 'segments'")
    out = []
    for feature in doc["features"]:
        props = feature["properties"]
        sid = props["id"]
        out.append(
            ExportedSegment(
                id=sid,
                name=props["name"],
                highway=props["highway"],
                lit_probability=assert_valid_score(
                    sid, "lit_probability", props["lit_probability"]
                ),
                confidence=assert_valid_score(sid, "confidence", props["confidence"]),
                label_source=props["label_source"],
                coords=tuple(tuple(p) for p in feature["geometry"]["coordinates"]),
            )
        )
    return out
