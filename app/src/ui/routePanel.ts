import { DISCLAIMER, STRINGS, tierLabel, tierWording } from '../content/strings';
import { formatSigned } from '../routing/format';
import type { HeartbeatSeries } from '../routing/heartbeat';
import { estimatedCount, isEstimatedTier, wholeMetres, type Stretch } from '../routing/stretches';
import type { RouteComparison, RouteStats } from '../routing/summary';
import { TIER_ORDER } from '../routing/tierShares';
import { hashOf } from '../state/screens';
import type { Tier } from '../types';
import { el } from './dom';
import { createHeartbeatChart } from './heartbeatChart';

// Route views (Requirements 6.7, 6.9, 7.8, 7.9, 9.1 to 9.7, 17.7, 18.2, 18.3, 18.6).
// The Map_Screen sheet gets the route card, two tiles, a compact Heartbeat_Chart, the
// "see route details" link and the Disclaimer. The Route_Screen gets the full chart, the
// street stretches, the side-by-side comparison and the Disclaimer. Everything is drawn from
// scratch on every change, which is well inside 1 s. With no route the sheet holds no
// distance, time, Tier summary or Disclaimer.

export interface RoutePanelModel {
  comparison: RouteComparison;
  /** Heartbeat series of the Gloam_Route. */
  series: HeartbeatSeries;
  /** The Gloam_Route's streets, in walking order. */
  stretches: ReadonlyArray<Stretch>;
}

export interface RoutePanelHosts {
  /** Map_Screen sheet: route card, tiles and compact chart. */
  summary: HTMLElement;
  /** Map_Screen sheet, after the controls: the details link and the Disclaimer. */
  footer: HTMLElement;
  /** The Route_Screen content, above the routing settings. */
  page: HTMLElement;
  /** The Route_Screen footer, under the routing settings: the report link and the Disclaimer. */
  pageFooter: HTMLElement;
}

export interface RoutePanel {
  /** Shows the model, or clears the route views with null. */
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

/** The lantern card: walking time as the big figure, distance and extra minutes beside it. */
function routeCard(c: RouteComparison): HTMLElement {
  return el(
    'div',
    { className: 'route-card' },
    el(
      'div',
      {},
      el('div', { className: 'route-card-label', text: STRINGS.screens.cardLabel.text }),
      el(
        'div',
        { className: 'route-card-figure' },
        el('span', { className: 'route-card-minutes', text: String(c.gloam.minutes) }),
        el('span', { className: 'route-card-unit', text: STRINGS.route.unitMinutes.text }),
      ),
    ),
    el(
      'div',
      { className: 'route-card-side' },
      el('span', { text: c.gloam.distanceText }),
      el('span', { text: `${signedMinutes(c.delta.extraMinutes)} ${STRINGS.screens.vsShortest.text}` }),
    ),
  );
}

/** One figure and its label, as a row of the route-mix tile. */
function mixRow(value: string, label: string): HTMLElement {
  return el('div', { className: 'mix-row' }, el('span', { className: 'mix-value', text: value }), el('span', { className: 'mix-label', text: label }));
}

function badge(tier: Tier): HTMLElement {
  if (tier === 'confirmed_lit') return el('span', { className: 'badge badge-confirmed', text: STRINGS.screens.badgeConfirmed.text });
  if (tier === 'mapped_unlit') return el('span', { className: 'badge badge-unlit', text: STRINGS.screens.badgeUnlit.text });
  return el('span', { className: 'badge badge-estimated', text: STRINGS.screens.badgeEstimated.text });
}

/** One stretch row; the left marker's line pattern differs by Tier, so rows differ without colour (18.6). */
function stretchRow(s: Stretch, metres: number): HTMLElement {
  const wording = isEstimatedTier(s.tier) ? tierWording(s.tier, s.confidence) : tierLabel(s.tier);
  return el(
    'li',
    { className: 'stretch glass' },
    el('i', { className: `stretch-mark mark-${s.tier}`, attrs: { 'aria-hidden': 'true' } }),
    el(
      'div',
      { className: 'stretch-text' },
      el('div', { className: 'stretch-name', text: s.name ?? STRINGS.report.unnamed.text }),
      el('div', { className: 'stretch-detail', text: `${wording} · ${metres} ${STRINGS.route.unitMetres.text}` }),
    ),
    badge(s.tier),
  );
}

function link(screen: Parameters<typeof hashOf>[0], text: string, className: string): HTMLAnchorElement {
  return el('a', { className, text, attrs: { href: hashOf(screen) } });
}

export function createRoutePanel(hosts: RoutePanelHosts): RoutePanel {
  return {
    show(model) {
      if (model === null) {
        hosts.summary.replaceChildren();
        hosts.footer.replaceChildren();
        hosts.pageFooter.replaceChildren();
        hosts.page.replaceChildren(
          el('p', { className: 'page-empty glass', text: STRINGS.screens.noRoute.text, attrs: { role: 'status' } }),
          link('map', STRINGS.screens.backToMap.text, 'primary-button'),
        );
        return;
      }
      const { comparison, stretches } = model;
      const shares = comparison.gloam.shares;
      hosts.summary.replaceChildren(
        el(
          'section',
          { className: 'route-summary', attrs: { 'aria-label': STRINGS.route.panel.text } },
          routeCard(comparison),
          // The two shares carry their Tier wording, so the tile makes no claim of its own (18.2).
          el(
            'div',
            { className: 'route-mix glass sheet-extra' },
            mixRow(`${shares.confirmed_lit}%`, tierLabel('confirmed_lit')),
            mixRow(`${shares.brighter_than_most}%`, tierLabel('brighter_than_most')),
            mixRow(`${estimatedCount(stretches)} ${STRINGS.screens.of.text} ${stretches.length}`, STRINGS.screens.estimatedTile.text),
          ),
          el('div', { className: 'sheet-extra' }, createHeartbeatChart(model.series, { compact: true })),
        ),
      );
      const details = link('route', STRINGS.screens.seeDetails.text, 'primary-button');
      details.append(el('span', { className: 'button-dot', attrs: { 'aria-hidden': 'true' } }));
      hosts.footer.replaceChildren(details, el('p', { className: 'disclaimer', text: DISCLAIMER }));

      const metres = wholeMetres(stretches);
      hosts.page.replaceChildren(
        el(
          'section',
          { className: 'glass page-card heartbeat-card' },
          el('p', { className: 'card-note-line', text: STRINGS.screens.heartbeatNote.text }),
          createHeartbeatChart(model.series),
        ),
        el('h3', { className: 'section-heading', text: STRINGS.screens.streetsHeading.text }),
        el('ol', { className: 'stretch-list' }, ...stretches.map((s, i) => stretchRow(s, metres[i]!))),
        el(
          'section',
          { className: 'glass page-card', attrs: { 'aria-label': STRINGS.route.panel.text } },
          el('h3', { className: 'route-subhead', text: STRINGS.route.difference.text }),
          comparisonTable(comparison.gloam, comparison.shortest),
          differences(comparison),
        ),
      );
      hosts.pageFooter.replaceChildren(
        link('report', STRINGS.screens.somethingWrong.text, 'primary-button'),
        el('p', { className: 'disclaimer', text: DISCLAIMER }),
      );
    },
  };
}
