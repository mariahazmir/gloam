import { STRINGS } from '../content/strings';
import { hashOf } from '../state/screens';
import { el } from './dom';

// The Map_Screen "Search streets" control (Requirements 6.10, 18.2, 19.1). It sits outside the route
// card, so it exists with or without a route. It is `.sheet-keep`, so the collapsed bar keeps it, at a
// smaller size (18.9). `.sheet-keep` was added by decision; the 211 px bar measurement in
// docs/app-checks.md is still a hand check.

export function createSearchControl(): HTMLButtonElement {
  const button = el('button', {
    className: 'sheet-search sheet-keep',
    text: STRINGS.search.openLabel.text,
    attrs: { type: 'button' },
  });
  button.style.minHeight = '44px';
  button.addEventListener('click', () => {
    window.location.hash = hashOf('route');
  });
  return button;
}
