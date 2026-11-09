"""Unit tests for scoring and shift with hand-checked values (task 6.10).

Hand checks, tc = 0.95:
  support = mean(0.8, 0.4, 0.2, 0.6) = 2.0 / 4 = 0.5
  base    = 0.25 + 0.60 * 0.5 = 0.55
  g(0.2)  = 1 - 0.5 * (0.2 - 0.1) / 0.4 = 0.875
  not missing: 0.95 * 0.55 * 0.875       = 0.4571875
  missing:     0.95 * 0.55 * 0.7 * 0.875 = 0.32003125
  minimum:     0.95 * 0.25 * 0.7 * 0.5   = 0.083125 (counts 0, missing, g = 0.5)
  tvd([.5,.2,.1,.1,.1], [.7,.1,.1,.05,.05]) = 0.5 * (0.2+0.1+0+0.05+0.05) = 0.2

Validates: Requirements 6.1, 6.7, 6.9, 6.10, 6.12
"""

import math

import pytest

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.errors import DataError
from gloam_pipeline.features import ScaledCounts
from gloam_pipeline.scoring import assert_valid_score, score_segment
from gloam_pipeline.shift import FEATURES, city_shift, shift_penalty, tvd

CFG = PipelineConfig()
TRAIN = [0.5, 0.2, 0.1, 0.1, 0.1]
CITY = [0.7, 0.1, 0.1, 0.05, 0.05]


def _score(counts, missing, shift):
    return score_segment("untagged", 0.4, ScaledCounts(*counts), missing, shift, CFG)


def test_confidence_not_missing():
    s = _score((0.8, 0.4, 0.2, 0.6), False, 0.2)
    assert s.confidence == pytest.approx(0.4571875)
    assert round(s.confidence, 3) == pytest.approx(0.457)
    assert s.label_source == "estimated"
    assert s.lit_probability == 0.4


def test_confidence_missing():
    s = _score((0.8, 0.4, 0.2, 0.6), True, 0.2)
    assert s.confidence == pytest.approx(0.32003125)
    assert round(s.confidence, 3) == pytest.approx(0.320)


def test_confidence_minimum():
    s = _score((0.0, 0.0, 0.0, 0.0), True, 0.5)
    assert s.confidence == pytest.approx(0.083125)
    # a larger shift cannot lower it further: g is floored at 0.5
    assert _score((0.0, 0.0, 0.0, 0.0), True, 1.0).confidence == pytest.approx(0.083125)


def test_tvd_hand_check():
    assert tvd(CITY, TRAIN) == pytest.approx(0.2)


def test_city_shift_and_penalty_hand_check():
    city = {f: CITY for f in FEATURES}
    train = {f: TRAIN for f in FEATURES}
    shift = city_shift(city, train)
    assert shift == pytest.approx(0.2)
    assert shift_penalty(shift) == pytest.approx(0.875)


def test_penalty_bounds():
    assert shift_penalty(0.0) == 1.0
    assert shift_penalty(0.10) == 1.0
    assert shift_penalty(0.50) == pytest.approx(0.5)
    assert shift_penalty(1.0) == pytest.approx(0.5)


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf, -0.01, 1.01])
def test_assert_valid_score_rejects_bad_values(bad):
    with pytest.raises(DataError) as exc:
        assert_valid_score("seg-42", "lit_probability", bad)
    assert "seg-42" in str(exc.value)
    assert "lit_probability" in str(exc.value)
    assert exc.value.segment_id == "seg-42"
    assert exc.value.field == "lit_probability"


def test_assert_valid_score_accepts_bounds():
    assert assert_valid_score("s", "confidence", 0.0) == 0.0
    assert assert_valid_score("s", "confidence", 1.0) == 1.0
