import pytest

from gloam_pipeline.checks import (
    check_count_between,
    check_finite,
    check_range,
    check_text_length,
)
from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.errors import DataError, InvalidArgumentError


def test_message_format():
    with pytest.raises(InvalidArgumentError) as e:
        check_range("feature_distance_m", float("nan"), 10, 1000)
    assert str(e.value) == "argument 'feature_distance_m' rejected value nan; allowed 10 to 1000"


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -float("inf"), True, "1"])
def test_finite_rejects(bad):
    with pytest.raises(InvalidArgumentError, match="'x'"):
        check_finite("x", bad)


def test_range_bounds():
    assert check_range("x", 0, 0, 1) == 0
    with pytest.raises(InvalidArgumentError):
        check_range("x", 0, 0, 1, lo_open=True)
    with pytest.raises(InvalidArgumentError):
        check_range("x", 1, 0, 1, hi_open=True)
    with pytest.raises(InvalidArgumentError):
        check_range("x", 1.01, 0, 1)


def test_text_and_count():
    assert check_text_length("n", "a", 1, 100) == "a"
    for bad in ["", "   ", "a" * 101]:
        with pytest.raises(InvalidArgumentError):
            check_text_length("n", bad, 1, 100)
    check_count_between("p", [1], 1, 50)
    for bad in ([], list(range(51))):
        with pytest.raises(InvalidArgumentError):
            check_count_between("p", bad, 1, 50)


def test_config_defaults_and_frozen():
    c = PipelineConfig()
    assert (c.feature_distance_m, c.untagged_weight, c.seed) == (100, 0.2, 0)
    with pytest.raises(Exception):
        c.seed = 1  # type: ignore[misc]


@pytest.mark.parametrize(
    "kw",
    [
        {"feature_distance_m": 9},
        {"feature_distance_m": float("nan")},
        {"untagged_weight": 0},
        {"untagged_weight": 1},
        {"high_value": 0.49},
        {"low_value": 0.51},
        {"low_value": 0.5, "high_value": 0.5},
        {"tagged_confidence": 1.1},
        {"min_unlit_city": 0},
        {"min_unlit_road_type": True},
        {"max_city_file_kb": 0},
        {"max_buildings_file_kb": float("inf")},
        {"seed": 1.5},
        {"seed": True},
        {"default_building_height_m": 0},
    ],
)
def test_config_rejects(kw):
    with pytest.raises(InvalidArgumentError):
        PipelineConfig(**kw)


def test_config_accepts_inclusive_bounds():
    PipelineConfig(high_value=1, low_value=0, tagged_confidence=0.5, feature_distance_m=1000)


def test_data_error_names_fields():
    assert "'seg1'" in str(DataError("seg1", "probability", float("nan")))
