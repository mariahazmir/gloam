// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { SCREENS, hashOf, screenFromHash, type Screen } from "../../src/state/screens";

// Feature: gloam-web-app, Property 35: Screen addresses round-trip

describe("Property 35: screen addresses", () => {
  /** **Validates: Requirement 18.1** */
  it("hashOf then screenFromHash returns the same screen", () => {
    fc.assert(
      fc.property(fc.constantFrom<Screen>(...SCREENS), (s) => {
        expect(screenFromHash(hashOf(s))).toBe(s);
      }),
    );
  });

  it("any string that is not a known address gives the Map_Screen", () => {
    const known = new Set<string>(SCREENS.filter((s) => s !== "map"));
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const name = raw.replace(/^#\/?/, "").split(/[?/]/)[0] ?? "";
        fc.pre(!known.has(name));
        expect(screenFromHash(raw)).toBe("map");
      }),
    );
  });

  it("examples: a trailing slash and a query are ignored; unknown, empty and bare hashes give the map", () => {
    expect(screenFromHash("#/route/")).toBe("route");
    expect(screenFromHash("#/route?x=1")).toBe("route");
    expect(screenFromHash("#/nonsense")).toBe("map");
    expect(screenFromHash("")).toBe("map");
    expect(screenFromHash("#")).toBe("map");
    expect(screenFromHash("#/map")).toBe("map");
    expect(hashOf("map")).toBe("#/");
  });
});
