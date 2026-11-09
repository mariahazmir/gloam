"""The only module that reads input files. Covers R1.1, R1.3, R1.4."""

import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from .checks import check_count_between, check_text_length
from .errors import InputFileError, InvalidArgumentError
from .loader import (
    FootprintResult,
    MergeResult,
    collect_building_footprints,
    merge_features,
)

MAX_PATHS = 50
MAX_CITY_NAME = 100


@dataclass(frozen=True)
class CityDataset:
    city_name: str
    merged: MergeResult
    footprints: FootprintResult


def read_geojson(path) -> list:
    """Return the features of one GeoJSON FeatureCollection file.

    Raises InputFileError(path, problem) when the file is missing, unreadable,
    not a valid FeatureCollection, or holds no features.
    """
    p = Path(path)
    if not p.is_file():
        raise InputFileError(path, "file not found")
    try:
        text = p.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise InputFileError(path, f"cannot be read ({exc.__class__.__name__})") from exc
    if not text.strip():
        raise InputFileError(path, "file is empty")
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise InputFileError(path, "not valid JSON") from exc
    features = data.get("features") if isinstance(data, dict) else None
    if not isinstance(features, list) or not all(isinstance(f, dict) for f in features):
        raise InputFileError(path, "not a GeoJSON FeatureCollection")
    if not features:
        raise InputFileError(path, "contains no features")
    return features


def load_city(paths: Sequence, city_name: str) -> CityDataset:
    """Check arguments, read every file, and only then build the dataset."""
    if isinstance(paths, (str, bytes)):
        raise InvalidArgumentError("paths", paths, "a list of 1 to 50 paths")
    check_count_between("paths", paths, 1, MAX_PATHS)
    check_text_length("city_name", city_name, 1, MAX_CITY_NAME)
    files = [read_geojson(p) for p in paths]  # any failure stops here
    merged = merge_features(files)
    footprints = collect_building_footprints(merged.features)
    return CityDataset(city_name, merged, footprints)
