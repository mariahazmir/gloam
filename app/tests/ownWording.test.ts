// @vitest-environment node
// Example tests for Requirement 18.11: the screens take only layout and styling from the design
// reference. No catalogue string is copied from reference.html, and no text in app/src says
// "likely busier" or "likely lit". Files are read through Vite raw imports, so no Node types are needed.
import { describe, expect, it } from "vitest";
import { STRINGS } from "../src/content/strings";

const SOURCES = import.meta.glob("../src/**/*.{ts,css}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
// Empty when reference.html is not in the checkout; that test is then skipped.
const REFERENCE = Object.values(
  import.meta.glob("../../reference.html", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
)[0];

/**
 * Wording fixed elsewhere, so matching the reference is expected: data source and licence names
 * (18.11), the product name and the How_Gloam_Guesses_Screen name (Glossary, Requirement 12), the
 * minute unit (6.7), the SAMPLE DATA label and the allowed lighting phrases (product rules), the
 * report types (10.1) and the Demo_Mode name (14.1).
 */
const REQUIRED = new Set([
  "© openstreetmap contributors",
  "gloam",
  "how gloam guesses",
  "min",
  "sample data",
  "likely well lit",
  "likely dark",
  "actually lit",
  "actually dark",
  "demo mode",
]);

const norm = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().toLowerCase();

async function gunzip(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Every visible text node and aria-label in the reference's five screens and style sheet. */
async function referenceTexts(html: string): Promise<Set<string>> {
  const json = (src: string, type: string): unknown =>
    JSON.parse(new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`).exec(src)![1]!);
  const manifest = json(html, "manifest") as Record<string, { data: string; compressed: boolean }>;
  const out = new Set<string>();
  for (const id of json(html, "page_order") as string[]) {
    const entry = manifest[id]!;
    const page = entry.compressed ? await gunzip(entry.data) : atob(entry.data);
    const body = (json(page, "template") as string)
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<script[\s\S]*?<\/script>/g, "");
    for (const piece of body.split(/<[^>]+>/)) if (norm(piece).length > 1) out.add(norm(piece));
    for (const m of body.matchAll(/aria-label="([^"]+)"/g)) out.add(norm(m[1]!));
  }
  return out;
}

/** Every fixed catalogue string, with its path. */
function catalogue(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as Record<string, unknown>;
    if (typeof n.kind === "string" && typeof n.text === "string") out.push({ path, text: n.text });
    else if (typeof n.kind !== "string") for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
  };
  walk(STRINGS, "STRINGS");
  // Templates with sample arguments (Requirement 19: search strings).
  for (const n of [0, 1, 8]) out.push({ path: `STRINGS.search.count(${n})`, text: STRINGS.search.count.text(n) });
  for (const [r, d] of [[null, "north"], ["600 m", "north-east"], ["1.2 km", "south"]] as const)
    out.push({ path: `STRINGS.templates.searchOffset(${r}, ${d})`, text: STRINGS.templates.searchOffset.text(r, d) });
  return out;
}

describe("Requirement 18.11: own wording", () => {
  it('no text in app/src contains "likely busier" or "likely lit"', () => {
    const files = Object.entries(SOURCES);
    expect(files.length).toBeGreaterThan(20);
    for (const [file, text] of files) {
      expect(text.toLowerCase().includes("likely busier"), file).toBe(false);
      expect(text.toLowerCase().includes("likely lit"), file).toBe(false);
    }
  });

  it("the field name strings are in the catalogue checked below, with kind general", () => {
    const paths = catalogue().map((e) => e.path);
    expect(paths).toContain("STRINGS.search.startLabel");
    expect(paths).toContain("STRINGS.search.endLabel");
    expect(STRINGS.search.startLabel.kind).toBe("general");
    expect(STRINGS.search.endLabel.kind).toBe("general");
  });

  it("the compass words and the offset template appear only in content/strings.ts", () => {
    const compass = /(['"`])(north|north-east|east|south-east|south|south-west|west|north-west)\1/i;
    const template = /return\s+(['"`])at the map centre\1|`about \$\{/i;
    const others = Object.entries(SOURCES).filter(([file]) => !file.endsWith("/content/strings.ts"));
    expect(others.length).toBeGreaterThan(20);
    for (const [file, text] of others) {
      expect(compass.test(text), `${file} has a compass word literal`).toBe(false);
      expect(template.test(text), `${file} has the offset template`).toBe(false);
    }
    const own = SOURCES["../src/content/strings.ts"]!;
    expect(compass.test(own)).toBe(true);
    expect(template.test(own)).toBe(true);
  });

  it.skipIf(REFERENCE === undefined)("no catalogue string is copied from reference.html", async () => {
    const ref = await referenceTexts(REFERENCE!);
    expect(ref.size).toBeGreaterThan(50);
    const copied = catalogue()
      .filter(({ text }) => ref.has(norm(text)) && !REQUIRED.has(norm(text)))
      .map(({ path, text }) => `${path}: ${text}`);
    expect(copied).toEqual([]);
  });
});
