import { STRINGS } from '../content/strings';
import type { PersonalSettings } from '../routing/costs';
import type { PlanOutcome } from '../routing/planner';
import type { Mode, SettingState } from '../state/appState';
import type { PlanController, PlanSnapshot } from '../state/planController';
import { el } from './dom';

// Plan_Mode controls (Requirements 1.9, 6.1 to 6.6, 6.10, 6.11, 7.1, 7.10, 8.1, 8.5 to 8.7).
// This module only draws the controls and forwards what the user does to the
// PlanController; it never routes or snaps. The only search is the offline
// street-name search of Requirement 19 (ui/streetFields.ts); there is no place or address search.

export const LAMBDA_MIN = 0;
export const LAMBDA_MAX = 10;
export const LAMBDA_STEP = 0.5;

export interface PlanControlsOptions {
  /** Each gets its own Mode_Switch: the Map_Screen and Report_Screen sheets. */
  modeHosts: ReadonlyArray<HTMLElement>;
  /** Holds the start and end controls, inside a "change start or end" disclosure. */
  pointsHost: HTMLElement;
  lambdaHost: HTMLElement;
  /** The routing settings go on the Route_Screen (Requirement 18.3). */
  settingsHost: HTMLElement;
  messagesHost: HTMLElement;
  /** Opens a mode's screen; the screen change then sets the mode (Requirement 18.4). */
  openMode(mode: Mode): void;
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
  // One Mode_Switch per sheet; every copy shows the same mode.
  const modeButtons: Array<{ plan: HTMLButtonElement; report: HTMLButtonElement }> = [];
  for (const host of opts.modeHosts) {
    const plan = pressable(STRINGS.plan.planMode.text, () => opts.openMode('plan'));
    const report = pressable(STRINGS.plan.reportMode.text, () => opts.openMode('report'));
    modeButtons.push({ plan, report });
    host.append(
      el('div', { className: 'mode-switch', attrs: { role: 'group', 'aria-label': STRINGS.plan.modeSwitch.text } }, plan, report),
    );
  }

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
  // The filled part of the track, for the gradient fill in base.css.
  const setFill = (): void => slider.style.setProperty('--fill', String((Number(slider.value) - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN)));
  slider.addEventListener('input', () => {
    setFill();
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
  // Open while there is no route; once a route shows, one tap opens it (Requirement 6.10).
  const points = el(
    'details',
    { className: 'points glass' },
    el('summary', { className: 'points-summary', text: STRINGS.screens.changePoints.text }),
    el('div', { className: 'points-body' }, tapSets, pointButtons),
  );
  let hadRoute: boolean | null = null;

  const crosshair = el('div', { className: 'crosshair', attrs: { 'aria-hidden': 'true', title: STRINGS.plan.crosshair.text } });
  opts.crosshairHost.replaceChildren(crosshair);
  opts.pointsHost.append(points);
  opts.lambdaHost.append(lambdaBlock);
  opts.settingsHost.append(settingsBox);
  opts.messagesHost.append(messages);

  const setPressed = (b: HTMLButtonElement, on: boolean): void => b.setAttribute('aria-pressed', String(on));

  function render(snap: PlanSnapshot): void {
    const { state, outcome, notices } = snap;
    const mode: Mode = state.mode;
    for (const b of modeButtons) {
      setPressed(b.plan, mode === 'plan');
      setPressed(b.report, mode === 'report');
    }
    const hasRoute = outcome.kind === 'route';
    if (hasRoute !== hadRoute) points.open = !hasRoute;
    hadRoute = hasRoute;
    crosshair.hidden = mode !== 'plan';

    const s: SettingState = state.settingState;
    setPressed(tapStart, s === 'start');
    setPressed(tapEnd, s === 'end');

    // After a rejected value the slider goes back to the previous one (Requirement 7.10).
    if (!dragging || notices.number) slider.value = String(state.lambda);
    setFill();
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
