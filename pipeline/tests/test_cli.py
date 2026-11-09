"""End-to-end tests for the command line (R9.1 to R9.7, R7.10).

Each test builds a tiny two-city fixture in tmp_path and calls cli.main(argv) with
--data-dir / --out-dir / --docs-dir pointing into tmp_path, so nothing outside it is touched.
"""

import json

import pytest

from gloam_pipeline import cli

# Fixture per city: 12 segments (way ids 1 to 12).
#   residential 1..4 : lit yes, no, yes, no      tertiary 5, 6 : yes, no
#   footway 7..10    : yes, no, yes, no (7, 8 carry footway=sidewalk)
#   untagged 11 (residential), 12 (footway)
# Hand count per city: tagged_lit = {1,3,5,7,9} = 5, tagged_unlit = {2,4,6,8,10} = 5, untagged = 2.
SEGMENTS = (
    ("residential", "yes", ""), ("residential", "no", ""),
    ("residential", "yes", ""), ("residential", "no", ""),
    ("tertiary", "yes", ""), ("tertiary", "no", ""),
    ("footway", "yes", "sidewalk"), ("footway", "no", "sidewalk"),
    ("footway", "yes", ""), ("footway", "no", ""),
    ("residential", None, ""), ("footway", None, ""),
)


def _feature(fid, props, geometry):
    feature = {"type": "Feature", "properties": props, "geometry": geometry}
    if fid is not None:
        feature["id"] = fid
    return feature


def city_geojson(lon0, extra_idless_shop=False):
    feats = []
    for i, (highway, lit, footway) in enumerate(SEGMENTS, start=1):
        props = {"highway": highway}
        if lit is not None:
            props["lit"] = lit
        if footway:
            props["footway"] = footway
        lat = (i - 1) * 0.0005
        line = {"type": "LineString", "coordinates": [[lon0, lat], [lon0 + 0.001, lat]]}
        feats.append(_feature(f"way/{i}", props, line))
    point = lambda dx: {"type": "Point", "coordinates": [lon0 + dx, 0.00005]}  # noqa: E731
    feats.append(_feature("node/101", {"highway": "bus_stop"}, point(0.0005)))
    feats.append(_feature("node/102", {"shop": "bakery"}, point(0.0007)))
    ring = [[lon0, 0.002], [lon0 + 0.0002, 0.002], [lon0 + 0.0002, 0.0022],
            [lon0, 0.0022], [lon0, 0.002]]
    feats.append(_feature("way/201", {"building": "yes"}, {"type": "Polygon", "coordinates": [ring]}))
    if extra_idless_shop:
        feats.append(_feature(None, {"shop": "kiosk"}, point(0.0003)))
    return {"type": "FeatureCollection", "features": feats}


def write_city_input(tmp_path, city_id, lon0, extra_idless_shop=False):
    path = tmp_path / "input" / f"{city_id}.geojson"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(city_geojson(lon0, extra_idless_shop)), encoding="utf-8")
    return path


def dirs(tmp_path):
    return ["--data-dir", str(tmp_path / "data")]


def summarise(tmp_path, city_id, lon0, **kw):
    src = write_city_input(tmp_path, city_id, lon0, **kw)
    return cli.main(["summarise", *dirs(tmp_path), "--city-id", city_id,
                     "--city-name", city_id.upper(), "--input", str(src)])


def prepare(tmp_path, held_out=None):
    """summarise + features for cities aaa and bbb, then train; returns nothing."""
    for city_id, lon0 in (("aaa", 0.0), ("bbb", 10.0)):
        assert summarise(tmp_path, city_id, lon0) == 0
        assert cli.main(["features", *dirs(tmp_path), "--city-id", city_id]) == 0
    argv = ["train", *dirs(tmp_path), "--cities", "aaa", "bbb"]
    if held_out:
        argv += ["--held-out", held_out]
    assert cli.main(argv) == 0


