"""Property 11: Feature importance covers every feature in ranked order.

**Validates: Requirements 5.10**
"""
import re

from hypothesis import given, settings, strategies as st

from gloam_pipeline.model import LABELS, feature_importance, training_log

_NAMES = st.text(alphabet="abcdefghij_0123", min_size=1, max_size=6)
# A small coefficient pool makes ties (including +c / -c) common.
_TIE_COEFS = st.sampled_from([0.0, -0.0, 0.5, -0.5, 1.0, -1.0, 2.5])
_ANY_COEFS = st.floats(min_value=-50, max_value=50, allow_nan=False, allow_infinity=False)


@st.composite
def _models(draw):
    names = draw(st.lists(_NAMES, min_size=1, max_size=12, unique=True))
    coefs = draw(st.lists(st.one_of(_TIE_COEFS, _ANY_COEFS),
                          min_size=len(names), max_size=len(names)))
    return {
        "feature_names": names,
        "coefficients": coefs,
        "untagged_weight": 0.1,
        "training_cities": ["a"],
        "held_out_city": None,
        "seed": 0,
    }


# Feature: gloam-data-pipeline, Property 11: Feature importance covers every feature in ranked order
@settings(max_examples=200, deadline=None)
@given(_models())
def test_feature_importance_covers_every_feature_in_ranked_order(model):
    ranked = feature_importance(model)

    # Every feature exactly once.
    assert sorted(n for n, _ in ranked) == sorted(model["feature_names"])

    # Values are |coef|.
    expected = {n: abs(c) for n, c in zip(model["feature_names"], model["coefficients"])}
    assert all(v == expected[n] for n, v in ranked)

    # Highest first, ties by name.
    keys = [(-v, n) for n, v in ranked]
    assert keys == sorted(keys)

    # Training log lists them in the same order.
    log = training_log(model, {label: 1 for label in LABELS})
    logged = re.findall(r"^  \d+\. (\S+): ", log, flags=re.MULTILINE)
    assert logged == [n for n, _ in ranked]
