import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseValidation } from "../src/content/validationDoc";

// Feature: gloam-web-app, Property 26: Quoted validation figures equal the document's
// **Validates: Requirements 12.6, 12.9, 12.11**

const cityName = fc.stringMatching(/^[a-z]{2,8}$/);
const kindName = fc.constantFrom("walking paths", "vehicle roads");
const auc = fc.integer({ min: 0, max: 1000 }).map((n) => (n / 1000).toFixed(3));
// Four decimals never collide with AUC strings, so leaks are detectable.
const precision = fc.integer({ min: 1, max: 9999 }).map((n) => (n / 10000).toFixed(4));

const section = fc.record({
  city: cityName,
  kind: kindName,
  model: auc,
  baseline: auc,
  prec: precision,
});

const skippedEntry = fc.record({
  city: cityName,
  n: fc.integer({ min: 0, max: 199 }),
});

function render(
  sections: { city: string; kind: string; model: string; baseline: string; prec: string }[],
  skipped: { city: string; n: number }[],
): { text: string; reasons: string[] } {
  const reasons = skipped.map(
    (s) => `hold-out validation skipped, ${s.n} \`tagged_unlit\` segments, threshold 200.`,
  );
  const lines: string[] = ["# Validation", "", "## Skipped", ""];
  skipped.forEach((s, i) => lines.push(`- City ${s.city}: ${reasons[i]}`));
  lines.push("", "## Hold-one-out metrics", "");
  for (const s of sections) {
    lines.push(
      `### ${s.city}: ${s.kind}`,
      "",
      "| Metric | Model | Rule baseline | Highway-rate baseline | Highway-footway-rate baseline |",
      "|---|---|---|---|---|",
      `| AUC | ${s.model} | 0.500 | 0.505 | ${s.baseline} |`,
      `| Precision at 0.5 | ${s.prec} | undefined | ${s.prec} | ${s.prec} |`,
      "",
    );
  }
  lines.push("## Ground truth", "", "Not run: no ground-truth file was provided.");
  return { text: lines.join("\n"), reasons };
}

describe("Property 26: quoted validation figures equal the document's", () => {
  it("returns figures verbatim, correct did-not-beat list, no precision, skipped reasons", () => {
    fc.assert(
      fc.property(
        fc.array(section, { minLength: 1, maxLength: 6 }),
        fc.array(skippedEntry, { maxLength: 4 }),
        (sections, skipped) => {
          const { text, reasons } = render(sections, skipped);
          const result = parseValidation(text);
          expect(result.status).toBe("ok");
          if (result.status !== "ok") return;

          expect(result.figures).toEqual(
            sections.map((s) => ({
              city: s.city,
              kind: s.kind,
              model: s.model,
              baseline: s.baseline,
            })),
          );

          const expected: string[] = [];
          for (const s of sections) {
            if (Number(s.model) < Number(s.baseline) && !expected.includes(s.city)) {
              expected.push(s.city);
            }
          }
          expect(result.didNotBeat).toEqual(expected);

          const json = JSON.stringify(result);
          for (const s of sections) expect(json).not.toContain(s.prec);

          expect(result.skipped).toEqual(
            skipped.map((s, i) => ({ city: s.city, reason: reasons[i] })),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("gives unavailable when the text has no tables", () => {
    fc.assert(
      fc.property(
        fc.array(skippedEntry, { maxLength: 4 }),
        fc.array(fc.stringMatching(/^[A-Za-z ,.]{0,30}$/), { maxLength: 5 }),
        (skipped, prose) => {
          const lines = ["# Validation", "", ...prose, "## Skipped", ""];
          skipped.forEach((s) =>
            lines.push(`- City ${s.city}: hold-out validation skipped, ${s.n} segments.`),
          );
          expect(parseValidation(lines.join("\n"))).toEqual({ status: "unavailable" });
        },
      ),
      { numRuns: 100 },
    );
  });
});
