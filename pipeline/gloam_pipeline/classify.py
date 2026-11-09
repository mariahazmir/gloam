"""Feature classification and OSM key parsing (pure, no I/O). Covers R1.2, R1.5, R1.6, R2.1."""

from .errors import InvalidArgumentError

SEGMENT_HIGHWAYS = frozenset(
    {
        "primary", "secondary", "tertiary", "unclassified", "residential",
        "living_street", "service", "pedestrian", "footway", "path", "cycleway",
        "track", "steps", "primary_link", "secondary_link", "tertiary_link",
    }
)
FOOD_AMENITIES = frozenset(
    {"restaurant", "cafe", "fast_food", "bar", "pub", "food_court"}
)
OSM_ELEMENT_TYPES = frozenset({"node", "way", "relation"})
POLYGON_TYPES = frozenset({"Polygon", "MultiPolygon"})


def _check_feature(feature: object) -> dict:
    if not isinstance(feature, dict):
        raise InvalidArgumentError("feature", feature, "a dict (GeoJSON feature)")
    return feature


def _properties(feature: dict) -> dict:
    props = feature.get("properties")
    return props if isinstance(props, dict) else {}


def _parse_key(value: object) -> tuple[str, int] | None:
    """Parse 'way/123' into ('way', 123); None if it is not that shape."""
    if not isinstance(value, str):
        return None
    element_type, sep, raw_id = value.strip().partition("/")
    if not sep or element_type not in OSM_ELEMENT_TYPES:
        return None
    if not (raw_id.isascii() and raw_id.isdigit()):
        return None
    return element_type, int(raw_id)


def parse_osm_key(feature: dict) -> tuple[str, int] | None:
    """Return (element_type, id). Top-level `id` wins; `properties["@id"]` is the fallback."""
    feature = _check_feature(feature)
    key = _parse_key(feature.get("id"))
    if key is not None:
        return key
    return _parse_key(_properties(feature).get("@id"))


def _is_polygon(feature: dict) -> bool:
    geometry = feature.get("geometry")
    return isinstance(geometry, dict) and geometry.get("type") in POLYGON_TYPES


def classify(feature: dict) -> str:
    """Return segment, bus_stop, food, shop, building, landuse or other (first match wins).

    A feature with no parseable OSM key is treated as a way for the segment test,
    since its element type cannot be known; a known non-way is never a segment.
    """
    feature = _check_feature(feature)
    props = _properties(feature)
    highway = props.get("highway")

    key = parse_osm_key(feature)
    if highway in SEGMENT_HIGHWAYS and (key is None or key[0] == "way"):
        return "segment"
    if highway == "bus_stop":
        return "bus_stop"
    if props.get("amenity") in FOOD_AMENITIES:
        return "food"
    if "shop" in props:
        return "shop"
    if "building" in props:
        return "building"
    if "landuse" in props and _is_polygon(feature):
        return "landuse"
    return "other"
