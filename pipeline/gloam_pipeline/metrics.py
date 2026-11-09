"""AUC, precision and road-type split (pure, no I/O, no scikit-learn).

Positives are `tagged_lit`, negatives are `tagged_unlit`. `untagged` segments are
unknown, not unlit, so `tagged_only` drops them before either metric (R7.2).
"""

from typing import Sequence

from .checks import check_range
from .errors import InvalidArgumentError

WALKING_PATH_HIGHWAYS = frozenset({"pedestrian", "footway", "path", "cycleway", "steps"})
_LABELS = frozenset({"tagged_lit", "tagged_unlit", "untagged"})


def road_type(highway: str) -> str:
    """'walking_path' for pedestrian, footway, path, cycleway, steps; else 'vehicle_road'."""
    if not isinstance(highway, str):
        raise InvalidArgumentError("highway", highway, "a highway type string")
    return "walking_path" if highway in WALKING_PATH_HIGHWAYS else "vehicle_road"


def tagged_only(
    scores: Sequence[float], labels: Sequence[str]
) -> tuple[list[float], list[bool]]:
    """Drop `untagged` rows; return (scores, is_positive) for tagged rows in input order."""
    if len(scores) != len(labels):
        raise InvalidArgumentError(
            "labels", f"{len(labels)} items", f"{len(scores)} items, same as scores"
        )
    out_scores: list[float] = []
    out_pos: list[bool] = []
    for s, label in zip(scores, labels):
        check_range("scores", s, 0.0, 1.0)
        if label not in _LABELS:
            raise InvalidArgumentError("labels", label, "tagged_lit, tagged_unlit or untagged")
        if label != "untagged":
            out_scores.append(s)
            out_pos.append(label == "tagged_lit")
    return out_scores, out_pos


def _validate(scores: Sequence[float], is_positive: Sequence[bool]) -> None:
    if len(scores) != len(is_positive):
        raise InvalidArgumentError(
            "is_positive", f"{len(is_positive)} items", f"{len(scores)} items, same as scores"
        )
    for s in scores:
        check_range("scores", s, 0.0, 1.0)
    for p in is_positive:
        if not isinstance(p, bool):
            raise InvalidArgumentError("is_positive", p, "True or False")


def auc(scores: Sequence[float], is_positive: Sequence[bool]) -> float | None:
    """Mann-Whitney AUC with average ranks for ties. None when no positives or no negatives."""
    _validate(scores, is_positive)
    n_pos = sum(is_positive)
    n_neg = len(is_positive) - n_pos
    if n_pos == 0 or n_neg == 0:
        return None
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks = [0.0] * len(scores)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1  # 1-based average rank of the tied group
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    rank_sum = sum(r for r, p in zip(ranks, is_positive) if p)
    return (rank_sum - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def precision_at(
    scores: Sequence[float], is_positive: Sequence[bool], cutoff: float = 0.5
) -> float | None:
    """TP / (TP + FP) with predicted lit meaning score >= cutoff. None when nothing is predicted lit."""
    check_range("cutoff", cutoff, 0.0, 1.0)
    _validate(scores, is_positive)
    predicted = [p for s, p in zip(scores, is_positive) if s >= cutoff]
    if not predicted:
        return None
    return sum(predicted) / len(predicted)
