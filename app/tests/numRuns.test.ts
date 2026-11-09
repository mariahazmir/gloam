import { describe, expect, it } from "vitest";
import fc from "fast-check";

describe("property test configuration", () => {
  it("configures at least 100 runs globally", () => {
    const { numRuns } = fc.readConfigureGlobal();
    expect(numRuns).toBeDefined();
    expect(numRuns as number).toBeGreaterThanOrEqual(100);
  });

  it("reports the seed and counterexample on failure (Requirement 16.19)", () => {
    let message = "";
    try {
      fc.assert(fc.property(fc.integer({ min: 0, max: 1000 }), (n) => n < 0));
    } catch (e) {
      message = String(e);
    }
    expect(message).toContain("seed");
    expect(message).toContain("Counterexample");
  });
});
