import { STRINGS } from '../content/strings';
import type { PersonalSettings } from '../routing/costs';
import type { PlanOutcome } from '../routing/planner';
import type { Mode, SettingState } from '../state/appState';
import type { PlanController, PlanSnapshot } from '../state/planController';
import { el } from './dom';

// Plan_Mode controls (Requirements 1.9, 6.1 to 6.6, 6.10, 6.11, 7.1, 7.10, 8.1, 8.5 to 8.7).
// This module only draws the controls and forwards what the user does to the
// PlanController; it never routes or snaps. There is no place-name search (6.4).

export const LAMBDA_MIN = 0;
export const LAMBDA_MAX = 10;
export const LAMBDA_STEP = 0.5;

export interface PlanControlsOptions {
  /** The panel the controls go into. */
  host: HTMLElement;
  /** Positioned over the centre of the map; holds the Crosshair. */
  crosshairHost: HTMLElement;
  controller: PlanController;
}

const TOGGLES: ReadonlyArray<{ key: keyof PersonalSettings; label: string }> = [
  { key: 'avoidSteps', label: STRINGS.plan.avoidSteps.text },
  { key: 'avoidService', label: STRINGS.plan.avoidService.text },
  { key: 'preferMain', label: STRINGS.plan.preferMain.text },
  { key: 'lowConfidenceDarker', label: STRINGS.plan.lowConfidenceDarker.text },
];

/** The message for an outcome that is not a route, or null when there is nothing to say. */
export function outcomeMessage(outcome: PlanOutcome): string | null {
  switch (outcome.kind) {
    case 'outsideArea':
      return STRINGS.errors.outsideArea.text;
    case 'tooFar':
      return STRINGS.errors.tooFarFromStreet.text;
    case 'samePlace':
      return STRINGS.errors.samePlace.text;
    case 'noRoute':
      return STRINGS.errors.noRoute.text;
    case 'incomplete':
    case 'route':
      return null;
  }
}

function pressable(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { className: 'plan-button', text: label, attrs: { type: 'button', 'aria-pressed': 'false' } });
  b.addEventListener('click', onClick);
  return b;
}

function action(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { className: 'plan-button', text: label, attrs: { type: 'button' } });
  b.addEventListener('click', onClick);
  return b;
}

