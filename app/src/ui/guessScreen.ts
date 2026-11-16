import { DISCLAIMER, STRINGS } from '../content/strings';
import { buildGuessModel } from '../content/guessModel';
import { hashOf } from '../state/screens';
import { el } from './dom';

// How_Gloam_Guesses_Screen text (Requirements 12.3 to 12.9, 18.5). The statements open the
// screen; the validation figures and the link to the bundled text sit under the settings.
// Nothing here makes a network request: the validation text is passed in as a string, and the
// link opens it through a blob: address.

export interface GuessScreen {
  /** The statements of Requirements 12.3 to 12.5. */
  intro: HTMLElement;
  /** The validation figures, the raw-text link, the Disclaimer and the credits link. */
  rest: HTMLElement;
}

const para = (text: string, className?: string): HTMLElement => el('p', { text, ...(className ? { className } : {}) });

export function createGuessScreen(validationText: string): GuessScreen {
  const model = buildGuessModel(validationText);
  const intro = el('div', { className: 'guess-intro' }, ...model.statements.map((s) => para(s, 'lead')));

  const figures: HTMLElement[] = [];
  if (model.validation.status === 'unavailable') {
    figures.push(el('p', { className: 'plan-message', text: model.validation.message, attrs: { role: 'status' } }));
  } else {
    figures.push(para(model.aucNote));
    figures.push(el('ul', { className: 'figure-list' }, ...model.validation.figures.map((f) => el('li', { text: f }))));
    figures.push(para(model.validation.comparison));
    if (model.validation.skipped !== null) figures.push(para(model.validation.skipped));
  }
  const url = URL.createObjectURL(new Blob([validationText], { type: 'text/plain;charset=utf-8' }));
  figures.push(
    el('a', { className: 'raw-link', text: STRINGS.guess.rawLink.text, attrs: { href: url, target: '_blank', rel: 'noopener' } }),
  );

  const rest = el(
    'div',
    { className: 'guess-rest' },
    el('section', { className: 'glass page-card' }, el('h3', { className: 'section-heading', text: STRINGS.guess.numbersHeading.text }), ...figures),
    el(
      'footer',
      { className: 'page-foot' },
      para(DISCLAIMER, 'disclaimer'),
      para(STRINGS.screens.privacyShort.text, 'small-print'),
      el('a', { className: 'text-link', text: STRINGS.screens.creditsLink.text, attrs: { href: hashOf('credits') } }),
    ),
  );
  return { intro, rest };
}
