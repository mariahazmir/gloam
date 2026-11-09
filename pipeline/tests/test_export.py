"""Unit tests for export content (R8.4, R8.5, R8.7)."""

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.export import (
    ATTRIBUTION,
    LICENCE,
    build_buildings_collection,
    build_city_collection,
)
from gloam_pipeline.loader import collect_building_footprints
from gloam_pipeline.scoring import Score
from gloam_pipeline.segments import Segment

ALLOWED = {"id", "name", "highway", "lit_probability", "confidence", "label_source"}
CFG = PipelineConfig()


def _city_doc():
    seg = Segment(
        osm_id=42,
        name="Jalan Test",
        highway="residential",
        footway="sidewalk",  # extra attributes must not leak into the export
        coords=((101.123456789, 3.1), (101.2, 3.2)),
        length_m=15000.0,
        label="untagged",
    )
    score = Score(0.87654, 0.4571875, "estimated")
    return build_city_collection("Testville", [seg], [score], 0.2, CFG)


def _shop_building_feature():
    # Closed ring, so it is a valid footprint; tagged both shop and building.
    ring = [[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]]
    return {
        "type": "Feature",
        "id": "way/777",
        "properties": {"shop": "convenience", "building": "yes", "height": "12 m"},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def _buildings_doc():
    result = collect_building_footprints([_shop_building_feature()])
    return build_buildings_collection("Testville", result.footprints, CFG)


# --- attribution and licence (R8.5) ---


def test_city_metadata_has_attribution_and_licence():
    meta = _city_doc()["metadata"]
    assert meta["attribution"] == "© OpenStreetMap contributors" == ATTRIBUTION
    assert meta["licence"] == LICENCE
    assert "ODbL" in meta["licence"]


def test_buildings_metadata_has_attribution_and_licence():
    meta = _buildings_doc()["metadata"]
    assert meta["attribution"] == "© OpenStreetMap contributors"
    assert meta["licence"] == LICENCE
    assert "ODbL" in meta["licence"]


# --- allow-listed properties only (R8.7) ---


def test_city_features_carry_only_allow_listed_properties():
    doc = _city_doc()
    assert len(doc["features"]) == 1
    props = doc["features"][0]["properties"]
    assert set(props) == ALLOWED
    # Hand-rounded: 0.87654 -> 0.877, 0.4571875 -> 0.457; 6-decimal coordinates.
    assert props["lit_probability"] == 0.877
    assert props["confidence"] == 0.457
    assert props["id"] == 42 and props["label_source"] == "estimated"
    assert doc["features"][0]["geometry"]["coordinates"][0] == [101.123457, 3.1]


# --- shop polygon also tagged building appears in the buildings file (R8.4) ---


def test_shop_tagged_building_polygon_is_exported_as_building():
    result = collect_building_footprints([_shop_building_feature()])
    assert len(result.footprints) == 1
    fp = result.footprints[0]
    assert fp.osm_id == 777 and fp.height_tag == "12 m" and len(fp.ring) == 5

    doc = build_buildings_collection("Testville", result.footprints, CFG)
    assert doc["metadata"]["building_count"] == 1
    feature = doc["features"][0]
    assert feature["geometry"]["type"] == "Polygon"
    assert feature["geometry"]["coordinates"][0][0] == [0.0, 0.0]
    # "12 m" -> trailing m removed -> 12.0 metres (not the 8.0 default).
    assert feature["properties"] == {"height_m": 12.0}
