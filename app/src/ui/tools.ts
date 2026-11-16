import { STRINGS } from '../content/strings';
import type { PlanController, PlanSnapshot } from '../state/planController';
import { el } from './dom';

// Legend, Demo_Mode and Reduced_Effects switches and the Reset_Control on the
// How_Gloam_Guesses_Screen, plus the "SAMPLE DATA" chip in the map header (Requirements 4.10,
// 14.1, 17.9, 17.11, 17.13, 18.5). This module only draws and forwards what the user does;
// main.ts applies the changes. Switches show their current state in words, not colour alone.

export interface ToolsOptions {
  /** The How_Gloam_Guesses_Screen body. */
  host: HTMLElement;
  /** The map header's chip row slot for the "SAMPLE DATA" chip. */
  chipHost: HTMLElement;
  controller: PlanController;
  onReset(): void;
}

export interface Tools {
  /** Shows or clears the "sample data could not be loaded" message (Requirement 14.6). */
  showDemoError(on: boolean): void;
}

/** The badge for anything drawn from Sample_Data. Other screens reuse this one. */
export function sampleBadge(): HTMLElement {
  return el('span', { className: 'sample-badge', text: STRINGS.labels.sampleData.text });
}

/** A Legend line "Title: detail" shown as a card with the title in bold. The line itself is unchanged. */
function legendCard(className: string, swatch: string, line: string): HTMLElement {
  const cut = line.indexOf(': ');
  const title = cut > 0 ? line.slice(0, cut) : line;
  const detail = cut > 0 ? line.slice(cut + 2) : '';
  return el(
    'li',
    { className: `legend-card ${className}`, attrs: { 'aria-label': line } },
    el('i', { className: `legend-swatch ${swatch}`, attrs: { 'aria-hidden': 'true' } }),
    el('div', { attrs: { 'aria-hidden': 'true' } }, el('div', { className: 'legend-title', text: title }), el('div', { className: 'legend-detail', text: detail })),
  );
}

function legend(): HTMLElement {
  return el(
    'section',
    { className: 'legend', attrs: { 'aria-label': STRINGS.tools.legendHeading.text } },
    el(
      'ul',
      { className: 'legend-list' },
      legendCard('legend-card-glow', 'legend-glow', STRINGS.legend.glow.text),
      legendCard('glass', 'legend-flicker', STRINGS.legend.flicker.text),
      legendCard('glass', 'legend-fog', STRINGS.legend.fog.text),
      legendCard('glass', 'legend-route', STRINGS.screens.legendRoute.text),
    ),
  );
}

/** A switch row: role="switch", with the label, a detail line, "on" or "off" in words, and a track. */
function switchRow(label: string, detail: string): { button: HTMLButtonElement; set(on: boolean): void } {
  const state = el('span', { className: 'switch-state' });
  const button = el(
    'button',
    { className: 'switch-row', attrs: { type: 'button', role: 'switch', 'aria-checked': 'false' } },
    el('span', { className: 'switch-text' }, el('span', { className: 'switch-label', text: label }), el('span', { className: 'switch-detail', text: detail })),
    state,
    el('span', { className: 'switch-track', attrs: { 'aria-hidden': 'true' } }),
  );
  const set = (on: boolean): void => {
    button.setAttribute('aria-checked', String(on));
    state.textContent = on ? STRINGS.plan.on.text : STRINGS.plan.off.text;
  };
  set(false);
  return { button, set };
}

export function createTools(opts: ToolsOptions): Tools {
  const { controller } = opts;
  const effects = switchRow(STRINGS.tools.effectsSwitch.text, STRINGS.tools.effectsDetail.text);
  const demo = switchRow(STRINGS.tools.demoSwitch.text, STRINGS.tools.demoDetail.text);
  const badge = sampleBadge();
  const chip = sampleBadge();
  opts.chipHost.append(chip);
  const demoError = el('p', { className: 'plan-message', text: STRINGS.errors.sampleDataLoad.text, attrs: { role: 'status' } });
  demoError.hidden = true;

  demo.button.addEventListener('click', () =>
    controller.dispatch({ type: 'setDemo', demo: !controller.getSnapshot().state.demo }),
  );
  effects.button.addEventListener('click', () =>
    controller.dispatch({ type: 'setReducedEffects', reducedEffects: !controller.getSnapshot().state.reducedEffects }),
  );
  const reset = el('button', { className: 'secondary-button', text: STRINGS.labels.reset.text, attrs: { type: 'button' } });
  reset.addEventListener('click', opts.onReset);

  opts.host.append(
    legend(),
    el(
      'section',
      { className: 'glass page-card switch-card', attrs: { 'aria-label': STRINGS.screens.settingsHeading.text } },
      effects.button,
      demo.button,
      el('div', { className: 'demo-badge-row' }, badge),
      demoError,
    ),
    el(
      'section',
      { className: 'glass page-card', attrs: { 'aria-label': STRINGS.labels.reset.text } },
      el('div', { className: 'tool-row' }, reset),
      el('p', { className: 'tool-note', text: STRINGS.tools.resetHint.text }),
    ),
  );

  controller.subscribe(({ state }: PlanSnapshot) => {
    demo.set(state.demo);
    effects.set(state.reducedEffects);
    badge.hidden = !state.demo; // sample data only appears while Demo_Mode is on
    chip.hidden = !state.demo;
  });

  return {
    showDemoError(on) {
      demoError.hidden = !on;
    },
  };
}
