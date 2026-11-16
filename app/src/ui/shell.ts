import { STRINGS } from '../content/strings';
import { hashOf, type Screen } from '../state/screens';
import { CSS_VARS } from '../visual/palette';
import { el } from './dom';
import './base.css';

// The app shell (Requirement 18): the map with its overlays stays mounted, and each screen is a
// layer over it. The Map_Screen and Report_Screen are bottom sheets over the map; the Route_Screen,
// How_Gloam_Guesses_Screen and Credits_Screen are full pages. showScreen() is synchronous. The map
// attribution sits in a strip under the header, above every sheet, so nothing covers it (5.3, 18.10).

export interface Sheet {
  /** The sheet element; `collapsed` toggles on it. */
  sheet: HTMLElement;
  /** Content goes here, in order. */
  body: HTMLElement;
}

export interface Page {
  /** Content goes here, under the page's back control and title. */
  body: HTMLElement;
}

export interface Shell {
  mapContainer: HTMLElement;
  /** Centred over the map; holds the Crosshair. Ignores pointer input so map taps pass through. */
  crosshairHost: HTMLElement;
  /** Under the header: the always-open map attribution. */
  attributionHost: HTMLElement;
  /** The header's walk label: the example label or the city name. */
  walkLabel: HTMLElement;
  /** The chip row: the "SAMPLE DATA" chip, then the City_Picker. */
  sampleChipHost: HTMLElement;
  pickerHost: HTMLElement;
  mapSheet: Sheet;
  reportSheet: Sheet;
  routePage: Page;
  aboutPage: Page;
  creditsPage: Page;
  showScreen(screen: Screen): void;
}

function backLink(target: Screen, label: string): HTMLAnchorElement {
  const a = el('a', { className: 'icon-button glass', attrs: { href: hashOf(target), 'aria-label': label } });
  a.append(el('span', { className: 'back-chevron', attrs: { 'aria-hidden': 'true' } }));
  return a;
}

function page(screen: Screen, title: string, back: Screen, backLabel: string): { layer: HTMLElement; page: Page; heading: HTMLElement } {
  const heading = el('h2', { className: 'page-title', text: title, attrs: { tabindex: '-1' } });
  const body = el('div', { className: 'page-body' });
  const layer = el(
    'section',
    { className: `page page-${screen}`, attrs: { 'aria-label': title } },
    el('div', { className: 'page-inner' }, el('div', { className: 'page-head' }, backLink(back, backLabel), heading), body),
  );
  return { layer, page: { body }, heading };
}

/** A bottom sheet. With `collapsible`, the grab handle is a button that collapses the sheet to its `.sheet-keep` parts (18.9). */
function sheet(className: string, label: string, collapsible: boolean): Sheet {
  const body = el('div', { className: 'sheet-body' });
  const s = el('aside', { className: `sheet glass ${className}`, attrs: { 'aria-label': label } });
  if (collapsible) {
    const handle = el('button', {
      className: 'sheet-handle',
      attrs: { type: 'button', 'aria-label': STRINGS.screens.sheetToggle.text, 'aria-expanded': 'true' },
    });
    handle.addEventListener('click', () => {
      const collapsed = s.classList.toggle('collapsed');
      handle.setAttribute('aria-expanded', String(!collapsed));
    });
    s.append(handle);
  } else {
    s.append(el('div', { className: 'sheet-grip', attrs: { 'aria-hidden': 'true' } }));
  }
  s.append(body);
  return { sheet: s, body };
}

export function createShell(root: HTMLElement): Shell {
  // Colour tokens come from visual/palette.ts, so CSS holds no hex values of its own.
  for (const [name, value] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(name, value);
  document.title = STRINGS.app.name.text;

  const mapContainer = el('div', { className: 'map', attrs: { role: 'region', 'aria-label': STRINGS.shell.map.text } });
  const crosshairHost = el('div', { className: 'crosshair-host' });

  const walkLabel = el('span', { className: 'walk-label' });
  const guessLink = el('a', {
    className: 'icon-button header-help',
    text: STRINGS.screens.helpGlyph.text,
    attrs: { href: hashOf('about'), 'aria-label': STRINGS.screens.openGuess.text },
  });
  const header = el(
    'header',
    { className: 'topbar glass' },
    el('h1', { className: 'brand', text: STRINGS.app.name.text }),
    walkLabel,
    guessLink,
  );
  const sampleChipHost = el('div', { className: 'sample-chip-host' });
  const pickerHost = el('nav', { className: 'picker-host', attrs: { 'aria-label': STRINGS.shell.cityPicker.text } });
  const attributionHost = el('div', { className: 'attribution-strip' });
  const mapTop = el(
    'div',
    { className: 'map-top' },
    header,
    el('div', { className: 'chip-row' }, sampleChipHost, pickerHost),
    attributionHost,
  );

  const mapSheet = sheet('sheet-map', STRINGS.shell.panel.text, true);
  const reportSheet = sheet('sheet-report', STRINGS.report.heading.text, false);
  const route = page('route', STRINGS.screens.routeTitle.text, 'map', STRINGS.screens.backToMap.text);
  const about = page('about', STRINGS.guess.title.text, 'map', STRINGS.screens.backToMap.text);
  const credits = page('credits', STRINGS.about.title.text, 'about', STRINGS.screens.back.text);

  const shell = el(
    'div',
    { className: 'shell', attrs: { 'data-screen': 'map' } },
    el('main', { className: 'map-layer' }, mapContainer, crosshairHost, mapTop),
    mapSheet.sheet,
    reportSheet.sheet,
    route.layer,
    about.layer,
    credits.layer,
  );
  root.replaceChildren(shell);
  // The sheets size themselves below this overlay, so they never cover the attribution (18.10).
  const publishTop = (): void => shell.style.setProperty('--map-top-h', `${Math.ceil(mapTop.offsetTop + mapTop.offsetHeight)}px`);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(publishTop).observe(mapTop);
  publishTop();

  const pages: ReadonlyArray<[Screen, HTMLElement, HTMLElement]> = [
    ['route', route.layer, route.heading],
    ['about', about.layer, about.heading],
    ['credits', credits.layer, credits.heading],
  ];
  let current: Screen | null = null;

  function showScreen(screen: Screen): void {
    shell.setAttribute('data-screen', screen);
    mapSheet.sheet.hidden = screen !== 'map';
    reportSheet.sheet.hidden = screen !== 'report';
    mapTop.hidden = screen !== 'map' && screen !== 'report';
    for (const [name, layer, heading] of pages) {
      layer.hidden = name !== screen;
      // Move focus to the new page's title so keyboard and screen-reader users land on it.
      if (name === screen && current !== null && current !== screen) heading.focus();
    }
    current = screen;
  }
  showScreen('map');

  return {
    mapContainer,
    crosshairHost,
    attributionHost,
    walkLabel,
    sampleChipHost,
    pickerHost,
    mapSheet,
    reportSheet,
    routePage: route.page,
    aboutPage: about.page,
    creditsPage: credits.page,
    showScreen,
  };
}
