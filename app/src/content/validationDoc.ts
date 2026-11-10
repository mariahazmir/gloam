// Pure parsing of the validation write-up. The caller passes the text
// (imported with ?raw). Figures stay as the original strings.

export interface ValidationFigure {
  city: string;
  kind: string;
  model: string;
  baseline: string;
}

export interface SkippedCity {
  city: string;
  reason: string;
}

export type ValidationResult =
  | { status: "unavailable" }
  | {
      status: "ok";
      figures: ValidationFigure[];
      didNotBeat: string[];
      skipped: SkippedCity[];
    };

const MODEL_COL = "model";
const BASELINE_COL = "highway-footway-rate baseline";

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseValidation(text: string): ValidationResult {
  const lines = text.split(/\r?\n/);
  const figures: ValidationFigure[] = [];
  const skipped: SkippedCity[] = [];
  let section: { city: string; kind: string } | null = null;
  let cols: { model: number; baseline: number } | null = null;
  let inSkipped = false;

  for (const line of lines) {
    const h3 = /^###\s+(.+?):\s*(.+?)\s*$/.exec(line);
    if (h3) {
      section = { city: h3[1] ?? "", kind: h3[2] ?? "" };
      cols = null;
      inSkipped = false;
      continue;
    }
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2 && !line.startsWith("###")) {
      section = null;
      cols = null;
      inSkipped = (h2[1] ?? "").toLowerCase() === "skipped";
      continue;
    }
    if (inSkipped) {
      const m = /^-\s+City\s+(\S+?):\s*(hold-out validation skipped.*)$/.exec(line);
      if (m) skipped.push({ city: m[1] ?? "", reason: m[2] ?? "" });
      continue;
    }
    if (!section || !line.trim().startsWith("|")) continue;
    const row = cells(line);
    if (!cols) {
      const lower = row.map((c) => c.toLowerCase());
      const model = lower.indexOf(MODEL_COL);
      const baseline = lower.indexOf(BASELINE_COL);
      if (model >= 0 && baseline >= 0) cols = { model, baseline };
      continue;
    }
    const model = row[cols.model];
    const baseline = row[cols.baseline];
    if (row[0] === "AUC" && model !== undefined && baseline !== undefined) {
      figures.push({ city: section.city, kind: section.kind, model, baseline });
    }
  }

  if (figures.length === 0) return { status: "unavailable" };

  const didNotBeat: string[] = [];
  for (const f of figures) {
    const m = Number(f.model);
    const b = Number(f.baseline);
    if (Number.isFinite(m) && Number.isFinite(b) && m < b && !didNotBeat.includes(f.city)) {
      didNotBeat.push(f.city);
    }
  }
  return { status: "ok", figures, didNotBeat, skipped };
}
