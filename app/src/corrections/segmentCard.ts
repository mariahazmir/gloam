import { STRINGS, confirmedBy, tierWording } from '../content/strings';
import type { ReportType, Segment, Tier } from '../types';
import type { TaggedCorrection } from './combine';
import { communityStatus } from './status';

// What the selected-street card says (Requirements 10.3, 10.5, 10.10, 10.11, 10.12). Pure.
// The Tier wording and confidence come from the pack alone, so a note never changes them.

export interface SegmentCardModel {
  segmentId: string;
  /** The street's name, or the wording "unnamed". */
  name: string;
  highway: string;
  /** The pack's Tier wording with confidence, e.g. "estimated: typical (confidence 62%)". */
  tierText: string;
  /** This device's own note, shown as "your note", or null. */
  yourNote: string | null;
  /** "confirmed by N people: ..." from the combined notes, or null. */
  status: { text: string; sample: boolean } | null;
}

const NOTE_LABEL: Record<ReportType, string> = {
  actually_lit: STRINGS.report.actuallyLit.text,
  actually_dark: STRINGS.report.actuallyDark.text,
  light_is_out: STRINGS.report.lightIsOut.text,
};

export const reportLabel = (type: ReportType): string => NOTE_LABEL[type];

/**
 * `corrections` holds this device's notes and the Sample_Data rows for the loaded city. The status
 * is labelled sample when any row for the segment is sample, so a total that includes sample data
 * is never shown without its badge.
 */
export function buildSegmentCard(
  segment: Segment,
  tier: Tier,
  corrections: ReadonlyArray<TaggedCorrection>,
  today: string,
): SegmentCardModel {
  const mine = corrections.filter((c) => c.segmentId === segment.id);
  const own = mine.find((c) => !c.sample);
  const result = communityStatus(mine, today);
  const status =
    result === null
      ? null
      : {
          text: `${confirmedBy(result.people)}: ${
            result.side === 'lit' ? STRINGS.report.likelyWellLit.text : STRINGS.report.likelyDark.text
          }`,
          sample: mine.some((c) => c.sample),
        };
  return {
    segmentId: segment.id,
    name: segment.name ?? STRINGS.report.unnamed.text,
    highway: segment.highway,
    tierText: tierWording(tier, segment.confidence),
    yourNote: own === undefined ? null : `${STRINGS.report.yourNote.text}: ${reportLabel(own.type)}`,
    status,
  };
}
