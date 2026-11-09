"""Unit tests for loading and key parsing (R1.1-R1.6)."""

import json

import pytest

from gloam_pipeline.errors import InputFileError
from gloam_pipeline.io import load_city, read_geojson
from gloam_pipeline.loader import collect_building_footprints, merge_features
from gloam_pipeline.classify import parse_osm_key


def _feat(fid=None, props=None, geometry=None):
    f = {"type": "Feature", "properties": props or {}, "geometry": geometry}
    if fid is not None:
        f["id"] = fid
    return f


def _write_fc(path, features):
    path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}),
        encoding="utf-8",
    )
    return path


# --- loading errors (R1.3, R1.4) ---


def test_three_bad_files_each_name_file_and_problem(tmp_path):
    missing = tmp_path / "missing.geojson"
    invalid = tmp_path / "invalid.geojson"
    invalid.write_text("{not json", encoding="utf-8")
    empty = tmp_path / "empty.geojson"
    empty.write_text("", encoding="utf-8")

    expected = {
        missing: "file not found",
        invalid: "not valid JSON",
        empty: "file is empty",
    }
    for path, problem in expected.items():
        with pytest.raises(InputFileError) as err:
            read_geojson(path)
        assert err.value.path == path
        assert err.value.problem == problem
        assert str(path) in str(err.value) and problem in str(err.value)


def test_load_city_with_bad_files_raises_input_file_error(tmp_path):
    good = _write_fc(tmp_path / "good.geojson", [_feat("way/1")])
    invalid = tmp_path / "invalid.geojson"
    invalid.write_text("[1,", encoding="utf-8")
    with pytest.raises(InputFileError) as err:
        load_city([good, invalid], "Testville")
    assert err.value.path == invalid


# --- merge of two small files (R1.1, R1.2, R1.5) ---


def test_merge_two_files_keeps_first_and_counts(tmp_path):
    road = {"highway": "residential"}
    stop = {"highway": "bus_stop"}
    cafe = {"amenity": "cafe"}
    file_a = [_feat("way/1", road), _feat("node/2", stop)]
    # way/1 repeats with different tags: the first occurrence must be kept
    file_b = [_feat("way/1", {"shop": "bakery"}), _feat("node/3", cafe)]
    a = _write_fc(tmp_path / "a.geojson", file_a)
    b = _write_fc(tmp_path / "b.geojson", file_b)

    ds = load_city([a, b], "Testville")
    m = ds.merged
    assert [f["id"] for f in m.features] == ["way/1", "node/2", "node/3"]
    assert m.features[0]["properties"] == road
    assert m.duplicates == 1
    assert m.unmatched == 0
    assert m.warning_count == 0
    assert m.counts == {
        "segment": 1, "bus_stop": 1, "food": 1,
        "shop": 0, "building": 0, "landuse": 0,
    }


# --- parse_osm_key (R1.5, R1.6) ---


def test_key_top_level_wins_when_both_present():
    f = _feat("way/10", {"@id": "node/20"})
    assert parse_osm_key(f) == ("way", 10)


def test_key_falls_back_when_top_level_absent():
    assert parse_osm_key(_feat(None, {"@id": "node/20"})) == ("node", 20)


def test_key_falls_back_when_top_level_unparseable():
    f = _feat("way/abc", {"@id": "relation/5"})
    assert parse_osm_key(f) == ("relation", 5)


def test_key_none_when_neither_present():
    assert parse_osm_key(_feat(None, {})) is None


def test_merge_assigns_synthetic_key_and_one_warning():
    keyless = _feat(None, {"shop": "kiosk"})
    result = merge_features([[_feat("way/1", {"highway": "path"})], [keyless]])
    # the keyless feature is kept, not dropped, and counted by its tags
    assert len(result.features) == 2
    assert result.features[1] is keyless
    assert result.counts["shop"] == 1
    assert result.duplicates == 0
    assert result.warning_count == 1
    assert result.warnings == ("feature 0 in file 1 has no parseable id",)


# --- shop + building polygon (R1.2, R1.6) ---


def test_shop_building_polygon_counts_once_as_shop_and_is_a_footprint():
    ring = [[0, 0], [1, 0], [1, 1], [0, 0]]
    poly = _feat(
        "way/7",
        {"shop": "bakery", "building": "yes", "height": "9"},
        {"type": "Polygon", "coordinates": [ring]},
    )
    merged = merge_features([[poly]])
    assert merged.counts["shop"] == 1
    assert merged.counts["building"] == 0
    assert sum(merged.counts.values()) + merged.unmatched == 1

    fp = collect_building_footprints(merged.features)
    assert fp.warning_count == 0
    assert len(fp.footprints) == 1
    assert fp.footprints[0].osm_id == 7
    assert fp.footprints[0].height_tag == "9"
    assert fp.footprints[0].ring == ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 0.0))
