"""Rule and highway-rate baselines (pure, no I/O). Both read the highway class alone."""

from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence

from .classify import SEGMENT_HIGHWAYS
from .errors import InvalidArgumentError, TrainingError
from .features import FOOTWAY_ORDER, HIGHWAY_ORDER

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


@dataclass(frozen=True)
class PairRates:
    """Lit rate per (highway, footway_kind) pair, from training tagged segments only."""

    rates: Mapping[tuple[str, str], float]
    highway_rates: HighwayRates
    overall_lit_rate: float


def _check_footway_kind(name: str, kind: object) -> str:
    if not isinstance(kind, str) or kind not in FOOTWAY_ORDER:
        raise InvalidArgumentError(name, kind, "one of " + ", ".join(FOOTWAY_ORDER))
    return kind


def learn_pair_rates(training: Sequence[tuple[str, str, str]]) -> PairRates:
    """Learn lit / (lit + unlit) per (highway, footway_kind) from training rows.

    Untagged rows are skipped. Raises TrainingError when no tagged rows exist.
    """
    rows = list(training)
    counts: dict[tuple[str, str], list[int]] = {}
    for highway, kind, label in rows:
        _check_highway("training highway", highway)
        _check_footway_kind("training footway_kind", kind)
        if label in (_LIT, _UNLIT):
            pair = counts.setdefault((highway, kind), [0, 0])
            pair[0 if label == _LIT else 1] += 1
    # Validates labels and raises TrainingError when nothing is tagged.
    highway_rates = learn_highway_rates([(h, label) for h, _, label in rows])
    return PairRates(
        rates={k: p[0] / (p[0] + p[1]) for k, p in counts.items()},
        highway_rates=highway_rates,
        overall_lit_rate=highway_rates.overall_lit_rate,
    )


def highway_footway_rate_baseline(pairs: PairRates, highway: str, footway_kind: str) -> float:
    """Pair rate, else highway-type rate, else the overall lit rate."""
    if not isinstance(highway, str) or highway not in HIGHWAY_ORDER:
        raise InvalidArgumentError("highway", highway, "one of " + ", ".join(HIGHWAY_ORDER))
    _check_footway_kind("footway_kind", footway_kind)
    rate = pairs.rates.get((highway, footway_kind))
    if rate is not None:
        return rate
    return pairs.highway_rates.rates.get(highway, pairs.overall_lit_rate)


def pair_fallback_counts(
    pairs: PairRates, city_pairs: Iterable[tuple[str, str]]
) -> tuple[int, int]:
    """(type_fallback_pairs, overall_fallback_pairs) over distinct city pairs.

    Only pairs with no tagged training segments count; they split by whether
    their highway type has training data.
    """
    type_fallback = overall_fallback = 0
    for pair in set(city_pairs):
        if pair in pairs.rates:
            continue
        if pair[0] in pairs.highway_rates.rates:
            type_fallback += 1
        else:
            overall_fallback += 1
    return type_fallback, overall_fallback
