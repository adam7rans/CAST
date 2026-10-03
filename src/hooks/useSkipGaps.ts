import type { TranscriptData } from '../lib/transcript';
import type { CustomCut } from '../lib/fillerDetector';
import { isCustomKey, isFillerCutKey, isMouthCutKey } from '../lib/skipTypes';

/** One skip region, either an auto-detected silence or a user/custom cut. */
export interface SkipGap {
  startMs: number;
  endMs: number;
  key: string;
  kind?: 'silence' | 'custom';
  label?: string;
}

export interface SkipVisibility {
  showSilenceGaps: boolean;
  showFillerCuts: boolean;
  showManualCuts: boolean;
  showMouthCuts: boolean;
}

export interface SkipPadding {
  jumpCutPaddingMs: number;
  customCutPaddingMs: number;
}

export interface SkipOverrides {
  overrides: Record<string, { startMs: number; endMs: number }>;
  disabled: Record<string, true>;
}

/** Silence gaps between words, once the gap exceeds the threshold. */
export function buildSilenceGaps(transcript: TranscriptData | null, minGapMs: number): SkipGap[] {
  if (!transcript) return [];
  const words: Array<{ start: number; end: number }> = [];
  for (const u of transcript.utterances) {
    if (u.words) for (const w of u.words) words.push(w);
  }
  words.sort((a, b) => a.start - b.start);
  const gaps: SkipGap[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const gapStart = words[i].end;
    const gapEnd = words[i + 1].start;
    if (gapEnd - gapStart >= minGapMs) {
      gaps.push({ startMs: gapStart, endMs: gapEnd, key: `${gapStart}|${gapEnd}`, kind: 'silence' });
    }
  }
  return gaps;
}

/** User-added custom cuts flow through the same pipeline as silence gaps. */
export function buildCustomCutGaps(customCuts: CustomCut[]): SkipGap[] {
  return customCuts.map((c) => ({
    startMs: c.startMs,
    endMs: c.endMs,
    key: isCustomKey(c.key) ? c.key : `custom:${c.key}`,
    kind: 'custom' as const,
    label: c.label,
  }));
}

/** Merge both sources, sort by time, and apply per-gap user overrides. */
export function mergeAndOverride(
  silence: SkipGap[],
  custom: SkipGap[],
  overrides: Record<string, { startMs: number; endMs: number }>,
): SkipGap[] {
  const all = [...silence, ...custom];
  all.sort((a, b) => a.startMs - b.startMs);
  return all.map((g) => {
    const o = overrides[g.key];
    return o ? { ...g, startMs: o.startMs, endMs: o.endMs } : g;
  });
}

/** Keep only the categories the user currently has switched on. */
export function filterByVisibility(gaps: SkipGap[], vis: SkipVisibility): SkipGap[] {
  return gaps.filter((g) => {
    if (g.kind === 'custom') {
      if (isMouthCutKey(g.key)) return vis.showMouthCuts;
      return isFillerCutKey(g.key) ? vis.showFillerCuts : vis.showManualCuts;
    }
    return vis.showSilenceGaps;
  });
}

/**
 * The actual skip zones used for playback and export. Both kinds SHRINK by their
 * padding (padding tightens a cut, keeping less surrounding context); gaps that
 * padding has consumed entirely are dropped.
 */
export function applyPadding(gaps: SkipGap[], pad: SkipPadding): SkipGap[] {
  return gaps
    .map((g) => (g.kind === 'custom'
      ? { ...g, startMs: g.startMs + pad.customCutPaddingMs, endMs: g.endMs - pad.customCutPaddingMs }
      : { ...g, startMs: g.startMs + pad.jumpCutPaddingMs, endMs: g.endMs - pad.jumpCutPaddingMs }))
    .filter((g) => g.endMs - g.startMs > 20);
}

/** The RAF loop must never see gaps the user disabled. */
export function removeDisabled(gaps: SkipGap[], disabled: Record<string, true>): SkipGap[] {
  return gaps.filter((g) => !disabled[g.key]);
}
