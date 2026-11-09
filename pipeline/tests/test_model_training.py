"""Unit tests for model.fit error paths and training log (R5.2, R5.3, R5.5, R5.6, R5.9)."""

import pytest

from gloam_pipeline.errors import InvalidArgumentError, TrainingError
from gloam_pipeline.model import TrainingRow, fit

FEATURES = ["bus_stops", "food_places", "shops", "buildings"]
HIST = {f: [1, 0, 0, 0, 0] for f in FEATURES}


def _row(city, seg, label, x=0.0):
    return TrainingRow(city, seg, "residential", label, (x, 0.0, 0.0, 0.0))


def _good_rows(city):
    return [_row(city, 1, "tagged_lit", 1.0), _row(city, 2, "tagged_unlit", 0.0), _row(city, 3, "untagged", 0.0)]


def _hists(*cities):
    return {c: HIST for c in cities}


def test_zero_tagged_lit_raises_naming_cities_and_count_zero():
    rows = [_row("kl", 1, "tagged_unlit"), _row("kl", 2, "untagged"), _row("ldn", 1, "untagged")]
    with pytest.raises(TrainingError) as exc:
        fit(rows, FEATURES, _hists("kl", "ldn"))
    msg = str(exc.value)
    assert "0" in msg and "tagged_lit" in msg
    assert "kl" in msg and "ldn" in msg


def test_zero_tagged_lit_produces_no_model_result():
    rows = [_row("kl", 1, "tagged_unlit"), _row("kl", 2, "untagged")]
    result = None
    with pytest.raises(TrainingError):
        result = fit(rows, FEATURES, _hists("kl"))
    assert result is None


def test_zero_tagged_lit_after_dropping_held_out_city():
    # Only the held-out city has tagged_lit rows, so training has none.
    rows = _good_rows("kl")[0:1] + [_row("ldn", 1, "tagged_unlit"), _row("ldn", 2, "untagged")]
    rows = [_row("kl", 1, "tagged_lit", 1.0)] + rows[1:]
    with pytest.raises(TrainingError) as exc:
        fit(rows, FEATURES, _hists("kl", "ldn"), held_out_city="kl")
    assert "ldn" in str(exc.value)


def test_training_log_has_unknown_not_unlit_statement_and_three_weights():
    rows = _good_rows("kl")
    _, log = fit(rows, FEATURES, _hists("kl"), untagged_weight=0.3)
    assert "unknown, not unlit" in log
    # Hand-computed: tagged_lit 1, tagged_unlit 1, untagged 0.3 (format :g).
    assert "tagged_lit=1" in log
    assert "tagged_unlit=1" in log
    assert "untagged=0.3" in log


def test_unknown_held_out_city_error_names_city():
    with pytest.raises(InvalidArgumentError) as exc:
        fit(_good_rows("kl"), FEATURES, _hists("kl"), held_out_city="paris")
    assert "paris" in str(exc.value)
    assert exc.value.argument == "held_out_city"


def test_held_out_leaving_zero_training_cities_names_city():
    with pytest.raises(InvalidArgumentError) as exc:
        fit(_good_rows("kl"), FEATURES, _hists("kl"), held_out_city="kl")
    assert "kl" in str(exc.value)
    assert "training city" in str(exc.value)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf"), 0, 1, -0.5, 2])
def test_invalid_untagged_weight_names_argument(bad):
    with pytest.raises(InvalidArgumentError) as exc:
        fit(_good_rows("kl"), FEATURES, _hists("kl"), untagged_weight=bad)
    assert "'untagged_weight'" in str(exc.value)
