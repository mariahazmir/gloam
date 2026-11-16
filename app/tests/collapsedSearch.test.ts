import { describe, expect, it } from 'vitest';
// Vitest returns empty text for ?raw CSS, so the files are read with node:fs (imported by a computed name, as the app has no node types).
const fs = (await import('node:' + 'fs')) as { readFileSync(url: URL, enc: 'utf8'): string };
const css = fs.readFileSync(new URL('../src/ui/base.css', import.meta.url), 'utf8');
const src = fs.readFileSync(new URL('../src/ui/mapSheet.ts', import.meta.url), 'utf8');

// Requirement 18.9: the collapsed bar keeps "Search streets", smaller, at least 44 px high.
// No DOM here, so these read the source and the stylesheet as text.

describe('collapsed bar and "Search streets"', () => {
  it('the control carries sheet-search and sheet-keep and a 44 px min-height', () => {
    expect(src).toContain("className: 'sheet-search sheet-keep'");
    expect(src).toContain("style.minHeight = '44px'");
  });

  it('the collapsed rule keeps the control smaller but never under 44 px', () => {
    const rule = /\.sheet\.collapsed \.sheet-body > \.sheet-search \{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/min-height:\s*44px/);
    expect(rule![1]).toMatch(/font-size:\s*0\.9rem/);
    expect(css).toMatch(/\.sheet\.collapsed \.sheet-body > \*\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.sheet\.collapsed \.sheet-body > \.sheet-keep,/);
  });
});
