"""Property 1 for loader.merge_features. Validates: Requirements 1.2, 1.5, 1.6."""

from hypothesis import given, strategies as st

from gloam_pipeline.classify import classify
from gloam_pipeline.loader import SUMMARY_TYPES, merge_features

# Feature: gloam-data-pipeline, Property 1: Merge keeps the first copy and accounts for every feature

# Small id pool so duplicates inside and across files are common.
keys = st.tuples(st.sampled_from(["node", "way", "relation"]), st.integers(0, 4))
# None = no parseable id; otherwise where the id is written.
placements = st.sampled_from(["top", "at_id"])
tags = st.sampled_from(
    [
        {"highway": "residential"},
        {"highway": "bus_stop"},
        {"amenity": "cafe"},
        {"shop": "kiosk"},
        {"building": "yes"},
        {"landuse": "retail"},
        {},
    ]
)
feature_specs = st.tuples(st.one_of(st.none(), keys), placements, tags)
files_specs = st.lists(st.lists(feature_specs, max_size=8), max_size=5)


def build(spec, uid):
    key, placement, tag = spec
    props = dict(tag, uid=uid)
    feature = {"type": "Feature", "properties": props}
    if key is not None:
        text = f"{key[0]}/{key[1]}"
        if placement == "top":
            feature["id"] = text
        else:
            props["@id"] = text
    return feature


@given(files_specs)
def test_merge_keeps_first_copy_and_accounts_for_every_feature(files_specs):
    uid = 0
    files, expected_kept, expected_dupes, no_id = [], [], 0, 0
    seen = set()
    for spec_list in files_specs:
        file = []
        for spec in spec_list:
            feature = build(spec, uid)
            uid += 1
            file.append(feature)
            if spec[0] is None:
                no_id += 1
                expected_kept.append(feature)  # always kept, never deduplicated
            elif spec[0] in seen:
                expected_dupes += 1
            else:
                seen.add(spec[0])
                expected_kept.append(feature)
        files.append(file)

    result = merge_features(files)

    # First occurrence in file-list order is kept (identity, in order).
    assert [f["properties"]["uid"] for f in result.features] == [
        f["properties"]["uid"] for f in expected_kept
    ]
    assert result.duplicates == expected_dupes
    # input = unique + duplicates removed
    assert uid == len(result.features) + result.duplicates
    # unique = sum of the six type counts + unmatched
    assert set(result.counts) == set(SUMMARY_TYPES)
    assert len(result.features) == sum(result.counts.values()) + result.unmatched
    for name in SUMMARY_TYPES:
        assert result.counts[name] == sum(
            1 for f in expected_kept if classify(f) == name
        )
    assert result.unmatched == sum(1 for f in expected_kept if classify(f) == "other")
    # One warning per feature with no parseable id; those features are kept.
    assert result.warning_count == no_id
