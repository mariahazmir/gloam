"""Property 23: the did-not-beat statement. Validates: Requirement 7.9."""

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from gloam_pipeline.report import render_validation
from gloam_pipeline.validation import BASELINES, CityMetrics, DidNotBeat, ValidationResult, did_not_beat

# Feature: gloam-data-pipeline, Property 23: The did-not-beat statement appears exactly when it should
# **Validates: Requirements 7.9**

SMALL = settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])

BASELINE_TEXT = {"rule": "rule baseline", "highway_rate": "highway-rate baseline",
                 "highway_footway_rate": "highway-footway-rate baseline"}
ROAD_TEXT = {"walking_path": "walking paths", "vehicle_road": "vehicle roads"}
PREFIX = "- The model did not beat the "

# None, a few exact values (so ties are common), or any float in [0, 1].
_auc = st.one_of(
    st.none(),
    st.sampled_from([0.0, 0.25, 0.5, 0.75, 1.0]),
    st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
)
_aucs = st.fixed_dictionaries({"model": _auc, "rule": _auc, "highway_rate": _auc, "highway_footway_rate": _auc})
_none = {"model": None, "rule": None, "highway_rate": None, "highway_footway_rate": None}
_COUNTS = {"tagged_lit": 5, "tagged_unlit": 5, "untagged": 0}


def _metrics(city: str, rtype: str, aucs: dict) -> CityMetrics:
    return CityMetrics(city, rtype, _COUNTS, 1, None, aucs, _none)


def _result(metrics: list[CityMetrics]) -> ValidationResult:
    beaten = [d for m in metrics for d in did_not_beat(m)]
    cities = {m.city for m in metrics}
    return ValidationResult({c: dict(_COUNTS) for c in cities}, [], metrics, beaten, {})


def _statement_lines(text: str) -> list[str]:
    return [line for line in text.splitlines() if line.startswith(PREFIX)]


def _expected_line(city: str, rtype: str, baseline: str, model: float, base: float) -> str:
    name = BASELINE_TEXT[baseline]
    return (
        f"{PREFIX}{name} for {city}, {ROAD_TEXT[rtype]}: "
        f"model AUC {model:.3f}, {name} AUC {base:.3f}."
    )


@SMALL
@given(m_aucs=_aucs, rtype=st.sampled_from(sorted(ROAD_TEXT)))
def test_entry_iff_both_defined_and_model_not_higher(m_aucs, rtype):
    entries = did_not_beat(_metrics("kl", rtype, m_aucs))
    expected = [
        b
        for b in BASELINES
        if m_aucs["model"] is not None and m_aucs[b] is not None and m_aucs["model"] <= m_aucs[b]
    ]
    assert [e.baseline for e in entries] == expected
    for e in entries:
        assert (e.city, e.road_type) == ("kl", rtype)
        assert e.model_auc == m_aucs["model"] and e.baseline_auc == m_aucs[e.baseline]


@SMALL
@given(per_group=st.lists(_aucs, min_size=0, max_size=4), rtypes=st.lists(st.sampled_from(sorted(ROAD_TEXT)), min_size=4, max_size=4))
def test_report_has_statement_exactly_for_entries(per_group, rtypes):
    # Unique (city, road type) per group so each statement line is distinguishable.
    metrics = [_metrics(f"city{i}", rtypes[i], a) for i, a in enumerate(per_group)]
    text = render_validation(_result(metrics))
    expected = []
    for m in metrics:
        a = m.auc
        for b in BASELINES:
            if a["model"] is not None and a[b] is not None and a["model"] <= a[b]:
                expected.append(_expected_line(m.city, m.road_type, b, a["model"], a[b]))
    assert _statement_lines(text) == expected
    if not expected:
        assert "did not beat" not in text


@SMALL
@given(
    model=st.floats(min_value=0.1, max_value=0.9, allow_nan=False),
    offsets=st.fixed_dictionaries({b: st.sampled_from([-0.05, 0.0, 0.05, None]) for b in BASELINES}),
)
def test_each_baseline_decided_separately(model, offsets):
    # Mixed cases: the model beats some baselines, ties or loses to others, some undefined.
    aucs = {"model": model}
    for b, off in offsets.items():
        aucs[b] = None if off is None else model + off
    text = render_validation(_result([_metrics("kl", "walking_path", aucs)]))
    lines = _statement_lines(text)
    expected = [
        _expected_line("kl", "walking_path", b, model, aucs[b])
        for b in BASELINES
        if aucs[b] is not None and model <= aucs[b]
    ]
    assert lines == expected


# ------------------------------------------------------------ hand-checked examples


def test_tie_with_only_footway_baseline_gives_one_statement():
    m = _metrics("kl", "walking_path",
                 {"model": 0.5, "rule": 0.4, "highway_rate": 0.3, "highway_footway_rate": 0.5})
    assert did_not_beat(m) == [DidNotBeat("kl", "walking_path", "highway_footway_rate", 0.5, 0.5)]
    assert _statement_lines(render_validation(_result([m]))) == [
        "- The model did not beat the highway-footway-rate baseline for kl, walking paths: "
        "model AUC 0.500, highway-footway-rate baseline AUC 0.500."
    ]


def test_footway_baseline_renders_three_decimals():
    m = _metrics("kl", "vehicle_road", {"model": 0.7, "highway_footway_rate": 0.72})
    text = render_validation(_result([m]))
    assert "model AUC 0.700, highway-footway-rate baseline AUC 0.720." in text
    assert len(_statement_lines(text)) == 1


def test_undefined_footway_auc_gives_no_statement():
    m = _metrics("kl", "walking_path",
                 {"model": 0.5, "rule": 0.9, "highway_rate": 0.1, "highway_footway_rate": None})
    assert [e.baseline for e in did_not_beat(m)] == ["rule"]
    text = render_validation(_result([m]))
    assert "highway-footway-rate" not in text


def test_tie_counts_as_did_not_beat():
    m = _metrics("kl", "walking_path", {"model": 0.5, "rule": 0.5, "highway_rate": 0.4})
    assert did_not_beat(m) == [DidNotBeat("kl", "walking_path", "rule", 0.5, 0.5)]
    text = render_validation(_result([m]))
    assert _statement_lines(text) == [
        "- The model did not beat the rule baseline for kl, walking paths: "
        "model AUC 0.500, rule baseline AUC 0.500."
    ]


def test_model_strictly_higher_gives_no_statement():
    m = _metrics("kl", "vehicle_road", {"model": 0.8, "rule": 0.7, "highway_rate": 0.6})
    assert did_not_beat(m) == []
    text = render_validation(_result([m]))
    assert _statement_lines(text) == []
    assert "did not beat" not in text


def test_undefined_auc_gives_no_statement():
    for aucs in (
        {"model": None, "rule": 0.9, "highway_rate": 0.9},
        {"model": 0.1, "rule": None, "highway_rate": None, "highway_footway_rate": None},
    ):
        m = _metrics("kl", "walking_path", aucs)
        assert did_not_beat(m) == []
        assert _statement_lines(render_validation(_result([m]))) == []


def test_lower_model_renders_three_decimals_for_highway_rate():
    m = _metrics("london", "vehicle_road", {"model": 0.61234, "rule": 0.5, "highway_rate": 0.7})
    text = render_validation(_result([m]))
    assert _statement_lines(text) == [
        "- The model did not beat the highway-rate baseline for london, vehicle roads: "
        "model AUC 0.612, highway-rate baseline AUC 0.700."
    ]
