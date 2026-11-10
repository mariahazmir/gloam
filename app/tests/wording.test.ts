// Example tests for wording (Requirements 12.1, 12.2, 12.6, 12.10, 12.11).
import { describe, expect, it } from "vitest";
import validationRaw from "../../docs/validation.md?raw";
import { DISCLAIMER, STRINGS, tierWording, confirmedBy } from "../src/content/strings";
import type { Str, Tpl } from "../src/content/strings";
import { parseValidation } from "../src/content/validationDoc";
import type { Tier } from "../src/types";
import { findBanned } from "./helpers/bannedWords";

const TIERS: Tier[] = ["confirmed_lit", "mapped_unlit", "brighter_than_most", "typical", "darker_than_most"];
const CONFIDENCES = [0, 0.05, 0.2, 0.5, 0.62, 0.99, 1];
const COUNTS = [1, 2, 7, 120];

interface Entry {
  path: string;
  kind: "lighting" | "general";
  text: string;
}

/** Every catalogue string, templates expanded with sample arguments. */
function collect(): Entry[] {
  const out: Entry[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as Record<string, unknown>;
    if (typeof n.kind === "string" && typeof n.text === "string") {
      out.push({ path, kind: n.kind as Entry["kind"], text: n.text });
      return;
    }
    if (typeof n.kind === "string" && typeof n.text === "function") {
      const t = n as unknown as Tpl<never[]>;
      const f = t.text as unknown as (...a: unknown[]) => string;
      if (path.endsWith("tierWording")) {
        for (const tier of TIERS)
          for (const c of CONFIDENCES)
            out.push({ path: `${path}(${tier}, ${c})`, kind: t.kind, text: f(tier, c) });
      } else if (path.endsWith("confirmedBy")) {
        for (const c of COUNTS) out.push({ path: `${path}(${c})`, kind: t.kind, text: f(c) });
      } else {
        throw new Error(`${path}: template has no sample arguments in wording.test.ts`);
      }
      return;
    }
    for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
  };
  walk(STRINGS, "STRINGS");
  return out;
}

function expectNoBanned(path: string, text: string): void {
  const found = findBanned(text);
  expect(found, `banned wording ${JSON.stringify(found)} in ${path}: ${JSON.stringify(text)}`).toEqual([]);
}

// Phrases a lighting string may use. Anything else with a bare "lit", "unlit" or "dark" is a claim.
const ALLOWED_PHRASES = [
  "likely well lit",
  "likely dark",
  "better lit",
  "confirmed lit",
  "mapped as unlit",
  "brighter than most streets here",
  "darker than most streets here",
];
const ALLOWED_TERMS = ["estimated", "confirmed by", "unknown", ...ALLOWED_PHRASES];

function lightingProblems(text: string): string[] {
  const lower = text.toLowerCase();
  let rest = lower;
  for (const p of ALLOWED_PHRASES) rest = rest.split(p).join(" ");
  const problems: string[] = [];
  const bare = rest.match(/\b(lit|unlit|dark|well)\b/g);
  if (bare) problems.push(`claim outside allowed wording: ${bare.join(", ")}`);
  if (!ALLOWED_TERMS.some((t) => lower.includes(t))) problems.push("uses none of the allowed terms");
  return problems;
}

describe("wording: banned words", () => {
  const entries = collect();

  it("walks a non-trivial catalogue", () => {
    expect(entries.length).toBeGreaterThan(30);
    expect(entries.some((e) => e.path.startsWith("STRINGS.templates.tierWording("))).toBe(true);
  });

  it("no catalogue entry contains a banned word", () => {
    for (const e of entries) expectNoBanned(e.path, e.text);
  });

  it("the Disclaimer and docs/validation.md contain no banned word", () => {
    expectNoBanned("DISCLAIMER", DISCLAIMER);
    expectNoBanned("docs/validation.md", validationRaw);
  });

  it("failure report names the string and the entry path", () => {
    expect(() => expectNoBanned("STRINGS.x.y", "the safest way")).toThrowError(/STRINGS\.x\.y.*the safest way/s);
  });
});

