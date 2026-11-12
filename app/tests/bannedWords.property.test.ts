import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { BANNED, findBanned } from "./helpers/bannedWords";

// Feature: gloam-web-app, Property 25: The banned-word matcher finds whole words and phrases only
// **Validates: Requirements 12.1, 16.15**

const SEP_CHARS = [..." ,.;:!?-_/()[]\"'\n\t"];
const separator = fc
  .array(fc.constantFrom(...SEP_CHARS), { minLength: 1, maxLength: 4 })
  .map((a) => a.join(""));

const filler = fc
  .array(
    fc.constantFrom("lit", "street", "walk", "lamp", "estimated", "dim", "bus", "stop", "42"),
    { maxLength: 5 },
  )
  .map((a) => a.join(" "));

const entry = fc.constantFrom(...BANNED);
const caseMask = fc.array(fc.boolean(), { minLength: 40, maxLength: 40 });

function recase(s: string, mask: boolean[]): string {
  return [...s].map((c, i) => (mask[i % mask.length] ? c.toUpperCase() : c.toLowerCase())).join("");
}

/** Rebuilds an entry with arbitrary separators between its words. */
function withSeparators(e: string, seps: string[]): string {
  return e
    .split(" ")
    .map((w, i, arr) => (i < arr.length - 1 ? w + seps[i % seps.length] : w))
    .join("");
}

const seps = fc.array(separator, { minLength: 1, maxLength: 3 });

describe("Property 25: banned-word matcher", () => {
  it("finds an entry as whole tokens in any case, with any separators and surrounding text", () => {
    fc.assert(
      fc.property(entry, caseMask, seps, filler, separator, filler, separator, (e, mask, s, pre, sepA, post, sepB) => {
        const body = recase(withSeparators(e, s), mask);
        const text = `${pre}${sepA}${body}${sepB}${post}`;
        expect(findBanned(text)).toContain(e);
      }),
      { numRuns: 200 },
    );
  });

  it("does not find an entry that sits inside a longer word", () => {
    const letters = fc
      .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), { minLength: 1, maxLength: 3 })
      .map((a) => a.join(""));
    fc.assert(
      fc.property(entry, letters, letters, fc.constantFrom("prefix", "suffix", "both"), filler, separator, (e, p, q, where, pre, sep) => {
        const body = `${where === "suffix" ? "" : p}${e}${where === "prefix" ? "" : q}`;
        const text = `${pre}${sep}${body}${sep}${pre}`;
        // Only the targeted entry is checked; its own text never forms a whole-token match.
        expect(findBanned(text)).not.toContain(e);
      }),
      { numRuns: 200 },
    );
  });

  it("returns nothing for text without banned entries", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(filler, separator), { maxLength: 4 }), (parts) => {
        const text = parts.map(([f, s]) => f + s).join("");
        expect(findBanned(text)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("matches the examples from the spec wording", () => {
    expect(findBanned("insecure")).toEqual([]);
    expect(findBanned("securely")).toEqual([]);
    expect(findBanned("safestX")).toEqual([]);
    expect(findBanned("A SAFE-ROUTE!")).toEqual(["safe route"]);
  });
});
