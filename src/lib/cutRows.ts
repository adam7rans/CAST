import { isCustomKey, skipTypeOfGap, type SkipType } from './skipTypes';

/** A cut as the timeline and the Cuts list show it. */
export interface CutRow {
  key: string;
  kind?: 'silence' | 'custom';
  type: SkipType;
  label: string;
  startSec: number;
  endSec: number;
  durSec: number;
  /** Turned off by the user: kept in the list but not applied. */
  disabled: boolean;
  /** Manual, filler and mouth cuts can be deleted; silence gaps can only be turned off. */
  removable: boolean;
}

export interface CutGap { startMs: number; endMs: number; key: string; kind?: 'silence' | 'custom'; label?: string }

/** Human label for a cut key when no explicit label is attached. */
export function gapLabel(key: string): string {
  if (key.startsWith('mouth:')) return 'mouth sound';
  if (key.startsWith('filler:')) return 'filler';
  if (key.startsWith('stutter:')) return 'stutter';
  if (key.startsWith('editorial:') || key.startsWith('custom:')) return 'manual skip';
  return 'silence';
}

/**
 * Cuts sorted by time, clipped to `range` (seconds) when given. Disabled cuts
 * are left out unless `includeDisabled` is set.
 */
export function buildCutRows(
  gaps: CutGap[],
  disabled: Record<string, true> | undefined,
  range: { start: number; end: number },
  includeDisabled = false,
): CutRow[] {
  return gaps
    .filter((gap) => includeDisabled || !disabled?.[gap.key])
    .map((gap) => {
      const startSec = Math.max(range.start, gap.startMs / 1000);
      const endSec = Math.min(range.end, gap.endMs / 1000);
      return {
        key: gap.key,
        kind: gap.kind,
        type: skipTypeOfGap(gap),
        label: gap.label ?? gapLabel(gap.key),
        startSec,
        endSec,
        durSec: endSec - startSec,
        disabled: !!disabled?.[gap.key],
        removable: gap.kind === 'custom' && isCustomKey(gap.key),
      };
    })
    .filter((row) => row.durSec > 0)
    .sort((a, b) => a.startSec - b.startSec);
}

/** Seconds actually removed by the enabled cuts, counting overlaps once. */
export function removedSeconds(rows: CutRow[]): number {
  let total = 0;
  let reach = -Infinity;
  for (const row of rows.filter((r) => !r.disabled)) { // already sorted by start
    const start = Math.max(row.startSec, reach);
    if (row.endSec > start) total += row.endSec - start;
    reach = Math.max(reach, row.endSec);
  }
  return total;
}
