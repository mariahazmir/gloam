// Task 14.6: guess screen content, first-run values, Demo_Mode and Reduced_Effects state, About wording.
import { describe, expect, it, vi } from 'vitest';
import validationRaw from '../../docs/validation.md?raw';
import { buildGuessModel } from '../src/content/guessModel';
import { STRINGS } from '../src/content/strings';
import { createInitialState, reduce } from '../src/state/appState';
import { hostedDefault, prefersReducedMotion } from '../src/state/firstRun';
import { findBanned } from './helpers/bannedWords';

const allText = (m: ReturnType<typeof buildGuessModel>): string[] => [
  ...m.statements,
  m.aucNote,
  ...(m.validation.status === 'ok'
    ? [...m.validation.figures, m.validation.comparison, ...(m.validation.skipped ? [m.validation.skipped] : [])]
    : [m.validation.message]),
];

describe('How_Gloam_Guesses_Screen content', () => {
  const model = buildGuessModel(validationRaw);

  it('quotes the AUC figures exactly as docs/validation.md writes them', () => {
    if (model.validation.status !== 'ok') throw new Error('validation unavailable');
    // Read off docs/validation.md by hand: berlin 0.776 vs 0.828, london 0.652 vs 0.627, manchester 0.744 vs 0.845.
    expect(model.validation.figures).toEqual([
      'berlin, walking paths: model AUC 0.776, highway-footway-rate baseline AUC 0.828',
      'london, walking paths: model AUC 0.652, highway-footway-rate baseline AUC 0.627',
      'manchester, walking paths: model AUC 0.744, highway-footway-rate baseline AUC 0.845',
    ]);
  });

  it('names exactly the cities where the model did not beat the baseline', () => {
    if (model.validation.status !== 'ok') throw new Error('validation unavailable');
    // 0.776 < 0.828 (berlin) and 0.744 < 0.845 (manchester); london 0.652 > 0.627 beats it.
    expect(model.validation.comparison).toContain('berlin, manchester');
    expect(model.validation.comparison).not.toContain('london');
  });

  it('names the cities with no hold-out test', () => {
    if (model.validation.status !== 'ok') throw new Error('validation unavailable');
    expect(model.validation.skipped).toContain('kl, seattle');
  });

  it('quotes no precision and no figure from the 0.5 cut-off', () => {
    const text = allText(model).join('\n');
    expect(text.toLowerCase()).not.toContain('precision');
    for (const precision of ['0.901', '0.926', '0.973', '0.858', '0.925', '0.964']) expect(text).not.toContain(precision);
  });

  it('states the three required points', () => {
    expect(model.statements.join(' ')).toMatch(/map data/);
    expect(model.statements.join(' ')).toMatch(/road type and path kind/);
    expect(model.statements.join(' ')).toMatch(/add little on tagged walking paths/);
    expect(model.statements.join(' ')).toMatch(/can be wrong/);
    expect(model.statements.join(' ')).toMatch(/lighting records are missing in many cities/);
  });

  it('uses no banned word', () => {
    for (const t of allText(model)) expect(findBanned(t), t).toEqual([]);
  });

  it('with unreadable text shows the unavailable message, no figures, and still the statements', () => {
    const bad = buildGuessModel('nothing useful here');
    expect(bad.validation).toEqual({ status: 'unavailable', message: STRINGS.errors.validationUnavailable.text });
    expect(bad.statements).toEqual(model.statements);
    expect(allText(bad).join(' ')).not.toMatch(/\d\.\d{3}/);
  });

  it('building it makes no network request', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    buildGuessModel(validationRaw);
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('About and Legend wording', () => {
  it('About says the tile provider sees the area viewed but not routes', () => {
    expect(STRINGS.about.tiles.text).toMatch(/tile provider can see the area/);
    expect(STRINGS.about.tiles.text).toMatch(/cannot see your routes/);
  });

  it('Legend has one line each for glow, flicker and fog, none over 80 characters', () => {
    expect(Object.keys(STRINGS.legend).sort()).toEqual(['flicker', 'fog', 'glow']);
    for (const s of Object.values(STRINGS.legend)) expect(s.text.length).toBeLessThanOrEqual(80);
  });
});

describe('first-run values', () => {
  it('Demo_Mode starts on only when VITE_GLOAM_HOSTED is "true"', () => {
    expect(hostedDefault('true')).toBe(true);
    expect(hostedDefault(true)).toBe(true);
    for (const v of [undefined, '', 'false', 'TRUE', '1', 0, null]) expect(hostedDefault(v)).toBe(false);
  });

  it('Reduced_Effects_Mode follows prefers-reduced-motion at load', () => {
    const queries: string[] = [];
    const host = (matches: boolean) => ({
      matchMedia: (q: string) => {
        queries.push(q);
        return { matches };
      },
    });
    expect(prefersReducedMotion(host(true))).toBe(true);
    expect(prefersReducedMotion(host(false))).toBe(false);
    expect(queries[0]).toBe('(prefers-reduced-motion: reduce)');
    expect(prefersReducedMotion({})).toBe(false);
  });
});

describe('Demo_Mode, Reduced_Effects and Reset state', () => {
  const start = createInitialState({ reducedEffects: false, demo: true });

  it('switches change only their own flag', () => {
    const off = reduce(start, { type: 'setDemo', demo: false });
    expect(off).toEqual({ ...start, demo: false });
    const reduced = reduce(start, { type: 'setReducedEffects', reducedEffects: true });
    expect(reduced).toEqual({ ...start, reducedEffects: true });
  });

  it('showing the example after user points restores the walk and keeps lambda and settings', () => {
    let s = reduce(start, { type: 'setLambda', lambda: 7 });
    s = reduce(s, { type: 'tap', lon: 1, lat: 2 });
    s = reduce(s, { type: 'setDemo', demo: false });
    const walk = { start: { lon: 3, lat: 4 }, end: { lon: 5, lat: 6 } };
    s = reduce(s, { type: 'showExample', ...walk });
    s = reduce(s, { type: 'setDemo', demo: true });
    expect(s).toMatchObject({ ...walk, exampleActive: true, demo: true, lambda: 7, mode: 'plan', settingState: 'start' });
  });
});
