"""Rule and highway-rate baselines (pure, no I/O). Both read the highway class alone."""

from dataclasses import dataclass
from typing import Mapping, Sequence

from .classify import SEGMENT_HIGHWAYS
from .errors import InvalidArgumentError, TrainingError

RULE_LIT_CLASSES = frozenset({"primary", "secondary", "tertiary"})

_LIT = "tagged_lit"
_UNLIT = "tagged_unlit"
_UNTAGGED = "untagged"


@dataclass(frozen=True)
class HighwayRates:
    """Lit rate per highway type, learned from training tagged segments only."""

    rates: Mapping[str, float]
    overall_lit_rate: float
    # How many of the 16 walkable types (SEGMENT_HIGHWAYS) have no tagged_lit or
    # tagged_unlit training segment, including types absent from training.
    # Tagged types outside the 16 still get rates but are not counted.
    unseen_highway_types: int


def _check_highway(name: str, highway: object) -> str:
    if not isinstance(highway, str):
        raise InvalidArgumentError(name, highway, "a highway class string")
    return highway


def rule_baseline(highway: str) -> float:
    """1.0 when the class is exactly primary, secondary or tertiary, else 0.0."""
    _check_highway("highway", highway)
    return 1.0 if highway in RULE_LIT_CLASSES else 0.0


def learn_highway_rates(training: Sequence[tuple[str, str]]) -> HighwayRates:
    """Learn lit / (lit + unlit) per highway type from (highway, label) rows.

    Only tagged_lit and tagged_unlit rows count toward rates. Raises TrainingError
    when there are none.
    """
    counts: dict[str, list[int]] = {}
    for row in training:
        highway, label = row
        _check_highway("training highway", highway)
        if label not in (_LIT, _UNLIT, _UNTAGGED):
            raise InvalidArgumentError(
                "training label", label, "tagged_lit, tagged_unlit or untagged"
            )
        if label == _UNTAGGED:
            continue
        pair = counts.setdefault(highway, [0, 0])
        pair[0 if label == _LIT else 1] += 1
    total_lit = sum(p[0] for p in counts.values())
    total_unlit = sum(p[1] for p in counts.values())
    if total_lit + total_unlit == 0:
        raise TrainingError(
            "no tagged_lit or tagged_unlit segments in the training set"
        )
    return HighwayRates(
        rates={h: p[0] / (p[0] + p[1]) for h, p in counts.items()},
        overall_lit_rate=total_lit / (total_lit + total_unlit),
        unseen_highway_types=len(SEGMENT_HIGHWAYS - counts.keys()),
    )


def highway_rate_baseline(rates: HighwayRates, highway: str) -> float:
    """Training lit rate of the highway type, or the overall lit rate if unseen."""
    _check_highway("highway", highway)
    return rates.rates.get(highway, rates.overall_lit_rate)
