"""Property 28 for loader footprints. Validates: Requirements 1.5, 1.6, 3.1, 8.4."""

from hypothesis import given, strategies as st

from gloam_pipeline.classify import classify
from gloam_pipeline.loader import (
    SUMMARY_TYPES,
    collect_building_footprints,
    merge_features,
)

# Feature: gloam-data-pipeline, Property 28: Any building-tagged polygon is a footprint, and the summary counts it once

RING = [[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [0.0, 0.0]]
GEOMETRIES = {
    "Polygon": {"type": "Polygon", "coordinates": [RING]},
    "MultiPolygon": {"type": "MultiPolygon", "coordinates": [[RING]]},
    "Point": {"type": "Point", "coordinates": [0.0, 0.0]},
    "LineString": {"type": "LineString", "coordinates": RING},
}

# Each optional tag is present or absent, so shop+building, food+building, etc. all occur.
optional_tags = st.fixed_dictionaries(
    {},
    optional={
        "shop": st.just("kiosk"),
        "amenity": st.sampled_from(["cafe", "bench"]),
        "building": st.sampled_from(["yes", "retail"]),
        "landuse": st.just("retail"),
        "highway": st.sampled_from(["bus_stop", "residential"]),
    },
)
# Small id pool so duplicates across files occur; way ids only, so id number is identity.
feature_specs = st.tuples(
    st.integers(0, 6), optional_tags, st.sampled_from(sorted(GEOMETRIES))
)
files_specs = st.lists(st.lists(feature_specs, max_size=8), max_size=4)


def build(spec):
    number, tags, geometry = spec
    return {
        "type": "Feature",
        "id": f"way/{number}",
        "properties": dict(tags),
        "geometry": GEOMETRIES[geometry],
    }


@given(files_specs)
def test_building_polygons_are_footprints_and_counted_once(files_specs):
    merged = merge_features([[build(s) for s in file] for file in files_specs])
    result = collect_building_footprints(merged.features)

    def has_building(f):
        return "building" in f["properties"]

    def is_polygon(f):
        return f["geometry"]["type"] == "Polygon"

    # Footprints are exactly the building-tagged Polygons, in order, whatever their type.
    expected_ids = [
        int(f["id"].split("/")[1])
        for f in merged.features
        if has_building(f) and is_polygon(f)
    ]
    assert [fp.osm_id for fp in result.footprints] == expected_ids

    # Building-tagged non-Polygons are excluded and add one warning each.
    assert result.warning_count == sum(
        1 for f in merged.features if has_building(f) and not is_polygon(f)
    )

    # Footprints never change the summary: still counted once, identity holds.
    assert set(merged.counts) == set(SUMMARY_TYPES)
    assert len(merged.features) == sum(merged.counts.values()) + merged.unmatched
    # A building polygon that also has shop/food is counted as shop/food, not building.
    shop_building = [
        f for f in merged.features
        if classify(f) == "shop" and has_building(f) and is_polygon(f)
    ]
    footprint_ids = {fp.osm_id for fp in result.footprints}
    for f in shop_building:
        assert int(f["id"].split("/")[1]) in footprint_ids
    assert merged.counts["shop"] == sum(1 for f in merged.features if classify(f) == "shop")
    assert merged.counts["building"] == sum(
        1 for f in merged.features if classify(f) == "building"
    )
