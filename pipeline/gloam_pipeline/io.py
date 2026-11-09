"""Reads and writes files. Covers R1.1, R1.3, R1.4, R8.2, R8.3, R9.2, R9.5, R9.6.

Every write goes to a temporary file in the same folder and is renamed onto the
final path only on success, so an earlier valid file is never half-overwritten.
"""

import json
import os
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from .checks import check_count_between, check_range, check_text_length
from .errors import FileSizeError, InputFileError, InvalidArgumentError
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


def read_json(path) -> dict:
    """Read one intermediate JSON file (an object). Raises InputFileError on any problem."""
    p = Path(path)
    if not p.is_file():
        raise InputFileError(path, "file not found")
    try:
        text = p.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise InputFileError(path, f"cannot be read ({exc.__class__.__name__})") from exc
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise InputFileError(path, "not valid JSON") from exc
    if not isinstance(data, dict):
        raise InputFileError(path, "not a JSON object")
    return data


def _write_atomic(path, doc: dict, indent: int | None) -> tuple[Path, Path]:
    """Write `doc` to a temp file beside `path`. Returns (temp, final); nothing is renamed."""
    final = Path(path)
    final.parent.mkdir(parents=True, exist_ok=True)
    tmp = final.with_name(final.name + ".tmp")
    try:
        # allow_nan=False: NaN and infinity must never reach a file.
        text = json.dumps(doc, ensure_ascii=False, allow_nan=False, indent=indent,
                          separators=(",", ":") if indent is None else None)
        tmp.write_bytes(text.encode("utf-8"))  # bytes: no newline translation on Windows
    except (ValueError, TypeError) as exc:
        tmp.unlink(missing_ok=True)
        raise InvalidArgumentError("doc", type(doc).__name__, f"finite, JSON-safe values ({exc})") from exc
    except OSError:
        tmp.unlink(missing_ok=True)
        raise
    return tmp, final


def write_json(path, doc: dict) -> None:
    """Write an intermediate file atomically; a failed write leaves the old file as it was."""
    tmp, final = _write_atomic(path, doc, indent=1)
    try:
        os.replace(tmp, final)
    except OSError:
        tmp.unlink(missing_ok=True)
        raise


def read_text_optional(path) -> tuple[str | None, str]:
    """Read a text file. Returns (text, "") or (None, "missing" | "unreadable")."""
    p = Path(path)
    if not p.is_file():
        return None, "missing"
    try:
        return p.read_text(encoding="utf-8"), ""
    except (OSError, UnicodeDecodeError):
        return None, "unreadable"


def write_text(path, text: str) -> None:
    """Write a text file atomically (temp file, then rename); UTF-8, no newline translation."""
    final = Path(path)
    final.parent.mkdir(parents=True, exist_ok=True)
    tmp = final.with_name(final.name + ".tmp")
    try:
        tmp.write_bytes(text.encode("utf-8"))
        os.replace(tmp, final)
    except OSError:
        tmp.unlink(missing_ok=True)
        raise


def write_geojson_checked(path, doc: dict, limit_kb: float) -> float:
    """Write a GeoJSON file only if it fits `limit_kb` (1 KB = 1024 bytes).

    Returns the size in kilobytes. Over the limit, the temporary file is deleted
    and FileSizeError names the city, file, size and limit; any earlier file at
    `path` is untouched.
    """
    check_range("limit_kb", limit_kb, 0, float("inf"), lo_open=True, hi_open=True)
    meta = doc.get("metadata") if isinstance(doc, dict) else None
    meta = meta if isinstance(meta, dict) else {}
    tmp, final = _write_atomic(path, doc, indent=None)
    try:
        size_kb = tmp.stat().st_size / 1024
        if size_kb > limit_kb:
            raise FileSizeError(meta.get("city", "unknown"), meta.get("kind", final.name), size_kb, limit_kb)
        os.replace(tmp, final)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return size_kb


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
