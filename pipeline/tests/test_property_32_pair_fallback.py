"""Property 32 for the pair baseline. Validates: Requirements 4.11, 4.12, 4.13."""

from hypothesis import given, strategies as st

from gloam_pipeline.baselines import (
    highway_footway_rate_baseline,
    highway_rate_baseline,
    learn_highway_rates,
    learn_pair_rates,
    pair_fallback_counts,
)
from gloam_pipeline.features import FOOTWAY_ORDER, HIGHWAY_ORDER

# Feature: gloam-data-pipeline, Property 32: Pair baseline falls back from pair to highway type to overall, and counts each fallback

highways = st.sampled_from(HIGHWAY_ORDER)
kinds = st.sampled_from(FOOTWAY_ORDER)
pairs_st = st.tuples(highways, kinds)
labels = st.sampled_from(["tagged_lit", "tagged_unlit", "untagged"])
training_rows = st.lists(st.tuples(highways, kinds, labels), max_size=40).filter(
    lambda rows: any(r[2] != "untagged" for r in rows)
)
city_pairs_st = st.lists(pairs_st, max_size=50)


def _tagged(training):
    return [r for r in training if r[2] != "untagged"]


def _levels(training):
    tagged = _tagged(training)
    pair_set = {(h, k) for h, k, _ in tagged}
    type_set = {h for h, _, _ in tagged}
    return pair_set, type_set


@given(training=training_rows, pair=pairs_st)
def test_prediction_follows_the_three_levels(training, pair):
    learned = learn_pair_rates(training)
    pair_set, type_set = _levels(training)
    tagged = _tagged(training)
    prediction = highway_footway_rate_baseline(learned, *pair)

    if pair in pair_set:
        sub = [r[2] for r in tagged if (r[0], r[1]) == pair]
        assert prediction == sub.count("tagged_lit") / len(sub)
    elif pair[0] in type_set:
        type_rates = learn_highway_rates([(h, label) for h, _, label in training])
        assert prediction == highway_rate_baseline(type_rates, pair[0])
        sub = [r[2] for r in tagged if r[0] == pair[0]]
        assert prediction == sub.count("tagged_lit") / len(sub)
    else:
        lit = sum(1 for r in tagged if r[2] == "tagged_lit")
        assert prediction == lit / len(tagged)
        assert prediction == learned.overall_lit_rate


@given(training=training_rows, city_pairs=city_pairs_st)
def test_counts_per_level_and_add_up(training, city_pairs):
    learned = learn_pair_rates(training)
    pair_set, type_set = _levels(training)
    distinct = set(city_pairs)

    expected_type = len({p for p in distinct if p not in pair_set and p[0] in type_set})
    expected_overall = len({p for p in distinct if p not in pair_set and p[0] not in type_set})
    type_fb, overall_fb = pair_fallback_counts(learned, city_pairs)

    assert type_fb == expected_type
    assert overall_fb == expected_overall
    with_data = len(distinct & pair_set)
    assert with_data + type_fb + overall_fb == len(distinct)


@given(training=training_rows, city_pairs=city_pairs_st, extra=st.data())
def test_duplicate_city_pairs_do_not_change_counts(training, city_pairs, extra):
    learned = learn_pair_rates(training)
    base = pair_fallback_counts(learned, city_pairs)
    dupes = list(city_pairs)
    if city_pairs:
        repeats = extra.draw(st.lists(st.sampled_from(city_pairs), max_size=30))
        dupes = dupes + repeats
    assert pair_fallback_counts(learned, dupes) == base
    assert pair_fallback_counts(learned, dupes + dupes) == base
