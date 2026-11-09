"""Wording check: banned words from the product rules must not reach users (R7.7)."""

import re
from pathlib import Path

from gloam_pipeline.report import render_validation
from gloam_pipeline.validation import CityMetrics, ValidationResult

BANNED = ("safe route", "safest", "guaranteed", "secure", "dangerous area", "bad neighborhood")
# Whole-word match, so "insecure" or "unsecured" are not hits. Whitespace inside a phrase is flexible.
BANNED_RE = re.compile(
    r"\b(?:" + "|".join(r"\s+".join(map(re.escape, w.split())) for w in BANNED) + r")\b", re.IGNORECASE
)

REPO = Path(__file__).resolve().parents[2]
# docs/kiro-log.md quotes the banned list on purpose (it records the honesty rules), so it is skipped.
EXCLUDED_DOCS = {"kiro-log.md"}


def scan_text(text: str, label: str) -> list[str]:
    """Return 'label:line: word' for every banned word found."""
    hits = []
    for n, line in enumerate(text.splitlines(), 1):
        for m in BANNED_RE.finditer(line):
            hits.append(f"{label}:{n}: {m.group(0)!r}")
    return hits


def _files() -> list[Path]:
    files = sorted((REPO / "pipeline" / "gloam_pipeline").rglob("*.py"))
    files += [p for p in sorted((REPO / "docs").glob("*.md")) if p.name not in EXCLUDED_DOCS]
    readme = REPO / "README.md"
    if readme.exists():
        files.append(readme)
    return files


def test_scanner_detects_banned_words():
    for word in BANNED:
        assert scan_text(f"Try the {word.upper()} tonight", "sample"), word
    hits = scan_text("ok line\nThis is the Safest way", "sample.md")
    assert hits == ["sample.md:2: 'Safest'"]


def test_scanner_uses_whole_words():
    assert scan_text("an insecure, unsecured door", "s") == []
    assert scan_text("keep it secure.", "s") != []


def test_package_and_docs_have_no_banned_words():
    files = _files()
    assert files, "no files to scan"
    hits = []
    for p in files:
        hits += scan_text(p.read_text(encoding="utf-8"), str(p.relative_to(REPO)))
    assert not hits, "banned words found:\n" + "\n".join(hits)


def test_rendered_validation_report_has_no_banned_words():
    metrics = CityMetrics(
        "london", "vehicle_road", {"tagged_lit": 5, "tagged_unlit": 3, "untagged": 2}, 100,
        None,
        {"model": 0.4, "rule": 0.5, "highway_rate": 0.6},
        {"model": 1.0, "rule": None, "highway_rate": 0.5},
    )
    result = ValidationResult(
        class_counts={"london": {"tagged_lit": 5, "tagged_unlit": 3, "untagged": 2}},
        skipped_cities=[],
        metrics=[metrics],
        did_not_beat=[],
        unseen_highway_types={"london": 2},
    )
    text = render_validation(result)
    assert text
    assert scan_text(text, "rendered report") == []
