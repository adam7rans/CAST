import type { AnimationRange } from './types';

export function resolveAnimationValue(
  range: AnimationRange,
  fallback: number,
  timeSeconds: number,
): number {
  if (!range.enabled) return fallback;
  const phase = (1 - Math.cos((Math.PI * 2 * timeSeconds) / Math.max(0.1, range.loop))) / 2;
  return range.from + (range.to - range.from) * phase;
}
