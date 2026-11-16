import { STRINGS, searchOffsetWording } from '../content/strings';
import {
  announcement,
  comboStep,
  initialComboState,
  type Availability,
  type ComboAction,
  type ComboState,
} from '../search/comboboxState';
import { compassOf, roundDistance, searchStreets, type SearchResult, type StreetIndex } from '../search/streetSearch';

// Street_Combobox shell (Requirements 19.1, 19.5, 19.7, 19.10, 13.12, 15.4).
// It maps DOM events to ComboActions and ComboState to attributes; the keyboard and
// announcement rules live in search/comboboxState.ts. The typed query is held only in
// the input element and in `state.query`: never stored, logged, put in the URL or sent.
// No animation. The map centre is read through `getCentre` when results are built.
//
// For tests without a DOM, pass a `doc` whose createElement returns objects with:
// setAttribute, removeAttribute, append, replaceChildren, addEventListener, textContent,
// className, id, value, disabled, hidden, style, focus.

export type StreetComboKind = 'start' | 'end';

export interface StreetComboboxOptions {
  kind: StreetComboKind;
  /** Current map centre; called each time results are built, never stored. */
  getCentre(): { lon: number; lat: number };
  /** The Street_Index of the loaded pack, or null when there is none yet. */
  getIndex(): StreetIndex | null;
  onChoose(result: SearchResult): void;
  /** Availability at creation. Default 'ready'. */
  availability?: Availability;
}

export interface StreetCombobox {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  setAvailability(value: Availability): void;
  /** Clears the input, results and list (City_Pack switch); keeps availability. */
  reset(): void;
  focus(): void;
}

export type ComboDocument = Pick<Document, 'createElement'>;

/** Option height floor in px (touch target). */
export const OPTION_MIN_HEIGHT_PX = 44;

let instanceCounter = 0;

function unavailableText(a: Availability): string {
  switch (a) {
    case 'no-pack':
      return STRINGS.search.unavailable.noPack.text;
    case 'loading':
      return STRINGS.search.unavailable.loading.text;
    case 'indexing':
      return STRINGS.search.unavailable.indexing.text;
    case 'ready':
      return '';
  }
}

export function createStreetCombobox(opts: StreetComboboxOptions, doc: ComboDocument = document): StreetCombobox {
  const uid = `street-combo-${opts.kind}-${instanceCounter++}`;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
  };

  const root = make('div', 'street-combo');
  const input = make('input', 'street-combo-input');
  const listbox = make('ul', 'street-combo-list');
  const helper = make('p', 'street-combo-helper');
  const note = make('p', 'street-combo-note');
  const unavailable = make('p', 'street-combo-unavailable');
  const status = make('div', 'street-combo-status');

  const helperId = `${uid}-helper`;
  const noteId = `${uid}-note`;
  const unavailableId = `${uid}-unavailable`;
  const listId = `${uid}-list`;
  helper.id = helperId;
  note.id = noteId;
  unavailable.id = unavailableId;
  listbox.id = listId;

  input.setAttribute('type', 'text');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-describedby', `${helperId} ${noteId}`);
  input.setAttribute('aria-label', opts.kind === 'start' ? STRINGS.search.startLabel.text : STRINGS.search.endLabel.text);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('spellcheck', 'false');
  listbox.setAttribute('role', 'listbox');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  helper.textContent = STRINGS.search.helper.text;
  note.textContent = STRINGS.search.unnamedNote.text;
  root.append(input, listbox, helper, note, unavailable, status);

  let state: ComboState = initialComboState(opts.availability ?? 'ready');
  let optionEls: HTMLElement[] = [];
  let renderedResults: ReadonlyArray<SearchResult> | null = null;

  const optionId = (i: number): string => `${uid}-opt-${i}`;

  function offsetText(r: SearchResult, centre: { lon: number; lat: number }): string {
    const dir = STRINGS.compass[compassOf(centre, r)].text;
    return searchOffsetWording(roundDistance(r.distanceM), dir);
  }

  function buildOptions(results: ReadonlyArray<SearchResult>): void {
    const centre = opts.getCentre();
    optionEls = results.map((r, i) => {
      const li = make('li', 'street-combo-option');
      li.id = optionId(i);
      li.setAttribute('role', 'option');
      li.style.minHeight = `${OPTION_MIN_HEIGHT_PX}px`;
      const name = make('span', 'street-combo-name');
      name.textContent = r.name;
      const offset = make('span', 'street-combo-offset');
      offset.textContent = offsetText(r, centre);
      li.append(name, offset);
      // Keep focus in the input while pressing an option.
      li.addEventListener('mousedown', (e: Event) => e.preventDefault());
      li.addEventListener('click', () => dispatch({ type: 'pointerChoose', index: i }));
      return li;
    });
    listbox.replaceChildren(...optionEls);
    renderedResults = results;
  }

  function render(): void {
    if (state.results !== renderedResults) buildOptions(state.results);
    const ready = state.availability === 'ready';
    input.disabled = !ready;
    input.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    if (!ready) input.setAttribute('aria-disabled', 'true');
    else input.removeAttribute('aria-disabled');
    if (state.open && state.activeIndex >= 0) {
      input.setAttribute('aria-activedescendant', optionId(state.activeIndex));
    } else {
      input.removeAttribute('aria-activedescendant');
    }
    optionEls.forEach((li, i) => li.setAttribute('aria-selected', i === state.activeIndex ? 'true' : 'false'));
    listbox.hidden = !state.open;
    unavailable.textContent = unavailableText(state.availability);
    unavailable.hidden = ready;
    input.setAttribute(
      'aria-describedby',
      ready ? `${helperId} ${noteId}` : `${unavailableId} ${helperId} ${noteId}`,
    );
    status.textContent =
      announcement(state, {
        count: STRINGS.search.count.text,
        noMatch: STRINGS.search.noMatch.text,
        shortQuery: STRINGS.search.shortQuery.text,
      }) ?? '';
  }

  function dispatch(action: ComboAction): void {
    const step = comboStep(state, action);
    state = step.state;
    if (action.type === 'availability' || action.type === 'reset') input.value = state.query;
    if (step.chosen !== null) input.value = step.chosen.name;
    render();
    if (step.chosen !== null) opts.onChoose(step.chosen);
  }

  input.addEventListener('input', () => {
    const query = input.value;
    const index = opts.getIndex();
    const results = index === null ? [] : searchStreets(index, query, opts.getCentre());
    dispatch({ type: 'input', query, results });
  });

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        dispatch({ type: 'arrowDown' });
        break;
      case 'ArrowUp':
        e.preventDefault();
        dispatch({ type: 'arrowUp' });
        break;
      case 'Enter':
        if (state.open) e.preventDefault();
        dispatch({ type: 'enter' });
        break;
      case 'Escape':
        if (state.open) e.preventDefault();
        dispatch({ type: 'escape' });
        break;
      case 'Tab':
        // Focus moves on as usual; the list closes and nothing is chosen.
        dispatch({ type: 'blur' });
        break;
      default:
        break;
    }
  });

  input.addEventListener('blur', () => dispatch({ type: 'blur' }));

  render();

  return {
    root,
    input,
    setAvailability(value: Availability): void {
      dispatch({ type: 'availability', value });
    },
    reset(): void {
      dispatch({ type: 'reset' });
    },
    focus(): void {
      input.focus();
    },
  };
}
