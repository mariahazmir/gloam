"""Property 8: training weights follow the label."""

from hypothesis import given, settings, strategies as st

from gloam_pipeline.model import LABELS, TrainingRow, fit, row_target_and_weight

_HIST = {f: [1, 0, 0, 0, 0] for f in ("bus_stops", "food_places", "shops", "buildings")}


def _weight_text(value: float) -> str:
    return f"{value:g}"


# Feature: gloam-data-pipeline, Property 8: Training weights follow the label
# **Validates: Requirements 5.1, 5.4, 5.6**
@settings(deadline=None)  # first fit() call imports scikit-learn
@given(
    untagged_weight=st.floats(
        min_value=0.0, max_value=1.0, exclude_min=True, exclude_max=True
    ),
    labels=st.lists(st.sampled_from(LABELS), max_size=30),
    values=st.lists(st.floats(min_value=0, max_value=1), min_size=4, max_size=4),
)
def test_training_weights_follow_the_label(untagged_weight, labels, values):
    expected = {
        "tagged_lit": (1, 1.0),
        "tagged_unlit": (0, 1.0),
        "untagged": (0, untagged_weight),
    }
    for label in labels:
        assert row_target_and_weight(label, untagged_weight) == expected[label]

    # The training log states all three weights (R5.6). Fit needs one of each class.
    rows = [
        TrainingRow("a", i, "residential", "sidewalk", label, tuple(values))
        for i, label in enumerate(["tagged_lit", "untagged", *labels])
    ]
    _, log = fit(rows, ["f1", "f2", "f3", "f4"], {"a": _HIST}, untagged_weight=untagged_weight)
    weights_line = next(line for line in log.splitlines() if line.startswith("Weights:"))
    assert f"tagged_lit={_weight_text(1.0)}" in weights_line
    assert f"tagged_unlit={_weight_text(1.0)}" in weights_line
    assert f"untagged={_weight_text(untagged_weight)}" in weights_line
