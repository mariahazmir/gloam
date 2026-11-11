import { DISCLAIMER, STRINGS, tierLabel } from '../content/strings';
import { formatSigned } from '../routing/format';
import type { HeartbeatSeries } from '../routing/heartbeat';
import type { RouteComparison, RouteStats } from '../routing/summary';
import { TIER_ORDER } from '../routing/tierShares';
import { el } from './dom';
import { createHeartbeatChart } from './heartbeatChart';

// Route panel (Requirements 6.7, 6.9, 7.8, 7.9, 9.1 to 9.7): the Gloam_Route and the
// Shortest_Route side by side, signed differences, Tier shares, the Heartbeat_Chart and
// the Disclaimer. It is drawn from scratch on every change, which is well inside 1 s.
// With no route it holds nothing at all: no distance, time, Tier summary or Disclaimer.

export interface RoutePanelModel {
  comparison: RouteComparison;
  /** Heartbeat series of the Gloam_Route. */
  series: HeartbeatSeries;
}

export interface RoutePanel {
  /** Shows the model, or clears the panel with null. */
  show(model: RoutePanelModel | null): void;
}

const cell = (text: string, tag: 'td' | 'th' = 'td', scope?: string) =>
  el(tag, { text, attrs: scope ? { scope } : {} });

function row(label: string, g: string, s: string): HTMLTableRowElement {
  return el('tr', {}, cell(label, 'th', 'row'), cell(g), cell(s));
}

const minutesText = (n: number): string => `${n} ${STRINGS.route.unitMinutes.text}`;
const signedMetres = (n: number): string => `${formatSigned(n)} ${STRINGS.route.unitMetres.text}`;
const signedMinutes = (n: number): string => `${formatSigned(n)} ${STRINGS.route.unitMinutes.text}`;

function comparisonTable(g: RouteStats, s: RouteStats): HTMLTableElement {
  const head = el(
    'tr',
    {},
    el('td'),
    cell(STRINGS.route.gloamRoute.text, 'th', 'col'),
    cell(STRINGS.route.shortestRoute.text, 'th', 'col'),
  );
  const body = el('tbody', {});
  body.append(
    row(STRINGS.route.distance.text, g.distanceText, s.distanceText),
    row(STRINGS.route.walkingTime.text, minutesText(g.minutes), minutesText(s.minutes)),
  );
  body.append(
    el('tr', { className: 'group-row' }, el('th', { text: STRINGS.route.shares.text, attrs: { colspan: '3', scope: 'colgroup' } })),
  );
  for (const tier of TIER_ORDER) body.append(row(tierLabel(tier), `${g.shares[tier]}%`, `${s.shares[tier]}%`));
  return el('table', { className: 'route-table' }, el('thead', {}, head), body);
}

function differences(c: RouteComparison): HTMLElement {
  const item = (label: string, value: string) =>
    el('div', { className: 'delta-item' }, el('dt', { text: label }), el('dd', { text: value }));
  return el(
    'dl',
    { className: 'route-delta', attrs: { 'aria-label': STRINGS.route.difference.text } },
    item(STRINGS.route.extraDistance.text, signedMetres(c.delta.extraMeters)),
    item(STRINGS.route.extraTime.text, signedMinutes(c.delta.extraMinutes)),
    item(STRINGS.route.darkerChange.text, signedMetres(c.delta.darkerTierChangeM)),
  );
}

export function createRoutePanel(host: HTMLElement): RoutePanel {
  return {
    show(model) {
      if (model === null) {
        host.replaceChildren();
        return;
      }
      const { comparison } = model;
      host.replaceChildren(
        el(
          'section',
          { className: 'route-panel', attrs: { 'aria-label': STRINGS.route.panel.text } },
          el('h2', { className: 'route-headline', text: `${comparison.gloam.distanceText}, ${minutesText(comparison.gloam.minutes)}` }),
          comparisonTable(comparison.gloam, comparison.shortest),
          el('h3', { className: 'route-subhead', text: STRINGS.route.difference.text }),
          differences(comparison),
          createHeartbeatChart(model.series),
          el('p', { className: 'disclaimer', text: DISCLAIMER }),
        ),
      );
    },
  };
}
