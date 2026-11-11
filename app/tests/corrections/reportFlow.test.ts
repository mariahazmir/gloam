// Task 14.5: notes, session, combined totals, card model, Dark_Spot_List inputs.
import { describe, expect, it } from 'vitest';
import sampleRaw from '../../../data/sample-data.json?raw';
import { combineCorrections, dayString } from '../../src/corrections/combine';
import { darkSpots } from '../../src/corrections/darkSpots';
import { buildSegmentCard } from '../../src/corrections/segmentCard';
import { createCorrectionSession } from '../../src/corrections/session';
import { segmentLayerIds } from '../../src/map/layers';
import { parseSampleData } from '../../src/pack/sampleData';
import { effectiveAttrs } from '../../src/routing/costs';
import { overridesFromNotes } from '../../src/scoring/overrides';
import { assignTiers } from '../../src/scoring/tiers';
import { CORRECTIONS_KEY, createLocalCorrectionStore } from '../../src/storage/localCorrectionStore';
import type { KeyValueStorage } from '../../src/storage/keyValueStorage';
import type { Segment } from '../../src/types';
import { findBanned } from '../helpers/bannedWords';
import { STRINGS } from '../../src/content/strings';
import type { Edge } from '../../src/graph/build';

function fakeStorage(opts: { failWrite?: boolean; failRead?: boolean } = {}) {
  const data = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem: (k) => {
      if (opts.failRead) throw new Error('read blocked');
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (opts.failWrite) throw new Error('quota');
      data.set(k, v);
    },
  };
  return { storage, data };
}

const seg = (id: string, over: Partial<Segment> = {}): Segment => ({
  id,
  name: null,
  highway: 'residential',
  litProbability: 0.4,
  confidence: 0.62,
  labelSource: 'estimated',
  coordinates: [[0, 0], [0, 1]],
  ...over,
});

describe('notes and overrides', () => {
  it('actually_lit gives 1, the other two give 0, confidence always 1; a later row wins', () => {
    const m = overridesFromNotes([
      { segmentId: 'a', type: 'actually_lit' },
      { segmentId: 'b', type: 'actually_dark' },
      { segmentId: 'c', type: 'light_is_out' },
      { segmentId: 'a', type: 'actually_dark' },
    ]);
    expect(m.get('a')).toEqual({ litProbability: 0, confidence: 1 });
    expect(m.get('b')).toEqual({ litProbability: 0, confidence: 1 });
    expect(m.get('c')).toEqual({ litProbability: 0, confidence: 1 });
    expect(overridesFromNotes([{ segmentId: 'x', type: 'actually_lit' }]).get('x')).toEqual({ litProbability: 1, confidence: 1 });
  });

  it('a note changes that edge for routing and nothing else, and changes no Tier', () => {
    const segments = [seg('1', { litProbability: 0.9 }), seg('2', { litProbability: 0.5 }), seg('3', { litProbability: 0.1 })];
    const before = assignTiers(segments);
    const overrides = overridesFromNotes([{ segmentId: '1', type: 'actually_dark' }]);
    const edge = (id: string): Edge =>
      ({ segmentId: id, lengthM: 100, litProbability: 0.9, confidence: 0.62, highway: 'residential' }) as unknown as Edge;
    expect(effectiveAttrs(edge('1'), overrides)).toMatchObject({ litProbability: 0, confidence: 1 });
    expect(effectiveAttrs(edge('2'), overrides)).toMatchObject({ litProbability: 0.9, confidence: 0.62 });
    // Tiers are computed from the pack only: nothing about the note is an input.
    expect(assignTiers(segments)).toEqual(before);
  });
});

