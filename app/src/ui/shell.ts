import { STRINGS } from '../content/strings';
import { CSS_VARS } from '../visual/palette';
import { el } from './dom';
import './base.css';

// The app shell: a header, the map and a panel column. The map has its own grid
// cell and the panel sits beside or below it, so no panel can cover the always-open
// attribution (Requirement 5.3). Layout rules live in base.css.

export interface Shell {
  /** Holds the city picker. */
  pickerHost: HTMLElement;
  /** A small caption line under the header row; holds a city's description. */
  captionHost: HTMLElement;
  /** The map container handed to MapLibre. */
  mapContainer: HTMLElement;
  /** Positioned over the map's top-left corner; holds the pack attribution and estimates note. */
  cornerHost: HTMLElement;
  /** Empty for now; later tasks put the route panel and controls here. */
  panel: HTMLElement;
}

export function createShell(root: HTMLElement): Shell {
  // Colour tokens come from visual/palette.ts, so CSS holds no hex values of its own.
  for (const [name, value] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(name, value);
  document.title = STRINGS.app.name.text;

  const pickerHost = el('nav', { className: 'picker-host', attrs: { 'aria-label': STRINGS.shell.cityPicker.text } });
  const captionHost = el('div', { className: 'caption-host' });
  const header = el(
    'header',
    { className: 'topbar' },
    el('div', { className: 'topbar-row' }, el('h1', { className: 'brand', text: STRINGS.app.name.text }), pickerHost),
    captionHost,
  );

  const mapContainer = el('div', { className: 'map', attrs: { role: 'region', 'aria-label': STRINGS.shell.map.text } });
  const cornerHost = el('div', { className: 'corner-host' });
  const mapWrap = el('main', { className: 'map-wrap' }, mapContainer, cornerHost);

  const panel = el('aside', { className: 'panel', attrs: { 'aria-label': STRINGS.shell.panel.text } });

  root.replaceChildren(el('div', { className: 'shell' }, header, mapWrap, panel));
  return { pickerHost, captionHost, mapContainer, cornerHost, panel };
}
