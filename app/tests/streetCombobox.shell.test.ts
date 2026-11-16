import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/content/strings';
import type { StreetIndex, StretchEntry } from '../src/search/streetSearch';
import { createStreetCombobox, OPTION_MIN_HEIGHT_PX, type StreetComboboxOptions } from '../src/ui/streetCombobox';

// Requirements 19.1, 19.7, 19.8. No DOM: a minimal fake element set is passed as `doc`.

class FakeEl {
  tag: string;
  className = '';
  id = '';
  value = '';
  disabled = false;
  hidden = false;
  textContent = '';
  style: Record<string, string> = {};
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  listeners = new Map<string, Array<(e: unknown) => void>>();
  focused = false;
  constructor(tag: string) {
    this.tag = tag;
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  append(...nodes: FakeEl[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: FakeEl[]): void {
    this.children = [...nodes];
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  focus(): void {
    this.focused = true;
  }
  fire(type: string, e: Record<string, unknown> = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ preventDefault: () => undefined, ...e });
  }
  attr(k: string): string | undefined {
    return this.attrs.get(k);
  }
}

const fakeDoc = { createElement: (tag: string) => new FakeEl(tag) } as unknown as Document;

function entry(name: string, lon: number): StretchEntry {
  const norm = name.toLowerCase();
  return { key: name, name, norm, segmentIds: [name], tokens: norm.split(' '), lon, lat: 3.1 };
}
const INDEX: StreetIndex = { entries: [entry('Jalan Alor', 101.71), entry('Jalan Ampang', 101.72)] };

function build(extra: Partial<StreetComboboxOptions> = {}) {
  const chosen: string[] = [];
  const combo = createStreetCombobox(
    {
      kind: 'start',
      getCentre: () => ({ lon: 101.7, lat: 3.1 }),
      getIndex: () => INDEX,
      onChoose: (r) => chosen.push(r.name),
      ...extra,
    },
    fakeDoc,
  );
  const input = combo.input as unknown as FakeEl;
  const root = combo.root as unknown as FakeEl;
  const [, listbox, , , unavailable, status] = root.children as [FakeEl, FakeEl, FakeEl, FakeEl, FakeEl, FakeEl];
  const type = (q: string): void => {
    input.value = q;
    input.fire('input');
  };
  const key = (k: string): void => input.fire('keydown', { key: k });
  return { combo, input, listbox, unavailable, status, chosen, type, key };
}

describe('streetCombobox shell (no DOM)', () => {
  it('sets static roles and starts collapsed', () => {
    const { input, listbox } = build();
    expect(input.attr('role')).toBe('combobox');
    expect(input.attr('aria-autocomplete')).toBe('list');
    expect(input.attr('aria-controls')).toBe(listbox.id);
    expect(listbox.attr('role')).toBe('listbox');
    expect(input.attr('aria-expanded')).toBe('false');
    expect(input.attr('aria-activedescendant')).toBeUndefined();
    expect(listbox.hidden).toBe(true);
  });

  it('names each input by its purpose', () => {
    expect(build().input.attr('aria-label')).toBe(STRINGS.search.startLabel.text);
    expect(build({ kind: 'end' }).input.attr('aria-label')).toBe(STRINGS.search.endLabel.text);
    expect(STRINGS.search.startLabel.text).toBe('Start street');
    expect(STRINGS.search.endLabel.text).toBe('End street');
  });

  it('ARIA attributes follow ComboState while typing and arrowing', () => {
    const { input, listbox, status, type, key } = build();
    type('jalan');
    expect(input.attr('aria-expanded')).toBe('true');
    expect(listbox.hidden).toBe(false);
    expect(listbox.children).toHaveLength(2);
    expect(listbox.children.every((li) => li.attr('role') === 'option')).toBe(true);
    expect(listbox.children.every((li) => li.attr('aria-selected') === 'false')).toBe(true);
    expect(input.attr('aria-activedescendant')).toBeUndefined();
    expect(status.textContent).toBe(STRINGS.search.count.text(2));

    key('ArrowDown');
    expect(input.attr('aria-activedescendant')).toBe(listbox.children[0]!.id);
    expect(listbox.children[0]!.attr('aria-selected')).toBe('true');
    expect(listbox.children[1]!.attr('aria-selected')).toBe('false');

    key('ArrowDown');
    expect(input.attr('aria-activedescendant')).toBe(listbox.children[1]!.id);
    expect(listbox.children[0]!.attr('aria-selected')).toBe('false');
    expect(listbox.children[1]!.attr('aria-selected')).toBe('true');

    key('Escape');
    expect(input.attr('aria-expanded')).toBe('false');
    expect(input.attr('aria-activedescendant')).toBeUndefined();
    expect(listbox.hidden).toBe(true);
  });

  it('Enter chooses the active option, fills the input and closes', () => {
    const { input, chosen, type, key } = build();
    type('jalan');
    key('ArrowDown');
    key('Enter');
    expect(chosen).toHaveLength(1);
    expect(input.value).toBe(chosen[0]);
    expect(input.attr('aria-expanded')).toBe('false');
  });

  it('every option has min-height of at least 44 px', () => {
    const { listbox, type } = build();
    type('jalan');
    expect(OPTION_MIN_HEIGHT_PX).toBeGreaterThanOrEqual(44);
    for (const li of listbox.children) {
      expect(parseFloat(li.style['minHeight'] ?? '0')).toBeGreaterThanOrEqual(44);
    }
  });

  it('announces short and no-match queries', () => {
    const { status, type } = build();
    type('j');
    expect(status.textContent).toBe(STRINGS.search.shortQuery.text);
    type('zzzz');
    expect(status.textContent).toBe(STRINGS.search.noMatch.text);
  });

  it('reset clears the input value, results and list, and keeps availability', () => {
    const { combo, input, listbox, status, type } = build();
    type('jalan');
    combo.reset();
    expect(input.value).toBe('');
    expect(listbox.children).toHaveLength(0);
    expect(input.attr('aria-expanded')).toBe('false');
    expect(input.attr('aria-activedescendant')).toBeUndefined();
    expect(input.disabled).toBe(false);
    expect(status.textContent).toBe('');
  });

  it('a City_Pack switch (availability change) clears input and results', () => {
    const { combo, input, listbox, type } = build();
    type('jalan');
    combo.setAvailability('loading');
    expect(input.value).toBe('');
    expect(listbox.children).toHaveLength(0);
    expect(input.attr('aria-expanded')).toBe('false');
    combo.setAvailability('ready');
    expect(input.value).toBe('');
    expect(listbox.children).toHaveLength(0);
    expect(input.disabled).toBe(false);
  });

  it.each([
    ['no-pack', STRINGS.search.unavailable.noPack.text],
    ['loading', STRINGS.search.unavailable.loading.text],
    ['indexing', STRINGS.search.unavailable.indexing.text],
  ] as const)('disabled state %s shows its message', (availability, text) => {
    const { input, unavailable } = build({ availability });
    expect(input.disabled).toBe(true);
    expect(input.attr('aria-disabled')).toBe('true');
    expect(unavailable.hidden).toBe(false);
    expect(unavailable.textContent).toBe(text);
    expect(input.attr('aria-describedby')).toContain(unavailable.id);
  });

  it('ready state hides the unavailable message and re-enables the input', () => {
    const { combo, input, unavailable } = build({ availability: 'no-pack' });
    combo.setAvailability('ready');
    expect(input.disabled).toBe(false);
    expect(input.attr('aria-disabled')).toBeUndefined();
    expect(unavailable.hidden).toBe(true);
    expect(unavailable.textContent).toBe('');
    expect(input.attr('aria-describedby')).not.toContain(unavailable.id);
  });

  it('switching between disabled states swaps the message', () => {
    const { combo, unavailable } = build({ availability: 'loading' });
    combo.setAvailability('indexing');
    expect(unavailable.textContent).toBe(STRINGS.search.unavailable.indexing.text);
  });
});
