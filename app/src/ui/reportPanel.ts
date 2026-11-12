import { STRINGS } from '../content/strings';
import type { DarkSpot } from '../corrections/darkSpots';
import type { SegmentCardModel } from '../corrections/segmentCard';
import type { ReportType } from '../types';
import { el } from './dom';
import { sampleBadge } from './tools';

// Report_Mode card and the Dark_Spot_List (Requirements 10.1, 10.3, 10.5, 10.9, 10.10, 11.1, 11.2,
// 11.4 to 11.7). This module only draws what main.ts gives it and reports what the user taps. A
// report button completes the submission with one tap and no further input.

export interface ReportView {
  inReportMode: boolean;
  /** The selected street, or null. */
  card: SegmentCardModel | null;
  /** A tap in Report_Mode found no street. */
  nothingThere: boolean;
  storeError: boolean;
  spots: ReadonlyArray<DarkSpot>;
}

export interface ReportPanelOptions {
  host: HTMLElement;
  onReport(type: ReportType): void;
  /** The CSV text for the rows shown. Throws if it cannot be made. */
  makeCsv(): string;
  /** Hands the CSV to the browser as a download. Throws if it cannot. */
  download(csv: string, fileName: string): void;
}

export interface ReportPanel {
  show(view: ReportView): void;
}

const BUTTONS: ReadonlyArray<{ type: ReportType; label: string }> = [
  { type: 'actually_lit', label: STRINGS.report.actuallyLit.text },
  { type: 'actually_dark', label: STRINGS.report.actuallyDark.text },
  { type: 'light_is_out', label: STRINGS.report.lightIsOut.text },
];

export function createReportPanel(opts: ReportPanelOptions): ReportPanel {
  const reportSection = el('section', { className: 'report-card' });
  const spotsSection = el('details', { className: 'dark-spots' });
  const spotsBody = el('div', { className: 'dark-spots-body' });
  const exportMessage = el('p', { className: 'plan-message', text: STRINGS.errors.csvExport.text, attrs: { role: 'status' } });
  exportMessage.hidden = true;
  opts.host.append(reportSection, spotsSection);

  // The button last pressed. The card redraws after a report, which drops focus, so show() puts it back.
  let pressed: HTMLButtonElement | null = null;

  const buttonRow = el(
    'div',
    { className: 'point-buttons', attrs: { role: 'group', 'aria-label': STRINGS.report.buttons.text } },
    ...BUTTONS.map(({ type, label }) => {
      const b = el('button', { className: 'plan-button', text: label, attrs: { type: 'button' } });
      b.addEventListener('click', () => {
        pressed = b;
        opts.onReport(type);
      });
      return b;
    }),
  );

  const exportButton = el('button', { className: 'plan-button', text: STRINGS.darkSpots.export.text, attrs: { type: 'button' } });
  exportButton.addEventListener('click', () => {
    try {
      opts.download(opts.makeCsv(), STRINGS.darkSpots.csvFile.text);
      exportMessage.hidden = true;
    } catch {
      exportMessage.hidden = false; // the list stays shown and usable (Requirement 11.7)
    }
  });

  let wasReportMode = false;

  function spotRow(s: DarkSpot): HTMLElement {
    const top = el(
      'span',
      { className: 'spot-name' },
      s.name ?? STRINGS.report.unnamed.text,
    );
    const line = el(
      'li',
      { className: 'spot-row' },
      top,
      el('span', { className: 'spot-detail', text: s.highway }),
      el('span', { className: 'spot-detail', text: `${STRINGS.report.actuallyDark.text}: ${s.actuallyDark}` }),
      el('span', { className: 'spot-detail', text: `${STRINGS.report.lightIsOut.text}: ${s.lightIsOut}` }),
    );
    if (s.sample) line.append(sampleBadge()); // Requirement 11.4
    return line;
  }

  return {
    show(view) {
      // Card: only in Report_Mode.
      reportSection.hidden = !view.inReportMode;
      if (view.inReportMode) {
        const children: Array<Node> = [el('h3', { className: 'tools-heading', text: STRINGS.report.heading.text })];
        if (view.card === null) {
          children.push(el('p', { text: view.nothingThere ? STRINGS.report.noStreetThere.text : STRINGS.report.tapPrompt.text, attrs: { role: 'status' } }));
        } else {
          const c = view.card;
          children.push(
            el('p', { className: 'card-name', text: c.name }),
            el('p', { className: 'card-detail', text: c.highway }),
            el('p', { className: 'card-detail', text: c.tierText }),
          );
          if (c.status !== null) {
            const status = el('p', { className: 'card-detail', text: c.status.text });
            if (c.status.sample) status.append(' ', sampleBadge());
            children.push(status);
          }
          if (c.yourNote !== null) children.push(el('p', { className: 'card-note', text: c.yourNote }));
          children.push(buttonRow);
        }
        if (view.storeError) {
          children.push(el('p', { className: 'plan-message', text: STRINGS.errors.correctionsStore.text, attrs: { role: 'status' } }));
        }
        reportSection.replaceChildren(...children);
        if (pressed !== null && reportSection.contains(pressed)) pressed.focus();
      }

      pressed = null;

      // Dark_Spot_List: open when entering Report_Mode; after that the user decides.
      if (view.inReportMode && !wasReportMode) spotsSection.open = true;
      wasReportMode = view.inReportMode;

      const summary = el('summary', { className: 'tools-heading', text: STRINGS.darkSpots.heading.text });
      if (view.spots.some((s) => s.sample)) summary.append(' ', sampleBadge());
      if (view.spots.length === 0) {
        // No export is offered with nothing to export (Requirement 11.6).
        spotsBody.replaceChildren(el('p', { text: STRINGS.empty.noReports.text, attrs: { role: 'status' } }));
      } else {
        spotsBody.replaceChildren(
          el('ol', { className: 'spot-list' }, ...view.spots.map(spotRow)),
          exportButton,
          exportMessage,
        );
      }
      spotsSection.replaceChildren(summary, spotsBody);
    },
  };
}
