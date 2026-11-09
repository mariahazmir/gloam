"""Property 21: tagged-only metrics and road-type minimums. Validates: Requirements 4.6, 4.8, 7.2, 7.3, 7.4, 7.5, 7.8."""

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from gloam_pipeline.baselines import learn_highway_rates, learn_pair_rates
from gloam_pipeline.metrics import road_type
from gloam_pipeline.model import TrainingRow, fit
from gloam_pipeline.validation import (
    METHODS,
    ROAD_TYPES,
    ValidationError,
    _road_type_metrics,
    check_identical_segment_sets,
    hold_one_out,
    score_methods,
)
from strategies import FOOTWAY_KINDS

# Feature: gloam-data-pipeline, Property 21: Metrics use tagged segments only and respect road-type minimums
# **Validates: Requirements 4.6, 4.8, 7.2, 7.3, 7.4, 7.5, 7.8**

FEATURES = ["f0", "f1"]
HIGHWAYS = ["residential", "primary", "footway", "path"]
LABELS = ["tagged_lit", "tagged_unlit", "untagged"]
SMALL = settings(
    max_examples=30, deadline=None, suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large]
)

_score = st.sampled_from([0.0, 0.2, 0.5, 0.5, 0.8, 1.0])
_value = st.floats(min_value=-3, max_value=3, allow_nan=False, allow_infinity=False)
_vector = st.tuples(_value, _value)


def _hist(seed: int) -> dict:
    return {
        "bus_stops": [seed, 1, 2, 3, 4],
        "food_places": [1, seed, 2, 3, 4],
        "shops": [1, 2, seed, 3, 4],
        "buildings": [1, 2, 3, seed, 4],
    }


# ------------------------------------------------ _road_type_metrics directly

# (label, score per method) rows; the same segments are scored by every method.
_scored_rows = st.lists(
    st.tuples(st.sampled_from(LABELS), _score, _score, _score, _score), max_size=20
)


def _by_method(rows):
    return {
        m: [(i, "residential", r[0], r[1 + k]) for i, r in enumerate(rows)]
        for k, m in enumerate(METHODS)
    }


@SMALL
@given(rows=_scored_rows, extra=_scored_rows)
def test_untagged_rows_never_change_auc_or_precision(rows, extra):
    base = [r for r in rows]
    extra_untagged = [("untagged", *r[1:]) for r in extra]
    a = _road_type_metrics("c", "vehicle_road", _by_method(base), 1)
    b = _road_type_metrics("c", "vehicle_road", _by_method(base + extra_untagged), 1)
    assert a.skipped == b.skipped
    assert dict(a.auc) == dict(b.auc)
    assert dict(a.precision) == dict(b.precision)
    assert b.counts["untagged"] == a.counts["untagged"] + len(extra_untagged)
    assert b.counts["tagged_unlit"] == a.counts["tagged_unlit"]


@SMALL
@given(rows=_scored_rows, threshold=st.integers(1, 8))
def test_road_type_computed_iff_enough_tagged_unlit(rows, threshold):
    cm = _road_type_metrics("c", "walking_path", _by_method(rows), threshold)
    n_unlit = sum(1 for r in rows if r[0] == "tagged_unlit")
    assert cm.counts["tagged_unlit"] == n_unlit
    assert cm.threshold == threshold
    if n_unlit < threshold:
        assert cm.skipped is not None
        assert str(n_unlit) in cm.skipped and str(threshold) in cm.skipped
        assert all(v is None for v in cm.auc.values())
        assert all(v is None for v in cm.precision.values())
    else:
        assert cm.skipped is None
        assert set(cm.auc) == set(METHODS)
        assert set(cm.precision) == set(METHODS)


def test_skipped_road_type_hand_example():
    rows = [("tagged_lit", 0.9, 0.9, 0.9, 0.9), ("tagged_unlit", 0.1, 0.1, 0.1, 0.1)]
    cm = _road_type_metrics("c", "walking_path", _by_method(rows), 2)
    assert cm.skipped == "1 tagged_unlit segments, threshold 2"
    ok = _road_type_metrics("c", "walking_path", _by_method(rows), 1)
    assert ok.skipped is None and ok.auc["model"] == 1.0 and ok.precision["model"] == 1.0


# ------------------------------------------------ hold_one_out


@st.composite
def _city_rows(draw, city):
    """Fixed tagged_lit and tagged_unlit rows, plus a few random ones."""
    rows = [
        TrainingRow(city, 0, "primary", draw(FOOTWAY_KINDS), "tagged_lit", draw(_vector)),
        TrainingRow(city, 1, "footway", draw(FOOTWAY_KINDS), "tagged_unlit", draw(_vector)),
    ]
    for i in range(draw(st.integers(0, 6))):
        rows.append(
            TrainingRow(
                city,
                10 + i,
                draw(st.sampled_from(HIGHWAYS)),
                draw(FOOTWAY_KINDS),
                draw(st.sampled_from(LABELS)),
                draw(_vector),
            )
        )
    return rows


@st.composite
def _world(draw):
    return {c: draw(_city_rows(c)) for c in ("c1", "c2", "c3")}


_HISTS = {"c1": _hist(3), "c2": _hist(5), "c3": _hist(7)}