def validate_argv(tmp_path, *extra):
    return ["validate", *dirs(tmp_path), "--cities", "aaa", "bbb",
            "--min-unlit-city", "1", "--min-unlit-road-type", "1",
            "--docs-dir", str(tmp_path / "docs"), *extra]


def files_under(path):
    return sorted(p for p in path.rglob("*") if p.is_file()) if path.exists() else []


# ------------------------------------------------------------------ all five commands


def test_all_five_commands_on_tiny_fixture(tmp_path, capsys):
    # summarise: warning line for the feature with no id, then the summary.
    assert summarise(tmp_path, "aaa", 0.0, extra_idless_shop=True) == 0
    out = capsys.readouterr().out
    assert "warning: feature 15 in file 0 has no parseable id" in out
    assert "command: summarise" in out and "city: aaa" in out
    # 12 segments + bus stop + shop + building + id-less shop = 16 records
    assert "records processed: 16" in out
    assert "segments by label: tagged_lit=5, tagged_unlit=5, untagged=2" in out
    assert "warnings: 1" in out
    assert (tmp_path / "data" / "aaa" / "city.json").is_file()

    assert summarise(tmp_path, "bbb", 10.0) == 0
    assert "warnings: 0" in capsys.readouterr().out

    for city_id in ("aaa", "bbb"):
        assert cli.main(["features", *dirs(tmp_path), "--city-id", city_id]) == 0
        out = capsys.readouterr().out
        assert "command: features" in out and "records processed: 12" in out
        assert (tmp_path / "data" / city_id / "features.json").is_file()

    assert cli.main(["train", *dirs(tmp_path), "--cities", "aaa", "bbb", "--held-out", "bbb"]) == 0
    out = capsys.readouterr().out
    assert "command: train" in out and "records processed: 24" in out
    assert (tmp_path / "data" / "model.json").is_file()
    assert "Held-out city: bbb" in (tmp_path / "data" / "train.log").read_text(encoding="utf-8")

    assert cli.main(validate_argv(tmp_path)) == 0
    out = capsys.readouterr().out
    assert "command: validate" in out and "warnings: 0" in out
    assert (tmp_path / "docs" / "validation.md").is_file()

    out_dir = tmp_path / "out"
    assert cli.main(["export", *dirs(tmp_path), "--city-id", "aaa", "--out-dir", str(out_dir)]) == 0
    out = capsys.readouterr().out
    assert "command: export" in out and "records processed: 12" in out
    seg = json.loads((out_dir / "aaa.segments.geojson").read_text(encoding="utf-8"))
    assert len(seg["features"]) == 12
    assert (out_dir / "aaa.buildings.geojson").is_file()


def test_validate_with_ground_truth_runs_and_exits_zero(tmp_path, capsys):
    prepare(tmp_path, held_out="bbb")
    csv_path = tmp_path / "gt.csv"
    csv_path.write_text("osm_id,label\n1,lit\n2,dark\n7,lit\n8,dark\n9,unsure\n", encoding="utf-8")
    argv = validate_argv(tmp_path, "--ground-truth", str(csv_path), "--ground-truth-city", "bbb")
    assert cli.main(argv) == 0
    assert "warning:" not in capsys.readouterr().out
    assert (tmp_path / "docs" / "validation.md").is_file()


# ------------------------------------------------------------------ exit 2: arguments and files


def test_missing_required_argument_exits_2_and_writes_nothing(tmp_path, capsys):
    assert cli.main(["summarise", *dirs(tmp_path), "--city-id", "aaa"]) == 2
    assert "--city-name" in capsys.readouterr().err
    assert files_under(tmp_path) == []


def test_missing_input_file_exits_2_and_writes_nothing(tmp_path, capsys):
    missing = tmp_path / "nope.geojson"
    code = cli.main(["summarise", *dirs(tmp_path), "--city-id", "aaa", "--city-name", "A",
                     "--input", str(missing)])
    assert code == 2
    assert "file not found" in capsys.readouterr().err
    assert files_under(tmp_path) == []