export function createPlanControls(opts: PlanControlsOptions): void {
  const { controller } = opts;

  // Mode_Switch: shows the current mode and starts in Plan_Mode (Requirement 6.11).
  const planModeButton = pressable(STRINGS.plan.planMode.text, () => controller.dispatch({ type: 'switchMode', mode: 'plan' }));
  const reportModeButton = pressable(STRINGS.plan.reportMode.text, () =>
    controller.dispatch({ type: 'switchMode', mode: 'report' }),
  );
  const modeSwitch = el(
    'div',
    { className: 'mode-switch', attrs: { role: 'group', 'aria-label': STRINGS.plan.modeSwitch.text } },
    planModeButton,
    reportModeButton,
  );

  // "tap sets: start / end" (Requirement 6.1).
  const tapStart = pressable(STRINGS.plan.tapSetsStart.text, () =>
    controller.dispatch({ type: 'chooseSettingState', settingState: 'start' }),
  );
  const tapEnd = pressable(STRINGS.plan.tapSetsEnd.text, () =>
    controller.dispatch({ type: 'chooseSettingState', settingState: 'end' }),
  );
  const tapSets = el(
    'div',
    { className: 'tap-sets', attrs: { role: 'group', 'aria-label': STRINGS.plan.tapSets.text } },
    el('span', { className: 'tap-sets-label', text: STRINGS.plan.tapSets.text, attrs: { 'aria-hidden': 'true' } }),
    tapStart,
    tapEnd,
  );

  const pointButtons = el(
    'div',
    { className: 'point-buttons' },
    action(STRINGS.plan.setStartHere.text, () => controller.setStartHere()),
    action(STRINGS.plan.setEndHere.text, () => controller.setEndHere()),
    action(STRINGS.plan.useMyLocation.text, () => void controller.useMyLocation()),
  );

  // Lambda slider: 0 to 10, step 0.5, default 3 (Requirement 7.1).
  const sliderId = 'lambda-slider';
  const slider = el('input', {
    className: 'lambda-slider',
    attrs: {
      id: sliderId,
      type: 'range',
      min: String(LAMBDA_MIN),
      max: String(LAMBDA_MAX),
      step: String(LAMBDA_STEP),
      value: String(controller.getSnapshot().state.lambda),
      'aria-describedby': 'lambda-min lambda-max',
    },
  });
  const readout = el('output', { className: 'lambda-readout', attrs: { for: sliderId } });
  const lambdaBlock = el(
    'div',
    { className: 'lambda-block' },
    el('label', { className: 'lambda-label', text: STRINGS.plan.lambdaLabel.text, attrs: { for: sliderId } }),
    el('div', { className: 'lambda-row' }, slider, readout),
    el(
      'div',
      { className: 'lambda-ends' },
      el('span', { text: STRINGS.plan.lambdaMin.text, attrs: { id: 'lambda-min' } }),
      el('span', { text: STRINGS.plan.lambdaMax.text, attrs: { id: 'lambda-max' } }),
    ),
  );
  // True from the first `input` of a drag until its `change`, so a late render cannot pull the thumb back.
  let dragging = false;
  slider.addEventListener('input', () => {
    dragging = true;
    readout.textContent = slider.value;
    controller.requestLambda(Number(slider.value));
  });
  slider.addEventListener('change', () => {
    dragging = false;
    render(controller.getSnapshot());
  });

  // Four settings toggles, each with a visible on or off state (Requirement 8.1).
  const checks = new Map<keyof PersonalSettings, { input: HTMLInputElement; state: HTMLElement }>();
  const settingsBox = el('fieldset', { className: 'settings-box' }, el('legend', { text: STRINGS.plan.settingsLegend.text }));
  for (const { key, label } of TOGGLES) {
    const input = el('input', { attrs: { type: 'checkbox' } });
    const state = el('span', { className: 'toggle-state' });
    input.addEventListener('change', () => {
      controller.changeSettings({ ...controller.getSnapshot().state.settings, [key]: input.checked });
    });
    checks.set(key, { input, state });
    settingsBox.append(el('label', { className: 'toggle' }, input, el('span', { className: 'toggle-label', text: label }), state));
  }

  const messages = el('div', { className: 'plan-messages', attrs: { role: 'status' } });
  const planOnly = el('div', { className: 'plan-only' }, tapSets, pointButtons, lambdaBlock, settingsBox);

  const crosshair = el('div', { className: 'crosshair', attrs: { 'aria-hidden': 'true', title: STRINGS.plan.crosshair.text } });
  opts.crosshairHost.replaceChildren(crosshair);
  opts.host.append(el('section', { className: 'plan-controls' }, modeSwitch, planOnly, messages));

  const setPressed = (b: HTMLButtonElement, on: boolean): void => b.setAttribute('aria-pressed', String(on));

  function render(snap: PlanSnapshot): void {
    const { state, outcome, notices } = snap;
    const mode: Mode = state.mode;
    setPressed(planModeButton, mode === 'plan');
    setPressed(reportModeButton, mode === 'report');
    planOnly.hidden = mode !== 'plan';
    crosshair.hidden = mode !== 'plan';

    const s: SettingState = state.settingState;
    setPressed(tapStart, s === 'start');
    setPressed(tapEnd, s === 'end');

    // After a rejected value the slider goes back to the previous one (Requirement 7.10).
    if (!dragging || notices.number) slider.value = String(state.lambda);
    if (!dragging) readout.textContent = String(state.lambda);

    for (const [key, { input, state: text }] of checks) {
      input.checked = state.settings[key];
      text.textContent = state.settings[key] ? STRINGS.plan.on.text : STRINGS.plan.off.text;
    }

    const lines: string[] = [];
    const out = outcomeMessage(outcome);
    if (out !== null) lines.push(out);
    if (notices.location) lines.push(STRINGS.errors.locationUnavailable.text);
    if (notices.settings) lines.push(STRINGS.errors.settingsStore.text);
    if (notices.number) lines.push(STRINGS.errors.invalidNumber.text);
    messages.replaceChildren(...lines.map((text) => el('p', { className: 'plan-message', text })));
  }

  controller.subscribe(render);
}
