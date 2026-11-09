"""Unit tests for io.read_geojson and io.load_city (R1.1, R1.3, R1.4)."""

import json

import pytest

from gloam_pipeline.errors import InputFileError, InvalidArgumentError
from gloam_pipeline.io import load_city, read_geojson


def _write(path, obj):
    path.write_text(json.dumps(obj), encoding="utf-8")
    return path


def _fc(*ids):
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": f"way/{i}",
                "properties": {"highway": "residential"},
                "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
            }
            for i in ids
        ],
    }


def test_read_valid(tmp_path):
    assert len(read_geojson(_write(tmp_path / "a.geojson", _fc(1, 2)))) == 2


def test_missing_invalid_empty_files(tmp_path):
    bad = tmp_path / "bad.geojson"
    bad.write_text("{not json", encoding="utf-8")
    blank = tmp_path / "blank.geojson"
    blank.write_text("", encoding="utf-8")
    nofeat = _write(tmp_path / "nofeat.geojson", _fc())
    for path in (tmp_path / "missing.geojson", bad, blank, nofeat, tmp_path):
        with pytest.raises(InputFileError) as err:
            read_geojson(path)
        assert err.value.path == path


def test_load_city_merges_two_files(tmp_path):
    a = _write(tmp_path / "a.geojson", _fc(1, 2))
    b = _write(tmp_path / "b.geojson", _fc(2, 3))
    ds = load_city([a, b], "Testville")
    assert len(ds.merged.features) == 3 and ds.merged.duplicates == 1


def test_load_city_fails_if_any_file_fails(tmp_path):
    good = _write(tmp_path / "a.geojson", _fc(1))
    with pytest.raises(InputFileError):
        load_city([good, tmp_path / "missing.geojson"], "Testville")


@pytest.mark.parametrize("name", ["", " \t", "x" * 101, None])
def test_bad_city_name_named(tmp_path, name):
    good = _write(tmp_path / "a.geojson", _fc(1))
    with pytest.raises(InvalidArgumentError) as err:
        load_city([good], name)
    assert err.value.argument == "city_name"


def test_bad_paths_rejected_before_reading(tmp_path):
    # the missing file would raise InputFileError if any read happened first
    missing = tmp_path / "missing.geojson"
    for paths in ([], [missing] * 51, str(missing)):
        with pytest.raises(InvalidArgumentError) as err:
            load_city(paths, "Testville")
        assert err.value.argument == "paths"
    with pytest.raises(InvalidArgumentError) as err:
        load_city([missing], " ")
    assert err.value.argument == "city_name"
