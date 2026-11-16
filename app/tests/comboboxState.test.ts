import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/content/strings';
import {
  announcement,
  comboStep,
  initialComboState,
  type AnnouncementTexts,
  type ComboAction,
  type ComboState,
} from '../src/search/comboboxState';
import type { SearchResult } from '../src/search/streetSearch';

const texts: AnnouncementTexts = {
  count: STRINGS.search.count.text,
  noMatch: STRINGS.search.noMatch.text,
  shortQuery: STRINGS.search.shortQuery.text,
};

const r = (name: string): SearchResult => ({ name, stretchKey: name, lon: 0, lat: 0, distanceM: 10 });
const A = r('A Street');
const B = r('B Street');
const C = r('C Street');

const step = (s: ComboState, a: ComboAction) => comboStep(s, a);
const withResults = (results: SearchResult[]) =>
  step(initialComboState(), { type: 'input', query: 'street', results }).state;

describe('combobox state machine', () => {
  it('opens the list on input with results and no active option', () => {
    const s = withResults([A, B, C]);
    expect(s).toMatchObject({ open: true, activeIndex: -1, status: 'results' });
    expect(s.results).toHaveLength(3);
  });

  it('ArrowDown from closed list opens and activates the first option', () => {
    const closed = step(withResults([A, B, C]), { type: 'escape' }).state;
    const s = step(closed, { type: 'arrowDown' }).state;
    expect(s).toMatchObject({ open: true, activeIndex: 0 });
  });

  it('ArrowDown with no active option activates first, then wraps from last to first', () => {
    let s = withResults([A, B, C]);
    s = step(s, { type: 'arrowDown' }).state;
    expect(s.activeIndex).toBe(0);
    s = step(s, { type: 'arrowDown' }).state;
    s = step(s, { type: 'arrowDown' }).state;
    expect(s.activeIndex).toBe(2);
    s = step(s, { type: 'arrowDown' }).state;
    expect(s.activeIndex).toBe(0);
  });

  it('ArrowUp from closed list opens on the last option; with none active goes to last; wraps first to last', () => {
    const closed = step(withResults([A, B, C]), { type: 'blur' }).state;
    let s = step(closed, { type: 'arrowUp' }).state;
    expect(s).toMatchObject({ open: true, activeIndex: 2 });
    s = step(withResults([A, B, C]), { type: 'arrowUp' }).state;
    expect(s.activeIndex).toBe(2);
    s = step(s, { type: 'arrowUp' }).state;
    expect(s.activeIndex).toBe(1);
    s = step(s, { type: 'arrowUp' }).state;
    s = step(s, { type: 'arrowUp' }).state;
    expect(s.activeIndex).toBe(2);
  });

  it('arrows do nothing with an empty list', () => {
    const s = initialComboState();
    expect(step(s, { type: 'arrowDown' }).state).toEqual(s);
    expect(step(s, { type: 'arrowUp' }).state).toEqual(s);
  });

  it('Enter with an active option chooses it and closes', () => {
    let s = withResults([A, B, C]);
    s = step(s, { type: 'arrowDown' }).state;
    s = step(s, { type: 'arrowDown' }).state;
    const out = step(s, { type: 'enter' });
    expect(out.chosen).toBe(B);
    expect(out.state).toMatchObject({ open: false, activeIndex: -1 });
  });

  it('Enter without an active option, or when closed, chooses nothing', () => {
    const s = withResults([A, B]);
    const out = step(s, { type: 'enter' });
    expect(out.chosen).toBeNull();
    expect(out.state).toEqual(s);
    const closed = step(s, { type: 'escape' }).state;
    expect(step(closed, { type: 'enter' }).chosen).toBeNull();
  });

  it('Escape keeps query and results but closes and clears the active option', () => {
    let s = withResults([A, B]);
    s = step(s, { type: 'arrowDown' }).state;
    const out = step(s, { type: 'escape' });
    expect(out.chosen).toBeNull();
    expect(out.state).toMatchObject({ open: false, activeIndex: -1, query: 'street', status: 'results' });
    expect(out.state.results).toEqual([A, B]);
  });

  it('blur closes without choosing', () => {
    let s = withResults([A, B]);
    s = step(s, { type: 'arrowDown' }).state;
    const out = step(s, { type: 'blur' });
    expect(out.chosen).toBeNull();
    expect(out.state).toMatchObject({ open: false, activeIndex: -1 });
  });

  it('pointerChoose with a valid index chooses and closes', () => {
    const out = step(withResults([A, B, C]), { type: 'pointerChoose', index: 2 });
    expect(out.chosen).toBe(C);
    expect(out.state).toMatchObject({ open: false, activeIndex: -1 });
  });

  it.each([-1, 3, 1.5, Number.NaN])('pointerChoose with invalid index %s chooses nothing', (index) => {
    const s = withResults([A, B, C]);
    const out = step(s, { type: 'pointerChoose', index });
    expect(out.chosen).toBeNull();
    expect(out.state).toEqual(s);
  });

  it('empty and one-character queries give status short, no results, closed', () => {
    for (const query of ['', ' ', 'a', '  é ']) {
      const s = step(withResults([A]), { type: 'input', query, results: [A] }).state;
      expect(s).toMatchObject({ status: 'short', open: false, activeIndex: -1, query });
      expect(s.results).toEqual([]);
    }
  });

  it('a query with no match gives status noMatch and closes', () => {
    const s = step(withResults([A]), { type: 'input', query: 'zzzz', results: [] }).state;
    expect(s).toMatchObject({ status: 'noMatch', open: false, query: 'zzzz' });
    expect(s.results).toEqual([]);
  });

  it('input is ignored when not ready', () => {
    const s = initialComboState('loading');
    const out = step(s, { type: 'input', query: 'main', results: [A] });
    expect(out.state).toEqual(s);
  });

  it('availability other than ready clears query, results and status', () => {
    const out = step(withResults([A, B]), { type: 'availability', value: 'indexing' }).state;
    expect(out).toEqual(initialComboState('indexing'));
  });

  it('availability ready keeps the current state', () => {
    const s = withResults([A]);
    expect(step(s, { type: 'availability', value: 'ready' }).state).toEqual(s);
  });

  it('reset clears state but keeps availability', () => {
    expect(step(withResults([A, B]), { type: 'reset' }).state).toEqual(initialComboState('ready'));
    const noPack = initialComboState('no-pack');
    expect(step(noPack, { type: 'reset' }).state.availability).toBe('no-pack');
  });
});

describe('combobox announcement', () => {
  it('says "1 street found" for one result', () => {
    expect(announcement(withResults([A]), texts)).toBe('1 street found');
  });

  it('says "3 streets found" for three results', () => {
    expect(announcement(withResults([A, B, C]), texts)).toBe('3 streets found');
  });

  it('announces no match and short query texts', () => {
    const noMatch = step(initialComboState(), { type: 'input', query: 'zzzz', results: [] }).state;
    expect(announcement(noMatch, texts)).toBe(STRINGS.search.noMatch.text);
    const short = step(initialComboState(), { type: 'input', query: 'a', results: [] }).state;
    expect(announcement(short, texts)).toBe(STRINGS.search.shortQuery.text);
  });

  it('announces nothing when idle or after reset', () => {
    expect(announcement(initialComboState(), texts)).toBeNull();
    expect(announcement(step(withResults([A]), { type: 'reset' }).state, texts)).toBeNull();
  });
});
