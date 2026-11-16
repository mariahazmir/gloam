import { STRINGS } from '../content/strings';
import type { Availability } from '../search/comboboxState';
import type { SearchResult, StreetIndex } from '../search/streetSearch';
import { el } from './dom';
import { createStreetCombobox, type StreetCombobox, type StreetComboKind } from './streetCombobox';

// The start and end Street_Comboboxes (Requirement 19.1). Built once into a host the caller places;
// the Route_Screen uses it, and it exists with or without a route. Choosing a result is passed on
// with the field's own kind; the caller dispatches `chooseStreet` (Requirement 19.4).

export interface StreetFieldsOptions {
  host: HTMLElement;
  /** Current map centre; read each time results are built. */
  getCentre(): { lon: number; lat: number };
  /** The Street_Index of the loaded pack, or null while there is none. */
  getIndex(): StreetIndex | null;
  onChoose(kind: StreetComboKind, result: SearchResult): void;
  availability?: Availability;
}

export interface StreetFields {
  readonly start: StreetCombobox;
  readonly end: StreetCombobox;
  setAvailability(value: Availability): void;
  /** City_Pack switch: clears both inputs and result lists and sets the availability. */
  clear(value: Availability): void;
}

export function createStreetFields(opts: StreetFieldsOptions): StreetFields {
  const make = (kind: StreetComboKind): StreetCombobox =>
    createStreetCombobox({
      kind,
      getCentre: opts.getCentre,
      getIndex: opts.getIndex,
      onChoose: (result) => opts.onChoose(kind, result),
      availability: opts.availability ?? 'loading',
    });
  const start = make('start');
  const end = make('end');
  const label = (kind: StreetComboKind): HTMLElement =>
    el('p', {
      className: 'street-field-label',
      text: kind === 'start' ? STRINGS.search.startLabel.text : STRINGS.search.endLabel.text,
      attrs: { 'aria-hidden': 'true' },
    });
  opts.host.append(
    el('div', { className: 'street-field' }, label('start'), start.root),
    el('div', { className: 'street-field' }, label('end'), end.root),
  );
  return {
    start,
    end,
    setAvailability(value) {
      start.setAvailability(value);
      end.setAvailability(value);
    },
    clear(value) {
      start.reset();
      end.reset();
      start.setAvailability(value);
      end.setAvailability(value);
    },
  };
}
