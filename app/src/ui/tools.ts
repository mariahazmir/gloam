import { STRINGS } from '../content/strings';
import type { PlanController, PlanSnapshot } from '../state/planController';
import { el } from './dom';

// Legend, Demo_Mode and Reduced_Effects switches, About and guess buttons, and the Reset_Control
// (Requirements 4.10, 14.1, 17.9, 17.11, 17.13). This module only draws and forwards what the user
// does; main.ts applies the changes. Switches show their current state in words, not colour alone.

export interface ToolsOptions {
  host: HTMLElement;
  controller: PlanController;
  onAbout(): void;
  onGuess(): void;
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

function legend(): HTMLElement {
  const items: Array<[className: string, text: string]> = [
    ['legend-swatch legend-glow', STRINGS.legend.glow.text],
    ['legend-swatch legend-flicker', STRINGS.legend.flicker.text],
    ['legend-swatch legend-fog', STRINGS.legend.fog.text],
  ];
  return el(
    'section',
    { className: 'legend', attrs: { 'aria-label': STRINGS.tools.legendHeading.text } },
    el('h3', { className: 'tools-heading', text: STRINGS.tools.legendHeading.text }),
    el(
      'ul',
      { className: 'legend-list' },
      ...items.map(([cls, text]) =>
        el('li', { className: 'legend-item' }, el('span', { className: cls, attrs: { 'aria-hidden': 'true' } }), el('span', { text })),
      ),
    ),
  );
}

/** A switch button: role="switch", with "on" or "off" in its text. */
function switchButton(label: string): { button: HTMLButtonElement; set(on: boolean): void } {
  const button = el('button', { className: 'plan-button tool-switch', attrs: { type: 'button', role: 'switch', 'aria-checked': 'false' } });
  const set = (on: boolean): void => {
    button.setAttribute('aria-checked', String(on));
    button.textContent = `${label}: ${on ? STRINGS.plan.on.text : STRINGS.plan.off.text}`;
  };
  set(false);
  return { button, set };
}

export function createTools(opts: ToolsOptions): Tools {
  const { controller } = opts;

  const demo = switchButton(STRINGS.tools.demoSwitch.text);
  const badge = sampleBadge();
  const demoError = el('p', { className: 'plan-message', text: STRINGS.errors.sampleDataLoad.text, attrs: { role: 'status' } });
  demoError.hidden = true;
  const effects = switchButton(STRINGS.tools.effectsSwitch.text);

  demo.button.addEventListener('click', () =>
    controller.dispatch({ type: 'setDemo', demo: !controller.getSnapshot().state.demo }),
  );
  effects.button.addEventListener('click', () =>
    controller.dispatch({ type: 'setReducedEffects', reducedEffects: !controller.getSnapshot().state.reducedEffects }),
  );

  const action = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', { className: 'plan-button', text: label, attrs: { type: 'button' } });
    b.addEventListener('click', onClick);
    return b;
  };

  opts.host.append(
    el(
      'section',
      { className: 'tools' },
      legend(),
      el('h3', { className: 'tools-heading', text: STRINGS.tools.heading.text }),
      el('div', { className: 'tool-row' }, demo.button, badge),
      demoError,
      el('div', { className: 'tool-row' }, effects.button),
      el(
        'div',
        { className: 'tool-row' },
        action(STRINGS.tools.openAbout.text, opts.onAbout),
        action(STRINGS.tools.openGuess.text, opts.onGuess),
        action(STRINGS.labels.reset.text, opts.onReset),
      ),
      el('p', { className: 'tool-note', text: STRINGS.tools.resetHint.text }),
    ),
  );

  controller.subscribe(({ state }: PlanSnapshot) => {
    demo.set(state.demo);
    effects.set(state.reducedEffects);
    badge.hidden = !state.demo; // sample data only appears while Demo_Mode is on
  });

  return {
    showDemoError(on) {
      demoError.hidden = !on;
    },
  };
}
