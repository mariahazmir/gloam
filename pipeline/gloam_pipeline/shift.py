"""Distribution shift between a city and the pooled training cities (pure, no I/O).

Each raw count is binned into {0, 1, 2, 3 to 5, 6 or more}. The city shift is the
mean over the four features of the total variation distance between bin
proportions (R6.10).
"""

from collections.abc import Iterable, Mapping, Sequence

from .checks import check_range
from .errors import InvalidArgumentError
from .features import RawFeatures

FEATURES = ("bus_stops", "food_places", "shops", "buildings")
N_BINS = 5
T_LOW = 0.10
T_HIGH = 0.50


def bin_index(count: int) -> int:
    """Bin 0, 1, 2, 3 to 5, 6 or more -> 0 to 4."""
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise InvalidArgumentError("count", count, "an integer of 0 or more")
    if count <= 2:
        return count
    return 3 if count <= 5 else 4


def count_histograms(features: Iterable[RawFeatures]) -> dict[str, list[int]]:
    """Bin counts per feature over segments with missing=False."""
    hist = {f: [0] * N_BINS for f in FEATURES}
    for rf in features:
        if rf.missing:
            continue
        for f in FEATURES:
            hist[f][bin_index(getattr(rf, f))] += 1
    return hist


def to_proportions(counts: Sequence[int]) -> list[float]:
    """Counts -> proportions; all zeros when there are no counts."""
    if len(counts) != N_BINS:
        raise InvalidArgumentError("counts", f"{len(counts)} bins", f"{N_BINS} bins")
    for c in counts:
        if isinstance(c, bool) or not isinstance(c, int) or c < 0:
            raise InvalidArgumentError("counts", c, "integers of 0 or more")
    total = sum(counts)
    return [c / total for c in counts] if total else [0.0] * N_BINS


def city_proportions(features: Iterable[RawFeatures]) -> dict[str, list[float]]:
    """Bin proportions per feature for one city."""
    return {f: to_proportions(c) for f, c in count_histograms(features).items()}


def pool_histograms(
    city_counts: Sequence[Mapping[str, Sequence[int]]],
) -> dict[str, list[float]]:
    """Pool per-city count histograms into training proportions (for model.json)."""
    pooled = {f: [0] * N_BINS for f in FEATURES}
    for counts in city_counts:
        for f in FEATURES:
            if f not in counts:
                raise InvalidArgumentError("city_counts", f"missing {f}", "all four features")
            to_proportions(counts[f])  # validates shape and values
            for i, c in enumerate(counts[f]):
                pooled[f][i] += c
    return {f: to_proportions(c) for f, c in pooled.items()}


def _check_proportions(name: str, p: Sequence[float]) -> None:
    if len(p) != N_BINS:
        raise InvalidArgumentError(name, f"{len(p)} bins", f"{N_BINS} bins")
    for v in p:
        check_range(name, v, 0.0, 1.0)


def tvd(p_city: Sequence[float], p_train: Sequence[float]) -> float:
    """0.5 * sum |p_city - p_train|. An empty side (all zeros) gives 0: no evidence."""
    _check_proportions("p_city", p_city)
    _check_proportions("p_train", p_train)
    if not sum(p_city) or not sum(p_train):
        return 0.0
    d = 0.5 * sum(abs(a - b) for a, b in zip(p_city, p_train))
    return min(1.0, max(0.0, d))


def city_shift(
    city: Mapping[str, Sequence[float]], train: Mapping[str, Sequence[float]]
) -> float:
    """Mean total variation distance over the four features, in 0 to 1."""
    for name, hists in (("city", city), ("train", train)):
        for f in FEATURES:
            if f not in hists:
                raise InvalidArgumentError(name, f"missing {f}", "all four features")
    total = sum(tvd(city[f], train[f]) for f in FEATURES)
    return min(1.0, max(0.0, total / len(FEATURES)))


def shift_penalty(shift: float) -> float:
    """g(shift) = 1 - 0.5 * clamp((shift - T_LOW) / (T_HIGH - T_LOW), 0, 1)."""
    check_range("shift", shift, 0.0, 1.0)
    t = min(1.0, max(0.0, (shift - T_LOW) / (T_HIGH - T_LOW)))
    return 1.0 - 0.5 * t