describe("wording: lighting terms", () => {
  const entries = collect();

  it("lighting entries use only the allowed lighting wording", () => {
    for (const e of entries.filter((x) => x.kind === "lighting")) {
      // Descriptions of the data (not a claim about a street) are checked by phrase, not by term presence.
      const problems = lightingProblems(e.text).filter(
        (p) => !(p === "uses none of the allowed terms" && e.path === "STRINGS.city.kualaLumpurDescription"),
      );
      expect(problems, `${e.path}: ${JSON.stringify(e.text)}`).toEqual([]);
    }
  });

  it("every tier wording at every confidence is estimate or OSM-sourced wording with no cut-off claim", () => {
    for (const tier of TIERS) {
      for (const c of CONFIDENCES) {
        const t = tierWording(tier, c);
        if (tier === "confirmed_lit") expect(t).toBe("confirmed lit in OpenStreetMap");
        else if (tier === "mapped_unlit") expect(t).toBe("mapped as unlit");
        else {
          expect(t, `${tier} @ ${c}`).toMatch(/^estimated: /);
          expect(t).toContain(`(confidence ${Math.round(c * 100)}%)`);
        }
        expect(t).not.toMatch(/0\.5|50%\s*(cut|threshold)/i);
      }
    }
    expect(tierWording("brighter_than_most", 0.5)).toContain("brighter than most streets here");
    expect(tierWording("darker_than_most", 0.5)).toContain("darker than most streets here");
  });

  it("confirmedBy reads 'confirmed by N people'", () => {
    expect(confirmedBy(1)).toBe("confirmed by 1 person");
    expect(confirmedBy(3)).toBe("confirmed by 3 people");
  });

  it("the unknown label is 'unknown'", () => {
    expect(STRINGS.labels.unknown.text).toBe("unknown");
  });
});

describe("wording: fixed texts", () => {
  it("legend lines are at most 80 characters", () => {
    for (const [k, v] of Object.entries(STRINGS.legend) as [string, Str][]) {
      expect(v.text.length, `STRINGS.legend.${k}: ${v.text}`).toBeLessThanOrEqual(80);
    }
  });

  it("DISCLAIMER is verbatim", () => {
    expect(DISCLAIMER).toBe(
      "Gloam estimates which streets are likely well lit from map data. Estimates can be wrong, and Gloam can't tell you whether a route is safe. Trust your surroundings.",
    );
  });

  it("Kuala Lumpur description is exact", () => {
    expect(STRINGS.city.kualaLumpurDescription.text).toBe("the case where lighting records are missing");
  });
});

describe("wording: docs/validation.md", () => {
  const parsed = parseValidation(validationRaw);

  /** Independent reading of the AUC rows: city -> [model, baseline]. */
  function independentAuc(): Map<string, [string, string]> {
    const out = new Map<string, [string, string]>();
    let city = "";
    for (const line of validationRaw.split(/\r?\n/)) {
      const h = /^###\s+([^:]+):/.exec(line);
      if (h) city = (h[1] ?? "").trim();
      else if (/^##\s/.test(line)) city = "";
      const cells = line.split("|").map((c) => c.trim());
      if (city && cells[1] === "AUC") out.set(city, [cells[2] ?? "", cells[5] ?? ""]);
    }
    return out;
  }

  it("parses as ok", () => {
    expect(parsed.status).toBe("ok");
  });

  it("quoted figures equal what the document writes", () => {
    if (parsed.status !== "ok") throw new Error("validation unavailable");
    const indep = independentAuc();
    expect(parsed.figures.map((f) => f.city).sort()).toEqual([...indep.keys()].sort());
    for (const f of parsed.figures) {
      const [m, b] = indep.get(f.city) ?? ["", ""];
      expect(f.model, `${f.city} model`).toBe(m);
      expect(f.baseline, `${f.city} baseline`).toBe(b);
      // The prose bullet for the city (if any) quotes the same two numbers.
      const bullet = validationRaw
        .split(/\r?\n/)
        .find((l) => l.startsWith("- The model did not beat") && l.includes(` for ${f.city},`));
      if (bullet) {
        expect(bullet).toContain(`model AUC ${f.model}`);
        expect(bullet).toContain(`baseline AUC ${f.baseline}`);
      }
    }
  });

  it("did-not-beat cities match an independent computation and the document's bullets", () => {
    if (parsed.status !== "ok") throw new Error("validation unavailable");
    const expected = [...independentAuc()]
      .filter(([, [m, b]]) => Number(m) < Number(b))
      .map(([c]) => c)
      .sort();
    expect([...parsed.didNotBeat].sort()).toEqual(expected);
    const fromBullets = validationRaw
      .split(/\r?\n/)
      .map((l) => /^- The model did not beat .* for ([^,]+),/.exec(l)?.[1])
      .filter((c): c is string => c !== undefined)
      .sort();
    expect(fromBullets).toEqual(expected);
  });

  it("skipped cities are those the document lists", () => {
    if (parsed.status !== "ok") throw new Error("validation unavailable");
    const listed = validationRaw
      .split(/\r?\n/)
      .map((l) => /^- City (\S+?): hold-out validation skipped/.exec(l)?.[1])
      .filter((c): c is string => c !== undefined);
    expect(parsed.skipped.map((s) => s.city)).toEqual(listed);
  });
});
