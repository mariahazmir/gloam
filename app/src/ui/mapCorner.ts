import { STRINGS } from '../content/strings';
import type { PackMeta } from '../types';
import { el } from './dom';

// Map-corner note: the loaded City_Pack's attribution text and estimates note
// (Requirement 1.8). show() is synchronous, so it updates well inside 500 ms of a load.

export interface MapCorner {
  show(meta: Pick<PackMeta, 'attribution' | 'estimatesNote'>): void;
  /** Removes the note (a partly loaded pack was discarded). */
  clear(): void;
}

export function createMapCorner(host: HTMLElement): MapCorner {
  return {
    show(meta) {
      host.replaceChildren(
        el(
          'aside',
          { className: 'corner-note glass', attrs: { 'aria-label': STRINGS.shell.cityNote.text } },
          el('p', { text: meta.attribution }),
          el('p', { text: meta.estimatesNote }),
        ),
      );
    },
    clear() {
      host.replaceChildren();
    },
  };
}