describe('correction session', () => {
  const today = '2026-11-12';

  it('keeps one note per segment and stores only the three values under gloam.corrections.v1', () => {
    const { storage, data } = fakeStorage();
    const s = createCorrectionSession(createLocalCorrectionStore(storage));
    expect(s.submit({ segmentId: '7', type: 'actually_lit', date: today })).toBe(true);
    expect(s.submit({ segmentId: '7', type: 'light_is_out', date: today })).toBe(true);
    expect(s.corrections()).toEqual([{ segmentId: '7', type: 'light_is_out', date: today }]);
    expect([...data.keys()]).toEqual([CORRECTIONS_KEY]);
    expect(CORRECTIONS_KEY).toBe('gloam.corrections.v1');
    expect(JSON.parse(data.get(CORRECTIONS_KEY)!)).toEqual([['7', 'light_is_out', today]]);
    expect(s.overrides().get('7')).toEqual({ litProbability: 0, confidence: 1 });
  });

  it('keeps the same overrides object until a note changes', () => {
    const { storage } = fakeStorage();
    const s = createCorrectionSession(createLocalCorrectionStore(storage));
    const first = s.overrides();
    expect(s.overrides()).toBe(first);
    s.submit({ segmentId: '1', type: 'actually_dark', date: today });
    expect(s.overrides()).not.toBe(first);
  });

  it('a failed save reports it, keeps earlier notes and changes nothing', () => {
    const ok = fakeStorage();
    const store = createLocalCorrectionStore(ok.storage);
    const s = createCorrectionSession(store);
    s.submit({ segmentId: '1', type: 'actually_dark', date: today });
    const overrides = s.overrides();
    // Same data, but the next write fails.
    const failing = fakeStorage({ failWrite: true });
    failing.data.set(CORRECTIONS_KEY, ok.data.get(CORRECTIONS_KEY)!);
    const s2 = createCorrectionSession(createLocalCorrectionStore(failing.storage));
    expect(s2.storeError()).toBe(false);
    expect(s2.submit({ segmentId: '2', type: 'actually_lit', date: today })).toBe(false);
    expect(s2.storeError()).toBe(true);
    expect(s2.corrections()).toEqual([{ segmentId: '1', type: 'actually_dark', date: today }]);
    expect(failing.data.get(CORRECTIONS_KEY)).toBe(ok.data.get(CORRECTIONS_KEY));
    expect(overrides.size).toBe(1);
  });

  it('an unreadable store starts empty with the error flag set, and the app can go on', () => {
    const s = createCorrectionSession(createLocalCorrectionStore(fakeStorage({ failRead: true }).storage));
    expect(s.storeError()).toBe(true);
    expect(s.corrections()).toEqual([]);
    expect(s.overrides().size).toBe(0);
    const none = createCorrectionSession(createLocalCorrectionStore(null));
    expect(none.storeError()).toBe(true);
  });
});

describe('combined notes and Sample_Data', () => {
  const today = new Date('2026-11-12T10:00:00Z');
  const sample = [
    { city: 'seattle', segmentId: '1', type: 'actually_dark' as const, date: '2026-11-11' },
    { city: 'kl', segmentId: '1', type: 'actually_dark' as const, date: '2026-11-11' },
    { city: 'seattle', segmentId: 'gone', type: 'light_is_out' as const, date: '2026-11-11' },
  ];
  const local = [{ segmentId: '2', type: 'light_is_out' as const, date: '2026-11-12' }, { segmentId: 'other', type: 'actually_lit' as const, date: '2026-11-12' }];
  const has = (id: string) => ['1', '2'].includes(id);

  it('dayString is the UTC calendar day', () => {
    expect(dayString(today)).toBe('2026-11-12');
  });

  it('keeps this city, tags sample rows, and drops rows for other cities or segments not in the pack', () => {
    expect(combineCorrections(local, sample, 'seattle', has)).toEqual([
      { segmentId: '2', type: 'light_is_out', date: '2026-11-12', sample: false },
      { segmentId: '1', type: 'actually_dark', date: '2026-11-11', sample: true },
    ]);
  });

  it('a city with no sample rows gives just the local notes, no error', () => {
    expect(combineCorrections(local, sample, 'berlin', has).map((c) => c.sample)).toEqual([false]);
    expect(combineCorrections([], sample, 'berlin', has)).toEqual([]);
    expect(darkSpots(combineCorrections([], sample, 'manchester', has), () => ({ name: null, highway: '' }))).toEqual([]);
  });

  it('with Demo_Mode off (no sample rows) no list entry carries the sample flag', () => {
    const rows = darkSpots(combineCorrections(local, [], 'seattle', has), () => ({ name: null, highway: 'residential' }));
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => !r.sample)).toBe(true);
    const withSample = darkSpots(combineCorrections(local, sample, 'seattle', has), () => ({ name: null, highway: 'residential' }));
    expect(withSample.find((r) => r.segmentId === '1')!.sample).toBe(true);
    expect(withSample.find((r) => r.segmentId === '2')!.sample).toBe(false);
  });

  it('the bundled Sample_Data parses and each pack city has rows (so the list shows them)', () => {
    const rows = parseSampleData(JSON.parse(sampleRaw), today)!;
    expect(rows).not.toBeNull();
    for (const city of ['seattle', 'kl', 'london', 'berlin', 'manchester']) {
      expect(rows.filter((r) => r.city === city).length).toBeGreaterThan(0);
    }
  });
});

