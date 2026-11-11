import { STRINGS } from '../content/strings';
import { describeHeartbeat } from '../routing/heartbeat';
import type { HeartbeatSeries } from '../routing/heartbeat';
import { formatDistance } from '../routing/format';
import { GLASS, PALETTE } from '../visual/palette';
import { el } from './dom';

// Heartbeat_Chart (Requirements 9.1 to 9.7): distance along the route on the horizontal
// axis, Dread from 0 to 1 on the vertical axis, a higher Dread plotted higher. Colours come
// from visual/palette.ts. Low-confidence stretches get a dashed band and a diamond, so they
// differ from the line by shape as well as colour. The chart itself is static; the only
// animation is a CSS pulse in base.css that is off in Reduced_Effects_Mode.

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 150;
const LEFT = 34;
const RIGHT = 10;
const TOP = 12;
const BOTTOM = 34;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number>>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

interface Stretch {
  from: number;
  to: number;
}

/** Adjacent low-confidence pieces merged into one stretch. */
export function lowConfidenceStretches(series: HeartbeatSeries): Stretch[] {
  const out: Stretch[] = [];
  for (const s of series.segments) {
    if (!s.lowConfidence) continue;
    const last = out[out.length - 1];
    if (last && last.to === s.x0) last.to = s.x1;
    else out.push({ from: s.x0, to: s.x1 });
  }
  return out;
}

/** The chart, its marker key and the screen-reader summary, as one figure. */
export function createHeartbeatChart(series: HeartbeatSeries): HTMLElement {
  const total = series.totalM > 0 ? series.totalM : 1;
  const x = (m: number): number => LEFT + (m / total) * PLOT_W;
  const y = (d: number): number => TOP + (1 - d) * PLOT_H;
  const base = y(0);

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'heartbeat-svg',
    role: 'img',
    'aria-label': STRINGS.chart.title.text,
    focusable: 'false',
  });

  // Low-confidence markers go under the line: a dashed band plus a diamond.
  const stretches = lowConfidenceStretches(series);
  for (const s of stretches) {
    const x0 = x(s.from);
    const width = Math.max(x(s.to) - x0, 2);
    root.append(
      svg('rect', {
        x: x0,
        y: TOP,
        width,
        height: PLOT_H,
        fill: PALETTE.glow,
        'fill-opacity': 0.18,
        stroke: PALETTE.glow,
        'stroke-width': 1,
        'stroke-dasharray': '3 2',
        class: 'heartbeat-low',
      }),
    );
    const cx = x0 + width / 2;
    const cy = TOP + 7;
    root.append(
      svg('polygon', {
        points: `${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`,
        fill: PALETTE.glow,
        stroke: 'white',
        'stroke-width': 1,
        class: 'heartbeat-low-marker',
      }),
    );
  }

  // Axes.
  root.append(
    svg('line', { x1: LEFT, y1: TOP, x2: LEFT, y2: base, stroke: GLASS.border, 'stroke-width': 1 }),
    svg('line', { x1: LEFT, y1: base, x2: W - RIGHT, y2: base, stroke: GLASS.border, 'stroke-width': 1 }),
  );
  const label = (text: string, ax: number, ay: number, anchor: string): SVGElement =>
    svg('text', { x: ax, y: ay, fill: 'white', 'font-size': 9, 'text-anchor': anchor }, text);
  root.append(
    label('1', LEFT - 4, TOP + 3, 'end'),
    label('0', LEFT - 4, base + 3, 'end'),
    label(formatDistance(0), LEFT, base + 12, 'start'),
    label(formatDistance(series.totalM), W - RIGHT, base + 12, 'end'),
    label(STRINGS.chart.xAxis.text, LEFT + PLOT_W / 2, H - 4, 'middle'),
    label(STRINGS.chart.yAxis.text, LEFT, TOP - 3, 'start'),
  );

  // The dread line: one step per route piece, and a soft fill beneath it.
  const first = series.segments[0];
  if (first) {
    let d = `M ${x(first.x0)} ${y(first.y)}`;
    for (const [i, s] of series.segments.entries()) {
      if (i > 0) d += ` V ${y(s.y)}`;
      d += ` H ${x(s.x1)}`;
    }
    root.append(
      svg('path', {
        d: `${d} V ${base} H ${x(first.x0)} Z`,
        fill: PALETTE.dusk,
        'fill-opacity': 0.35,
        stroke: 'none',
      }),
      svg('path', {
        d,
        fill: 'none',
        stroke: PALETTE.lantern,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        class: 'heartbeat-line',
      }),
    );
  }

  const summaryId = 'heartbeat-summary';
  root.setAttribute('aria-describedby', summaryId);
  const figure = el('figure', { className: 'heartbeat' }, el('figcaption', { className: 'heartbeat-title', text: STRINGS.chart.title.text }), root);
  if (stretches.length > 0) figure.append(el('p', { className: 'heartbeat-key', text: STRINGS.chart.lowConfidenceKey.text }));
  // Screen-reader summary: always in the page, hidden from sight only.
  figure.append(
    el('p', { className: 'sr-only', text: describeHeartbeat(series), attrs: { id: summaryId } }),
  );
  return figure;
}