@SMALL
@given(world=_world(), min_city=st.integers(1, 4), min_road=st.integers(1, 4))
def test_hold_one_out_respects_city_and_road_type_minimums(world, min_city, min_road):
    result = hold_one_out(world, _HISTS, FEATURES, min_city, min_road)

    skipped_ids = {s.city for s in result.skipped_cities}
    measured_ids = {m.city for m in result.metrics}
    assert skipped_ids.isdisjoint(measured_ids)

    for city, rows in world.items():
        n_unlit = sum(1 for r in rows if r.label == "tagged_unlit")
        assert result.class_counts[city]["tagged_unlit"] == n_unlit
        if n_unlit < min_city:
            assert city in skipped_ids and city not in measured_ids
            entry = next(s for s in result.skipped_cities if s.city == city)
            assert (entry.tagged_unlit, entry.threshold) == (n_unlit, min_city)
        else:
            assert city in measured_ids and city not in skipped_ids
            # exactly one entry per road type, and no combined figure
            mine = [m for m in result.metrics if m.city == city]
            assert sorted(m.road_type for m in mine) == sorted(ROAD_TYPES)
            totals = {"tagged_lit": 0, "tagged_unlit": 0, "untagged": 0}
            for m in mine:
                expected = sum(
                    1 for r in rows if r.label == "tagged_unlit" and road_type(r.highway) == m.road_type
                )
                assert m.counts["tagged_unlit"] == expected
                assert m.threshold == min_road
                if expected < min_road:
                    assert m.skipped is not None
                    assert all(v is None for v in m.auc.values())
                    assert all(v is None for v in m.precision.values())
                else:
                    assert m.skipped is None
                for k in totals:
                    totals[k] += m.counts[k]
            # every segment belongs to exactly one road type
            assert totals == result.class_counts[city]


@SMALL
@given(
    world=_world(),
    extra=st.lists(st.tuples(st.sampled_from(HIGHWAYS), _vector), min_size=1, max_size=5),
)
def test_untagged_rows_in_held_out_city_never_change_its_metrics(world, extra):
    more = [TrainingRow("c1", 100 + i, h, "none", "untagged", v) for i, (h, v) in enumerate(extra)]
    changed = {**world, "c1": world["c1"] + more}
    a = hold_one_out(world, _HISTS, FEATURES, 1, 1)
    b = hold_one_out(changed, _HISTS, FEATURES, 1, 1)
    ma = {m.road_type: m for m in a.metrics if m.city == "c1"}
    mb = {m.road_type: m for m in b.metrics if m.city == "c1"}
    assert ma.keys() == mb.keys()
    for rt in ma:
        assert ma[rt].skipped == mb[rt].skipped
        assert dict(ma[rt].auc) == dict(mb[rt].auc)
        assert dict(ma[rt].precision) == dict(mb[rt].precision)
        assert mb[rt].counts["tagged_lit"] == ma[rt].counts["tagged_lit"]
        assert mb[rt].counts["tagged_unlit"] == ma[rt].counts["tagged_unlit"]


# ------------------------------------------------ identical segment sets (R4.6, R4.8)


@SMALL
@given(world=_world())
def test_score_methods_return_same_segment_ids_in_every_split(world):
    all_rows = [r for rows in world.values() for r in rows]
    for city, rows in world.items():
        model, _log = fit(all_rows, FEATURES, _HISTS, 0.2, 0, held_out_city=city)
        train = [r for r in all_rows if r.city_id != city]
        rates = learn_highway_rates([(r.highway, r.label) for r in train])
        pairs = learn_pair_rates([(r.highway, r.footway_kind, r.label) for r in train])
        scored = score_methods(model, rates, pairs, rows)
        assert set(scored) == set(METHODS)
        expected = sorted(r.segment_id for r in rows)
        for rtype in (None, *ROAD_TYPES):
            for m in METHODS:
                ids = [
                    row[0] for row in scored[m] if rtype is None or road_type(row[1]) == rtype
                ]
                want = expected if rtype is None else sorted(
                    r.segment_id for r in rows if road_type(r.highway) == rtype
                )
                assert sorted(ids) == want, (city, rtype, m)


@SMALL
@given(
    n=st.integers(1, 6),
    bad=st.sampled_from(METHODS),
    split=st.sampled_from(["all", *ROAD_TYPES]),
    drop=st.booleans(),
)
def test_mismatched_segment_set_raises_naming_city_and_split(n, bad, split, drop):
    by_method = {m: [(i, "residential", "tagged_lit", 0.5) for i in range(n)] for m in METHODS}
    by_method[bad] = by_method[bad][1:] if drop else by_method[bad] + [(99, "residential", "tagged_lit", 0.5)]
    with pytest.raises(ValidationError) as exc:
        check_identical_segment_sets("cityX", split, by_method)
    msg = str(exc.value)
    assert "cityX" in msg and split in msg
    # The odd method is named, including `model`.
    assert bad in msg


@SMALL
@given(world=_world(), min_road=st.integers(1, 3))
def test_validated_metrics_have_all_four_methods(world, min_road):
    result = hold_one_out(world, _HISTS, FEATURES, 1, min_road)
    assert result.metrics
    for m in result.metrics:
        assert set(m.auc) == set(METHODS)
        assert set(m.precision) == set(METHODS)
