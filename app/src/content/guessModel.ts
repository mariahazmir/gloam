import { STRINGS } from './strings';
import { parseValidation } from './validationDoc';

// What the How_Gloam_Guesses_Screen says (Requirements 12.3 to 12.7, 12.9). Pure: the caller
// passes the text of docs/validation.md. Figures are copied as written in the document and
// only AUC is quoted: no precision and no other figure tied to a probability cut-off.

export type ValidationLines =
  | { status: 'unavailable'; message: string }
  | {
      status: 'ok';
      /** One line per city and kind: the model's AUC and the baseline's AUC. */
      figures: string[];
      /** Names the cities where the model did not beat the baseline, or says it beat it everywhere. */
      comparison: string;
      /** Cities with no hold-out test, or null when there are none. */
      skipped: string | null;
    };

export interface GuessModel {
  /** Requirements 12.3 to 12.5. Shown whether or not the figures could be read. */
  statements: string[];
  aucNote: string;
  validation: ValidationLines;
}

export function buildGuessModel(validationText: string): GuessModel {
  const statements = [STRINGS.guess.fromMapData.text, STRINGS.guess.signal.text, STRINGS.guess.canBeWrong.text];
  const aucNote = STRINGS.guess.aucNote.text;
  const parsed = parseValidation(validationText);
  if (parsed.status === 'unavailable') {
    return { statements, aucNote, validation: { status: 'unavailable', message: STRINGS.errors.validationUnavailable.text } };
  }
  const figures = parsed.figures.map((f) => STRINGS.guess.figure.text(f.city, f.kind, f.model, f.baseline));
  const comparison =
    parsed.didNotBeat.length === 0
      ? STRINGS.guess.beatEverywhere.text
      : STRINGS.guess.didNotBeat.text(parsed.didNotBeat.join(', '));
  const skippedCities = [...new Set(parsed.skipped.map((s) => s.city))];
  const skipped = skippedCities.length === 0 ? null : STRINGS.guess.skipped.text(skippedCities.join(', '));
  return { statements, aucNote, validation: { status: 'ok', figures, comparison, skipped } };
}
