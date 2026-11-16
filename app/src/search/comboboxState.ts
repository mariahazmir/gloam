import type { SearchResult } from './streetSearch';

/**
 * Pure keyboard and announcement logic for the Street_Combobox.
 * No DOM, no I/O, no wording: the shell passes the text in (from content/strings.ts).
 */
export type Availability = 'ready' | 'no-pack' | 'loading' | 'indexing';

export interface ComboState {
  availability: Availability;
  query: string;
  results: ReadonlyArray<SearchResult>;
  open: boolean;
  /** -1 means none. */
  activeIndex: number;
  status: 'idle' | 'short' | 'results' | 'noMatch';
}

export type ComboAction =
  | { type: 'input'; query: string; results: ReadonlyArray<SearchResult> }
  | { type: 'arrowDown' }
  | { type: 'arrowUp' }
  | { type: 'enter' }
  | { type: 'escape' }
  | { type: 'blur' }
  | { type: 'pointerChoose'; index: number }
  | { type: 'availability'; value: Availability }
  | { type: 'reset' };

/** Texts the shell supplies for the live region. */
export interface AnnouncementTexts {
  count: (n: number) => string;
  noMatch: string;
  shortQuery: string;
}

const MIN_QUERY_CODE_POINTS = 2;

export function initialComboState(availability: Availability = 'ready'): ComboState {
  return { availability, query: '', results: [], open: false, activeIndex: -1, status: 'idle' };
}

function choose(s: ComboState, index: number): { state: ComboState; chosen: SearchResult | null } {
  const chosen = Number.isInteger(index) ? s.results[index] : undefined;
  if (chosen === undefined || index < 0) return { state: s, chosen: null };
  return { state: { ...s, open: false, activeIndex: -1 }, chosen };
}

export function comboStep(s: ComboState, a: ComboAction): { state: ComboState; chosen: SearchResult | null } {
  const none = (state: ComboState) => ({ state, chosen: null });
  switch (a.type) {
    case 'input': {
      if (s.availability !== 'ready') return none(s);
      const short = Array.from(a.query.trim()).length < MIN_QUERY_CODE_POINTS;
      if (short) {
        return none({ ...s, query: a.query, results: [], open: false, activeIndex: -1, status: 'short' });
      }
      if (a.results.length === 0) {
        return none({ ...s, query: a.query, results: [], open: false, activeIndex: -1, status: 'noMatch' });
      }
      return none({ ...s, query: a.query, results: a.results, open: true, activeIndex: -1, status: 'results' });
    }
    case 'arrowDown': {
      const n = s.results.length;
      if (n === 0) return none(s);
      if (!s.open) return none({ ...s, open: true, activeIndex: 0 });
      return none({ ...s, activeIndex: (s.activeIndex + 1) % n });
    }
    case 'arrowUp': {
      const n = s.results.length;
      if (n === 0) return none(s);
      if (!s.open) return none({ ...s, open: true, activeIndex: n - 1 });
      return none({ ...s, activeIndex: s.activeIndex <= 0 ? n - 1 : s.activeIndex - 1 });
    }
    case 'enter':
      return s.open ? choose(s, s.activeIndex) : none(s);
    case 'pointerChoose':
      return choose(s, a.index);
    case 'escape':
    case 'blur':
      return none({ ...s, open: false, activeIndex: -1 });
    case 'availability':
      if (a.value === 'ready') return none({ ...s, availability: 'ready' });
      return none(initialComboState(a.value));
    case 'reset':
      return none(initialComboState(s.availability));
  }
}

/** Live-region text for the state; null when nothing should be announced. */
export function announcement(s: ComboState, texts: AnnouncementTexts): string | null {
  switch (s.status) {
    case 'results':
      return texts.count(s.results.length);
    case 'noMatch':
      return texts.noMatch;
    case 'short':
      return texts.shortQuery;
    default:
      return null;
  }
}
