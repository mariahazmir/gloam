"""Weighted positive-unlabeled logistic regression (pure, no file I/O).

Only `fit` imports scikit-learn. `predict` is plain numpy so saved models give the
same output wherever the JSON is read (R5.7).
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np

from .baselines import learn_highway_rates, learn_pair_rates
from .checks import check_count_between, check_range
from .errors import InvalidArgumentError, TrainingError
from .features import FOOTWAY_ORDER
from .shift import pool_histograms

SCHEMA_VERSION = 1
LABELS = ("tagged_lit", "tagged_unlit", "untagged")
TAGGED_LIT_WEIGHT = 1.0
TAGGED_UNLIT_WEIGHT = 1.0
MAX_CITIES = 20


@dataclass(frozen=True)
class TrainingRow:
    """One segment: city, id, highway type, footway kind, label and its model vector."""

    city_id: str
    segment_id: int
    highway: str
    footway_kind: str
    label: str
    vector: tuple


def row_target_and_weight(label: str, untagged_weight: float) -> tuple[int, float]:
    """tagged_lit -> (1, 1); tagged_unlit -> (0, 1); untagged -> (0, untagged_weight)."""
    check_range("untagged_weight", untagged_weight, 0, 1, True, True)
    if label == "tagged_lit":
        return 1, TAGGED_LIT_WEIGHT
    if label == "tagged_unlit":
        return 0, TAGGED_UNLIT_WEIGHT
    if label == "untagged":
        return 0, float(untagged_weight)
    raise InvalidArgumentError("label", label, "tagged_lit, tagged_unlit or untagged")


def _check_rows(rows: Sequence[TrainingRow], n_features: int) -> None:
    for r in rows:
        if r.footway_kind not in FOOTWAY_ORDER:
            raise InvalidArgumentError(
                "footway_kind", r.footway_kind, "one of " + ", ".join(FOOTWAY_ORDER)
            )
        if r.label not in LABELS:
            raise InvalidArgumentError("label", r.label, "tagged_lit, tagged_unlit or untagged")
        if len(r.vector) != n_features:
            raise InvalidArgumentError(
                "vector", f"{len(r.vector)} values", f"{n_features} values (one per feature)"
            )
        for v in r.vector:
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
                raise InvalidArgumentError("vector", v, "finite numbers")


def fit(
    rows: Sequence[TrainingRow],
    feature_names: Sequence[str],
    city_histograms: Mapping[str, Mapping[str, Sequence[int]]],
    untagged_weight: float = 0.2,
    seed: int = 0,
    held_out_city: str | None = None,
) -> tuple[dict, str]:
    """Train and return (model dict, training log text). Writes nothing.

    `city_histograms` maps city id to its raw-count histograms (shift.count_histograms).
    """
    check_range("untagged_weight", untagged_weight, 0, 1, True, True)
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise InvalidArgumentError("seed", seed, "an integer")
    names = list(feature_names)
    if not names:
        raise InvalidArgumentError("feature_names", "0 names", "at least 1 name")
    _check_rows(rows, len(names))

    cities = sorted({r.city_id for r in rows})
    check_count_between("training cities", cities, 1, MAX_CITIES)
    if held_out_city is not None:
        if held_out_city not in cities:
            raise InvalidArgumentError(
                "held_out_city", held_out_city, "one of the available cities: " + ", ".join(cities)
            )
        if len(cities) == 1:
            raise InvalidArgumentError(
                "held_out_city", held_out_city, "a city that leaves at least one training city"
            )
    train_cities = [c for c in cities if c != held_out_city]
    train_rows = sorted(
        (r for r in rows if r.city_id != held_out_city), key=lambda r: (r.city_id, r.segment_id)
    )

    counts = {label: sum(1 for r in train_rows if r.label == label) for label in LABELS}
    where = f"training cities checked: {', '.join(train_cities)}"
    if counts["tagged_lit"] == 0:
        raise TrainingError(f"found 0 tagged_lit segments; {where}")
    if counts["tagged_unlit"] + counts["untagged"] == 0:
        raise TrainingError(f"found 0 rows with target 0 (no tagged_unlit or untagged); {where}")
    for c in train_cities:
        if c not in city_histograms:
            raise InvalidArgumentError("city_histograms", f"missing {c}", "a histogram per training city")

    targets, weights = zip(*(row_target_and_weight(r.label, untagged_weight) for r in train_rows))
    x = np.array([r.vector for r in train_rows], dtype=float)

    from sklearn.linear_model import LogisticRegression  # only place scikit-learn is used

    clf = LogisticRegression(C=1.0, solver="lbfgs", max_iter=1000, random_state=seed)
    clf.fit(x, np.array(targets), sample_weight=np.array(weights))

    rates = learn_highway_rates([(r.highway, r.label) for r in train_rows])
    pairs = learn_pair_rates([(r.highway, r.footway_kind, r.label) for r in train_rows])
    pair_rates: dict[str, dict[str, float]] = {}
    for (highway, kind), rate in sorted(pairs.rates.items()):
        pair_rates.setdefault(highway, {})[kind] = rate
    model = {
        "schema_version": SCHEMA_VERSION,
        "feature_names": names,
        "intercept": float(clf.intercept_[0]),
        "coefficients": [float(c) for c in clf.coef_[0]],
        "training_cities": train_cities,
        "held_out_city": held_out_city,
        "untagged_weight": float(untagged_weight),
        "seed": seed,
        "highway_rates": dict(sorted(rates.rates.items())),
        "pair_rates": pair_rates,
        "overall_lit_rate": rates.overall_lit_rate,
        "unseen_highway_types": rates.unseen_highway_types,
        "training_histograms": pool_histograms([city_histograms[c] for c in train_cities]),
    }
    return model, training_log(model, counts)


def sigmoid(z: np.ndarray) -> np.ndarray:
    """Numerically stable logistic function."""
    e = np.exp(-np.abs(z))
    return np.where(z >= 0, 1.0 / (1.0 + e), e / (1.0 + e))


def predict(model: Mapping, vectors: Sequence[Sequence[float]]) -> list[float]:
    """Lit probability per vector: sigmoid(x @ w + b). Pure numpy, no scikit-learn."""
    w = np.array(model["coefficients"], dtype=float)
    x = np.array(vectors, dtype=float)
    if x.size == 0:
        return []
    if x.ndim != 2 or x.shape[1] != w.shape[0]:
        raise InvalidArgumentError(
            "vectors", f"shape {tuple(x.shape)}", f"rows of {w.shape[0]} values"
        )
    if not np.all(np.isfinite(x)):
        raise InvalidArgumentError("vectors", "non-finite value", "finite numbers")
    return [float(p) for p in sigmoid(x @ w + float(model["intercept"]))]


def feature_importance(model: Mapping) -> list[tuple[str, float]]:
    """(name, |coefficient|) for every feature, highest first, ties by name."""
    pairs = [(n, abs(float(c))) for n, c in zip(model["feature_names"], model["coefficients"])]
    return sorted(pairs, key=lambda p: (-p[1], p[0]))


def training_log(model: Mapping, counts: Mapping[str, int]) -> str:
    """Plain-text log for one training run (R5.3, R5.6, R5.10)."""
    lines = [
        "Untagged segments are unknown, not unlit; they are used as low-weight negatives.",
        f"Weights: tagged_lit={TAGGED_LIT_WEIGHT:g}, tagged_unlit={TAGGED_UNLIT_WEIGHT:g}, "
        f"untagged={model['untagged_weight']:g}",
        "Training cities: " + ", ".join(model["training_cities"]),
        f"Held-out city: {model['held_out_city'] or 'none'}",
        f"Seed: {model['seed']}",
        "Rows: " + ", ".join(f"{label}={counts[label]}" for label in LABELS),
        "Feature importance (|coefficient|, highest first):",
    ]
    lines += [f"  {i}. {n}: {v:.6f}" for i, (n, v) in enumerate(feature_importance(model), 1)]
    return "\n".join(lines) + "\n"
