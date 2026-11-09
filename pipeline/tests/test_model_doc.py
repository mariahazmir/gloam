"""docs/model.md is one short paragraph (R5.11)."""

from pathlib import Path

MODEL_DOC = Path(__file__).resolve().parents[2] / "docs" / "model.md"


def test_model_doc_is_one_paragraph_of_at_most_150_words():
    text = MODEL_DOC.read_text(encoding="utf-8").strip()
    assert "\n\n" not in text, "docs/model.md must be a single paragraph"
    assert len(text.split()) <= 150
