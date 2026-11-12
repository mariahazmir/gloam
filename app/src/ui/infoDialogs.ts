import { DISCLAIMER, STRINGS } from '../content/strings';
import { buildGuessModel } from '../content/guessModel';
import type { PackMeta } from '../types';
import { el } from './dom';

// The About screen and the How_Gloam_Guesses_Screen (Requirements 1.8, 12.3 to 12.9, 13.11).
// Each is a modal <dialog>, so Escape closes it and focus stays inside while it is open.
// Nothing here makes a network request: the validation text is passed in as a string.

export interface InfoDialog {
  open(): void;
}

function shell(title: string, body: HTMLElement[]): { dialog: HTMLDialogElement } {
  const close = el('button', { className: 'plan-button', text: STRINGS.about.close.text, attrs: { type: 'button' } });
  const heading = el('h2', { className: 'dialog-title', text: title, attrs: { id: `dialog-${title.replace(/\W+/g, '-')}` } });
  const content = el('div', { className: 'dialog-body' }, ...body);
  const dialog = el(
    'dialog',
    { className: 'info-dialog glass', attrs: { 'aria-labelledby': heading.id } },
    heading,
    content,
    el('div', { className: 'dialog-actions' }, close),
  );
  close.addEventListener('click', () => dialog.close());
  document.body.append(dialog);
  return { dialog };
}

const para = (text: string): HTMLElement => el('p', { text });

export interface AboutDialog extends InfoDialog {
  /** Shows the loaded City_Pack's attribution and estimates note; null when none is loaded. */
  setCity(meta: Pick<PackMeta, 'attribution' | 'estimatesNote'> | null): void;
}

export function createAboutDialog(): AboutDialog {
  const city = el('section', { className: 'dialog-city' });
  const { dialog } = shell(STRINGS.about.title.text, [
    para(STRINGS.about.what.text),
    para(STRINGS.about.tiles.text),
    para(STRINGS.about.noAccounts.text),
    para(STRINGS.about.mapCredit.text),
    city,
    el('p', { className: 'disclaimer', text: DISCLAIMER }),
  ]);
  const setCity: AboutDialog['setCity'] = (meta) => {
    city.replaceChildren(
      el('h3', { text: STRINGS.about.cityHeading.text }),
      ...(meta === null ? [para(STRINGS.about.noCity.text)] : [para(meta.attribution), para(meta.estimatesNote)]),
    );
  };
  setCity(null);
  return { open: () => dialog.showModal(), setCity };
}

/**
 * The validation text is shown as quoted lines, and a link opens the full text from the
 * bundle through a blob: address, which makes no network request (Requirement 12.7).
 */
export function createGuessDialog(validationText: string): InfoDialog {
  const model = buildGuessModel(validationText);
  const parts: HTMLElement[] = model.statements.map(para);
  parts.push(el('h3', { text: STRINGS.guess.numbersHeading.text }));
  if (model.validation.status === 'unavailable') {
    parts.push(el('p', { className: 'plan-message', text: model.validation.message, attrs: { role: 'status' } }));
  } else {
    parts.push(para(model.aucNote));
    parts.push(el('ul', { className: 'figure-list' }, ...model.validation.figures.map((f) => el('li', { text: f }))));
    parts.push(para(model.validation.comparison));
    if (model.validation.skipped !== null) parts.push(para(model.validation.skipped));
  }
  const url = URL.createObjectURL(new Blob([validationText], { type: 'text/plain;charset=utf-8' }));
  parts.push(
    el('a', {
      className: 'raw-link',
      text: STRINGS.guess.rawLink.text,
      attrs: { href: url, target: '_blank', rel: 'noopener' },
    }),
  );
  const { dialog } = shell(STRINGS.guess.title.text, parts);
  return { open: () => dialog.showModal() };
}
