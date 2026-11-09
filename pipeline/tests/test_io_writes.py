"""Unit tests for atomic file writes. Covers R8.3, R9.5, R9.6."""

import json

import pytest

from gloam_pipeline import io
from gloam_pipeline.errors import FileSizeError, InvalidArgumentError


def _doc(city, kind, payload=""):
    return {"metadata": {"city": city, "kind": kind}, "features": [], "pad": payload}


def _no_tmp(folder):
    return [p.name for p in folder.iterdir() if p.name.endswith(".tmp")] == []


def test_small_file_is_written_and_size_returned(tmp_path):
    path = tmp_path / "city.geojson"
    size = io.write_geojson_checked(path, _doc("Testville", "city"), limit_kb=10)
    assert size == path.stat().st_size / 1024
    assert json.loads(path.read_text(encoding="utf-8"))["metadata"]["city"] == "Testville"
    assert _no_tmp(tmp_path)


@pytest.mark.parametrize("kind", ["city", "buildings"])
def test_oversized_file_is_removed_and_error_names_details(tmp_path, kind):
    path = tmp_path / f"{kind}.geojson"
    doc = _doc("Testville", kind, "x" * 5000)
    with pytest.raises(FileSizeError) as info:
        io.write_geojson_checked(path, doc, limit_kb=1)
    err = info.value
    assert err.city == "Testville"
    assert err.file == kind
    assert err.limit_kb == 1
    assert err.size_kb > 1
    message = str(err)
    assert "Testville" in message and kind in message and "1 KB" in message
    assert f"{err.size_kb:.1f}" in message
    assert not path.exists()
    assert _no_tmp(tmp_path)


def test_oversized_buildings_leaves_earlier_city_file_unchanged(tmp_path):
    city = tmp_path / "city.geojson"
    io.write_geojson_checked(city, _doc("Testville", "city"), limit_kb=10)
    before = city.read_bytes()

    buildings = tmp_path / "buildings.geojson"
    with pytest.raises(FileSizeError) as info:
        io.write_geojson_checked(buildings, _doc("Testville", "buildings", "y" * 5000), limit_kb=1)
    assert info.value.file == "buildings"
    assert city.read_bytes() == before
    assert not buildings.exists()
    assert _no_tmp(tmp_path)


def test_oversized_rewrite_keeps_existing_output(tmp_path):
    path = tmp_path / "city.geojson"
    io.write_geojson_checked(path, _doc("Testville", "city"), limit_kb=10)
    before = path.read_bytes()
    with pytest.raises(FileSizeError):
        io.write_geojson_checked(path, _doc("Testville", "city", "z" * 5000), limit_kb=1)
    assert path.read_bytes() == before
    assert _no_tmp(tmp_path)


def test_missing_metadata_still_raises_size_error(tmp_path):
    with pytest.raises(FileSizeError) as info:
        io.write_geojson_checked(tmp_path / "a.geojson", {"pad": "x" * 5000}, limit_kb=1)
    assert info.value.city == "unknown"
    assert info.value.file == "a.geojson"
    assert _no_tmp(tmp_path)


def test_failed_geojson_write_leaves_existing_file_unchanged(tmp_path):
    path = tmp_path / "city.geojson"
    io.write_geojson_checked(path, _doc("Testville", "city"), limit_kb=10)
    before = path.read_bytes()
    with pytest.raises(InvalidArgumentError):
        io.write_geojson_checked(path, _doc("Testville", "city", float("nan")), limit_kb=10)
    assert path.read_bytes() == before
    assert _no_tmp(tmp_path)


def test_failed_json_write_leaves_existing_file_unchanged(tmp_path):
    path = tmp_path / "features.json"
    io.write_json(path, {"a": 1})
    before = path.read_bytes()
    with pytest.raises(InvalidArgumentError) as info:
        io.write_json(path, {"a": float("inf")})
    assert "doc" in str(info.value)
    assert path.read_bytes() == before
    assert io.read_json(path) == {"a": 1}
    assert _no_tmp(tmp_path)


def test_write_json_replaces_existing_file_and_leaves_no_tmp(tmp_path):
    path = tmp_path / "model.json"
    io.write_json(path, {"v": 1})
    io.write_json(path, {"v": 2})
    assert io.read_json(path) == {"v": 2}
    assert _no_tmp(tmp_path)