def test_missing_intermediate_file_exits_2(tmp_path, capsys):
    assert cli.main(["features", *dirs(tmp_path), "--city-id", "aaa"]) == 2
    assert "city.json" in capsys.readouterr().err
    assert files_under(tmp_path) == []


def test_invalid_city_id_names_argument_and_value(tmp_path, capsys):
    assert cli.main(["features", *dirs(tmp_path), "--city-id", "Bad Id"]) == 2
    err = capsys.readouterr().err
    assert "--city-id" in err and "Bad Id" in err
    assert files_under(tmp_path) == []


def test_nan_feature_distance_names_argument_and_value(tmp_path, capsys):
    assert summarise(tmp_path, "aaa", 0.0) == 0
    capsys.readouterr()
    before = files_under(tmp_path)
    assert cli.main(["features", *dirs(tmp_path), "--city-id", "aaa",
                     "--feature-distance-m", "nan"]) == 2
    err = capsys.readouterr().err
    assert "feature_distance_m" in err and "nan" in err
    assert files_under(tmp_path) == before
    assert not (tmp_path / "data" / "aaa" / "features.json").exists()


def test_ground_truth_flags_must_come_together(tmp_path, capsys):
    argv = validate_argv(tmp_path, "--ground-truth", str(tmp_path / "gt.csv"))
    assert cli.main(argv) == 2
    assert "--ground-truth-city" in capsys.readouterr().err
    assert files_under(tmp_path) == []


# ------------------------------------------------------------------ ground truth guard and "not run"


def test_ground_truth_city_mismatch_exits_2_and_keeps_existing_report(tmp_path, capsys):
    prepare(tmp_path, held_out="aaa")  # model holds out aaa, CSV will claim bbb
    report = tmp_path / "docs" / "validation.md"
    report.parent.mkdir(parents=True)
    report.write_text("earlier report\n", encoding="utf-8")
    csv_path = tmp_path / "gt.csv"
    csv_path.write_text("osm_id,label\n1,lit\n", encoding="utf-8")
    capsys.readouterr()

    argv = validate_argv(tmp_path, "--ground-truth", str(csv_path), "--ground-truth-city", "bbb")
    assert cli.main(argv) == 2
    err = capsys.readouterr().err
    assert "--ground-truth-city" in err and "bbb" in err and "aaa" in err
    assert report.read_text(encoding="utf-8") == "earlier report\n"


def test_ground_truth_with_no_held_out_city_exits_2(tmp_path, capsys):
    prepare(tmp_path, held_out=None)
    csv_path = tmp_path / "gt.csv"
    csv_path.write_text("osm_id,label\n1,lit\n", encoding="utf-8")
    capsys.readouterr()
    argv = validate_argv(tmp_path, "--ground-truth", str(csv_path), "--ground-truth-city", "bbb")
    assert cli.main(argv) == 2
    assert not (tmp_path / "docs" / "validation.md").exists()


def test_missing_ground_truth_csv_exits_3_with_report_written(tmp_path, capsys):
    prepare(tmp_path, held_out="bbb")
    capsys.readouterr()
    argv = validate_argv(tmp_path, "--ground-truth", str(tmp_path / "absent.csv"),
                         "--ground-truth-city", "bbb")
    assert cli.main(argv) == 3
    out = capsys.readouterr().out
    assert "warning: ground truth not run: the ground-truth file is missing" in out
    assert "warnings: 1" in out
    report = (tmp_path / "docs" / "validation.md").read_text(encoding="utf-8")
    assert "Not run: the ground-truth file is missing." in report


# ------------------------------------------------------------------ help


def test_help_exits_0(capsys):
    assert cli.main(["--help"]) == 0
    assert "summarise" in capsys.readouterr().out
    assert cli.main(["validate", "--help"]) == 0
    assert "--ground-truth-city" in capsys.readouterr().out
