import type { CustomCut } from './fillerDetector';

/**
 * Shared skip-type taxonomy: every skip region belongs to exactly one type,
 * each with its own timeline color and Editor section dot.
 *
 * - silence: auto-detected transcript gaps (`start|end` keys)
 * - filler:  transcript filler/stutter cuts (`filler:` / `stutter:` keys)
 * - manual:  hand-placed skips (`editorial:` / `custom:` keys)
 * - mouth:   YAMNet mouth-sound skips (`mouth:` keys)
 */

export type SkipType = 'silence' | 'filler' | 'manual' | 'mouth';

export const SKIP_TYPE_META: Record<SkipType, { hex: string; rgb: string; label: string }> = {
  silence: { hex: '#ffb450', rgb: '255,180,80', label: 'Skip silence' },
  filler: { hex: '#30d158', rgb: '48,209,88', label: 'Filler cut' },
  manual: { hex: '#9678ff', rgb: '150,120,255', label: 'Manual skip' },
  mouth: { hex: '#ff6e82', rgb: '255,110,130', label: 'Mouth sound' },
};

const CUSTOM_KEY_PREFIXES = ['custom:', 'filler:', 'stutter:', 'editorial:', 'mouth:'];
export const isCustomKey = (k: string) => CUSTOM_KEY_PREFIXES.some((p) => k.startsWith(p));
export const isFillerCutKey = (k: string) => k.startsWith('filler:') || k.startsWith('stutter:');

export function isMouthCutKey(key: string): boolean {
  return key.startsWith('mouth:');
}

export const isManualCutKey = (k: string) => isCustomKey(k) && !isFillerCutKey(k) && !isMouthCutKey(k);

export function skipTypeOfKey(key: string): SkipType {
  if (isMouthCutKey(key)) return 'mouth';
  if (key.startsWith('filler:') || key.startsWith('stutter:')) return 'filler';
  if (key.startsWith('editorial:') || key.startsWith('custom:')) return 'manual';
  // Auto-detected silence gaps use `start|end` keys.
  return 'silence';
}

export function skipTypeOfGap(gap: { kind?: 'silence' | 'custom'; key: string }): SkipType {
  if (gap.kind !== 'custom') return 'silence';
  return skipTypeOfKey(gap.key);
}

/** YAMNet classes offered for mouth-sound detection (must match the script's). */
export const MOUTH_SOUND_CLASSES = ['Cough', 'Sneeze', 'Throat clearing', 'Sniff', 'Snort'];

/** Deterministic key so re-running detection dedupes instead of duplicating. */
export function buildMouthCutKey(startMs: number, endMs: number, label: string): string {
  const r = (v: number) => Math.round(v / 10) * 10;
  const slug = label.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'sound';
  return `mouth:${r(startMs)}-${r(endMs)}-${slug}`;
}

/** Human label for a timeline gap, e.g. "mouth sound (cough)". */
export function formatGapKind(gap: { kind?: 'silence' | 'custom'; key: string; label?: string }): string {
  if (gap.kind !== 'custom') return 'silence gap';
  if (isMouthCutKey(gap.key)) return `mouth sound${gap.label ? ` (${gap.label})` : ''}`;
  if (gap.key.startsWith('filler:')) return 'filler cut';
  if (gap.key.startsWith('stutter:')) return 'stutter cut';
  if (gap.key.startsWith('editorial:')) return 'manual skip';
  return 'custom cut';
}

/** Merge new cuts into existing ones, deduping by key and sorting by start. */
export function mergeCutsByKey(prev: CustomCut[], cuts: CustomCut[]): CustomCut[] {
  const seen = new Set(prev.map((c) => c.key));
  const merged = [...prev];
  for (const c of cuts) {
    if (!seen.has(c.key)) {
      merged.push(c);
      seen.add(c.key);
    }
  }
  return merged.sort((a, b) => a.startMs - b.startMs);
}
