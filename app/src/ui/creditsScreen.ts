import { DISCLAIMER, STRINGS } from '../content/strings';
import type { PackMeta } from '../types';
import { el } from './dom';
import { sampleBadge } from './tools';

// Credits_Screen, the About screen of Requirement 1.8 (Requirements 13.11, 18.5): licences,
// privacy, the Demo_Mode note and the loaded City_Pack's attribution and estimates note.

export interface CreditsScreen {
  /** Shows the loaded City_Pack's attribution and estimates note; null when none is loaded. */
  setCity(meta: Pick<PackMeta, 'attribution' | 'estimatesNote'> | null): void;
}

function creditRow(label: string, ...detail: Array<Node | string>): HTMLElement {
  return el('div', { className: 'credit-row' }, el('div', { className: 'credit-label', text: label }), el('div', { className: 'credit-detail' }, ...detail));
}

const para = (text: string): HTMLElement => el('p', { className: 'credit-detail', text });

export function createCreditsScreen(host: HTMLElement): CreditsScreen {
  const fonts = el('a', {
    className: 'text-link',
    text: STRINGS.about.fontLicences.text,
    attrs: { href: `${import.meta.env.BASE_URL}font-licences.txt`, target: '_blank', rel: 'noopener' },
  });
  const repo = el('a', {
    className: 'text-link',
    text: STRINGS.about.repoUrl.text,
    attrs: { href: STRINGS.about.repoUrl.text, target: '_blank', rel: 'noopener' },
  });
  const city = el('section', { className: 'glass page-card' });
  host.append(
    el(
      'section',
      { className: 'glass page-card credit-list' },
      creditRow(STRINGS.about.dataLabel.text, STRINGS.about.dataDetail.text),
      creditRow(STRINGS.about.baseLabel.text, STRINGS.about.baseDetail.text),
      creditRow(STRINGS.about.engineLabel.text, STRINGS.about.engineDetail.text),
      creditRow(STRINGS.about.fontsLabel.text, fonts),
      creditRow(STRINGS.about.codeLabel.text, `${STRINGS.about.codeLicence.text} · `, repo),
    ),
    el(
      'section',
      { className: 'glass page-card' },
      el('h3', { className: 'section-label', text: STRINGS.about.privacyHeading.text }),
      para(STRINGS.about.noAccounts.text),
      para(STRINGS.about.noCookies.text),
      para(STRINGS.about.tiles.text),
    ),
    el(
      'section',
      { className: 'glass page-card' },
      el('div', { className: 'demo-head' }, sampleBadge(), el('h3', { className: 'section-label', text: STRINGS.about.demoHeading.text })),
      para(STRINGS.about.demoNote.text),
    ),
    city,
    el('footer', { className: 'page-foot' }, el('p', { className: 'disclaimer', text: DISCLAIMER })),
  );
  const setCity: CreditsScreen['setCity'] = (meta) => {
    city.replaceChildren(
      el('h3', { className: 'section-label', text: STRINGS.about.cityHeading.text }),
      ...(meta === null ? [para(STRINGS.about.noCity.text)] : [para(meta.attribution), para(meta.estimatesNote)]),
    );
  };
  setCity(null);
  return { setCity };
}
