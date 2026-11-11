import { STRINGS } from '../content/strings';
import type { PlanController, PlanSnapshot } from '../state/planController';
import { el } from './dom';

// The Sample_Walk label with its clear control (Requirements 17.7, 17.8) and the hint
// shown while a point is missing (17.10). One tap on the label or the control clears the
// example.

export function createGuidance(host: HTMLElement, controller: PlanController): void {
  host.classList.add('guidance');

  const banner = el(
    'button',
    { className: 'example-banner', attrs: { type: 'button' } },
    el('span', { text: STRINGS.sampleWalk.label.text }),
    el('span', { className: 'example-clear', text: STRINGS.sampleWalk.clear.text }),
  );
  banner.addEventListener('click', () => controller.dispatch({ type: 'clearExample' }));
  const hint = el('p', { className: 'hint', text: STRINGS.hint.setPoints.text, attrs: { role: 'status' } });

  const render = ({ state }: PlanSnapshot): void => {
    // The example is not the user's own walk, so the hint stays up beside it (Requirements 17.10, 17.13).
    if (state.exampleActive) host.replaceChildren(banner, hint);
    else if (state.start === null || state.end === null) host.replaceChildren(hint);
    else host.replaceChildren();
  };
  controller.subscribe(render);
}
