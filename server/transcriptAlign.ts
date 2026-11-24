import { forcedAlign } from './forcedAlign.js';
import { decodePeaks, PEAKS_PER_SECOND } from './waveformPeaks.js';
import { alignWordsToAudio, type AlignResult, type TimedWord } from './wordTiming.js';

/**
 * Re-time a transcript's words to the audio, in place:
 *  1. forced alignment (scripts/forced_align.py) places each word where its
 *     sounds are, when the model is installed;
 *  2. a loudness pass fits each word's edges (e.g. the hiss of a final "s").
 *     Without forced alignment it also removes Parakeet's constant offset.
 * Utterance spans follow their words.
 */
interface TranscriptShape {
  utterances?: Array<{ start?: number; end?: number; words?: TimedWord[] }>;
}

export interface TranscriptAlignResult extends AlignResult { forced: boolean; forcedAligned: number }

function writeBack(utterances: NonNullable<TranscriptShape['utterances']>, times: Array<{ start: number; end: number }>) {
  let k = 0;
  for (const u of utterances) {
    const words = u.words ?? [];
    for (const w of words) { w.start = times[k].start; w.end = times[k].end; k++; }
    if (words.length) { u.start = words[0].start; u.end = words[words.length - 1].end; }
  }
}

export async function alignTranscript<T extends TranscriptShape>(
  transcript: T,
  audioFile: string,
  peaks: Uint8Array,
  onProgress?: (message: string) => void,
): Promise<TranscriptAlignResult | null> {
  const utterances = transcript.utterances ?? [];
  const all = utterances.flatMap((u) => u.words ?? []);
  if (all.length === 0) return null;
  const forced = await forcedAlign(audioFile, all, onProgress);
  if (forced) writeBack(utterances, forced.words);
  const edges = alignWordsToAudio(utterances.flatMap((u) => u.words ?? []), peaks, PEAKS_PER_SECOND, { findShift: !forced });
  writeBack(utterances, edges.words);
  return { ...edges, forced: !!forced, forcedAligned: forced?.aligned ?? 0 };
}

/** Decode `audioFile` and align the transcript to it. Never throws: alignment is a refinement. */
export async function alignTranscriptToAudio<T extends TranscriptShape>(
  transcript: T,
  audioFile: string,
  onProgress?: (message: string) => void,
): Promise<TranscriptAlignResult | null> {
  try {
    const peaks = new Uint8Array(await decodePeaks(audioFile));
    return await alignTranscript(transcript, audioFile, peaks, onProgress);
  } catch (err) {
    console.warn('[transcribe] word alignment skipped:', err instanceof Error ? err.message : err);
    return null;
  }
}
