import { MICRO_TIMELINE_COLORS } from './types.defaults';
import type { MicroTimeline } from './types.models';

export interface ClipCandidate {
  id: string;
  title: string;
  startSecond: number;
  endSecond: number;
  reason: string;
  score: number;
}

export interface ClipDraft extends ClipCandidate {
  selected: boolean;
  added: boolean;
}

export type ClipDiscoveryEvent =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'complete'; candidates: ClipCandidate[]; total: number }
  | { type: 'error'; error: string; code: string };

export class ClipClientError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ClipClientError';
  }
}

export function candidateError(candidate: ClipCandidate, duration: number): string | null {
  if (!candidate.title.trim()) return 'Enter a clip title.';
  if (!Number.isFinite(candidate.startSecond) || !Number.isFinite(candidate.endSecond)) {
    return 'Enter valid start and end seconds.';
  }
  if (candidate.startSecond < 0 || candidate.endSecond - candidate.startSecond < 0.1 - 1e-9) {
    return 'End must be at least 0.1 seconds after a non-negative start.';
  }
  if (!Number.isFinite(duration) || duration <= 0 || candidate.endSecond > duration) {
    return 'Range extends beyond the available source.';
  }
  return null;
}

export function appendClipCandidates(
  existing: MicroTimeline[], candidates: ClipCandidate[], duration: number,
): MicroTimeline[] {
  if (candidates.some((candidate) => candidateError(candidate, duration))) {
    throw new Error('Correct invalid candidates before adding clips.');
  }
  return [...existing, ...candidates.map((candidate, index) => ({
    id: candidate.id,
    name: candidate.title.trim(),
    startSecond: candidate.startSecond,
    endSecond: candidate.endSecond,
    color: MICRO_TIMELINE_COLORS[(existing.length + index) % MICRO_TIMELINE_COLORS.length],
  }))];
}
