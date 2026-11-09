"""Per-segment lit probability and confidence (pure, no I/O)."""

import math
from dataclasses import dataclass

from .checks import check_range
from .config import PipelineConfig
from .errors import DataError, InvalidArgumentError
from .features import ScaledCounts
from .shift import shift_penalty

LABELS = ("tagged_lit", "tagged_unlit", "untagged")
MISSING_FACTOR = 0.7
SUPPORT_BASE = 0.25
SUPPORT_SLOPE = 0.60


@dataclass(frozen=True)
class Score:
    lit_probability: float
    confidence: float
    label_source: str  # tagged_lit | tagged_unlit | estimated


def assert_valid_score(segment_id: object, field: str, value: float) -> float:
    """Raise DataError unless value is a finite number in 0 to 1."""
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not 0.0 <= value <= 1.0
    ):
        raise DataError(segment_id, field, value)
    return value


def score_segment(
    label: str,
    model_prob: float,
    features: ScaledCounts,
    missing: bool,
    shift: float,
    cfg: PipelineConfig,
) -> Score:
    """Score one segment. Tagged segments ignore counts and the model (R6.1 to R6.3)."""
    if label not in LABELS:
        raise InvalidArgumentError("label", label, "tagged_lit, tagged_unlit or untagged")
    check_range("model_prob", model_prob, 0.0, 1.0)
    check_range("shift", shift, 0.0, 1.0)
    if not isinstance(missing, bool):
        raise InvalidArgumentError("missing", missing, "True or False")
    counts = (
        ("bus_stops", features.bus_stops),
        ("food_places", features.food_places),
        ("shops", features.shops),
        ("buildings", features.buildings),
    )
    for name, v in counts:
        check_range(f"features.{name}", v, 0.0, 1.0)

    if label == "tagged_lit":
        return Score(cfg.high_value, cfg.tagged_confidence, "tagged_lit")
    if label == "tagged_unlit":
        return Score(cfg.low_value, cfg.tagged_confidence, "tagged_unlit")

    support = sum(v for _, v in counts) / 4
    conf = (
        cfg.tagged_confidence
        * (SUPPORT_BASE + SUPPORT_SLOPE * support)
        * (MISSING_FACTOR if missing else 1.0)
        * shift_penalty(shift)
    )
    return Score(model_prob, min(1.0, max(0.0, conf)), "estimated")