describe('segment card', () => {
  const today = '2026-11-12';
  const s = seg('9', { name: null, highway: 'footway', confidence: 0.62 });

  it('says "unnamed" and uses the pack Tier wording with confidence', () => {
    const card = buildSegmentCard(s, 'typical', [], today);
    expect(card.name).toBe('unnamed');
    expect(card.tierText).toBe('estimated: typical (confidence 62%)');
    expect(card.yourNote).toBeNull();
    expect(card.status).toBeNull();
  });

  it('shows your own note, and one note alone gives no community status', () => {
    const mine = [{ segmentId: '9', type: 'actually_dark' as const, date: today, sample: false }];
    const card = buildSegmentCard(s, 'typical', mine, today);
    expect(card.yourNote).toBe('your note: actually dark');
    expect(card.status).toBeNull();
    expect(card.tierText).toBe('estimated: typical (confidence 62%)'); // a note never changes the Tier wording
  });

  it('three same-day dark reports give "confirmed by 3 people", labelled sample when any is sample', () => {
    // Each weighs 1 today, so the dark side is 3, at the threshold of 3 and above the lit side's 0.
    const rows = [
      { segmentId: '9', type: 'actually_dark' as const, date: today, sample: true },
      { segmentId: '9', type: 'light_is_out' as const, date: today, sample: true },
      { segmentId: '9', type: 'actually_dark' as const, date: today, sample: true },
      { segmentId: '10', type: 'actually_lit' as const, date: today, sample: true },
    ];
    const card = buildSegmentCard(s, 'darker_than_most', rows, today);
    expect(card.status).toEqual({ text: 'confirmed by 3 people: likely dark', sample: true });
  });

  it('a local note counted with two sample reports is still labelled sample', () => {
    // All three are dated today, so each weighs 1: the lit side is 3.
    const rows = [
      { segmentId: '9', type: 'actually_lit' as const, date: today, sample: false },
      { segmentId: '9', type: 'actually_lit' as const, date: today, sample: true },
      { segmentId: '9', type: 'actually_lit' as const, date: today, sample: true },
    ];
    const card = buildSegmentCard(s, 'typical', rows, today);
    expect(card.status).toEqual({ text: 'confirmed by 3 people: likely well lit', sample: true });
  });

  it('every card string passes the banned-word check', () => {
    const texts = [
      STRINGS.report.heading.text, STRINGS.report.tapPrompt.text, STRINGS.report.noStreetThere.text,
      STRINGS.report.actuallyLit.text, STRINGS.report.actuallyDark.text, STRINGS.report.lightIsOut.text,
      STRINGS.report.yourNote.text, STRINGS.darkSpots.heading.text, STRINGS.darkSpots.export.text,
      STRINGS.darkSpots.csvFile.text, STRINGS.empty.noReports.text, STRINGS.errors.correctionsStore.text,
      buildSegmentCard(s, 'typical', [], today).tierText,
    ];
    for (const t of texts) expect(findBanned(t), t).toEqual([]);
  });
});

describe('segment tap layers', () => {
  it('lists the street-line layers only: 2 static plus 27 flicker cohorts', () => {
    const ids = segmentLayerIds();
    expect(ids).toHaveLength(29);
    expect(ids.filter((i) => i.startsWith('gloam-static-'))).toHaveLength(2);
    expect(ids.filter((i) => i.startsWith('gloam-flicker-'))).toHaveLength(27);
    expect(ids.some((i) => /glow|fog|marker|route|note/.test(i))).toBe(false);
  });
});
