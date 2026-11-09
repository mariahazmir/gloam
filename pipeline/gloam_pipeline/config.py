"""Validated, frozen config dataclasses (pure, no I/O)."""

import math
from dataclasses import dataclass

from .checks import check_finite, check_range
from .errors import InvalidArgumentError


def _check_int_min(name: str, value: int, lo: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < lo:
        raise InvalidArgumentError(name, value, f"an integer of at least {lo}")


def _check_positive(name: str, value: float) -> None:
    check_finite(name, value)
    if value <= 0:
        raise InvalidArgumentError(name, value, "a finite number greater than 0")


@dataclass(frozen=True)
class PipelineConfig:
    feature_distance_m: float = 100
    untagged_weight: float = 0.2
    high_value: float = 0.9
    low_value: float = 0.1
    tagged_confidence: float = 0.95
    min_unlit_city: int = 200
    min_unlit_road_type: int = 100
    max_city_file_kb: float = 8192
    max_buildings_file_kb: float = 8192
    seed: int = 0
    default_building_height_m: float = 8.0

    def __post_init__(self) -> None:
        check_range("feature_distance_m", self.feature_distance_m, 10, 1000)
        check_range("untagged_weight", self.untagged_weight, 0, 1, True, True)
        check_range("high_value", self.high_value, 0.5, 1)
        check_range("low_value", self.low_value, 0, 0.5)
        if not self.low_value < self.high_value:
            raise InvalidArgumentError(
                "low_value", self.low_value, f"less than high_value ({self.high_value:g})"
            )
        check_range("tagged_confidence", self.tagged_confidence, 0.5, 1)
        _check_int_min("min_unlit_city", self.min_unlit_city, 1)
        _check_int_min("min_unlit_road_type", self.min_unlit_road_type, 1)
        _check_positive("max_city_file_kb", self.max_city_file_kb)
        _check_positive("max_buildings_file_kb", self.max_buildings_file_kb)
        if isinstance(self.seed, bool) or not isinstance(self.seed, int):
            raise InvalidArgumentError("seed", self.seed, "an integer")
        _check_positive("default_building_height_m", self.default_building_height_m)
