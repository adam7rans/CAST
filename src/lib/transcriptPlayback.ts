import type { TranscriptData, TranscriptUtterance, TranscriptWord } from './transcript';

export interface PlaybackTimeRangeMs {
  startMs: number;
  endMs: number;
}

export interface PlayableTranscriptWindow {
  clipStartMs: number;
  clipEndMs: number;
  removedRangesMs?: PlaybackTimeRangeMs[];
}

function normalizeRange(range: PlaybackTimeRangeMs): PlaybackTimeRangeMs | null {
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) return null;
  if (range.endMs <= range.startMs) return null;
  return {
    startMs: Math.round(range.startMs),
    endMs: Math.round(range.endMs),
  };
}

function mergeRanges(ranges: PlaybackTimeRangeMs[]): PlaybackTimeRangeMs[] {
  const normalized = ranges
    .map(normalizeRange)
    .filter((range): range is PlaybackTimeRangeMs => range !== null)
    .sort((a, b) => a.startMs - b.startMs);
  if (normalized.length === 0) return [];
  const merged: PlaybackTimeRangeMs[] = [{ ...normalized[0] }];
  for (let i = 1; i < normalized.length; i += 1) {
    const current = normalized[i];
    const last = merged[merged.length - 1];
    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function wordFullyPlayable(
  word: TranscriptWord,
  window: PlayableTranscriptWindow,
  removedRangesMs: PlaybackTimeRangeMs[],
): boolean {
  const start = word.start ?? 0;
  const end = word.end ?? start;
  if (start < window.clipStartMs || end > window.clipEndMs) return false;
  return !removedRangesMs.some((range) => start < range.endMs && end > range.startMs);
}

function filterUtteranceWords(
  utterance: TranscriptUtterance,
  window: PlayableTranscriptWindow,
  removedRangesMs: PlaybackTimeRangeMs[],
): TranscriptUtterance | null {
  if (!utterance.words?.length) {
    if (utterance.start < window.clipStartMs || utterance.end > window.clipEndMs) return null;
    if (removedRangesMs.some((range) => utterance.start < range.endMs && utterance.end > range.startMs)) return null;
    return utterance;
  }

  const words = utterance.words.filter((word) => wordFullyPlayable(word, window, removedRangesMs));
  if (words.length === 0) return null;

  return {
    ...utterance,
    start: words[0].start ?? utterance.start,
    end: words[words.length - 1].end ?? utterance.end,
    words,
    text: words.map((word) => word.text ?? '').join(' ').trim(),
  };
}

export function filterTranscriptToPlayableWindow(
  transcript: TranscriptData,
  window: PlayableTranscriptWindow,
): TranscriptData {
  const removedRangesMs = mergeRanges(
    (window.removedRangesMs ?? [])
      .map((range) => ({
        startMs: Math.max(window.clipStartMs, range.startMs),
        endMs: Math.min(window.clipEndMs, range.endMs),
      }))
      .filter((range) => range.endMs > range.startMs),
  );

  const utterances = transcript.utterances
    .map((utterance) => filterUtteranceWords(utterance, window, removedRangesMs))
    .filter((utterance): utterance is TranscriptUtterance => utterance !== null);

  return { ...transcript, utterances };
}
