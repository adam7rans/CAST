import { decodePeaks, PEAKS_PER_SECOND } from './waveformPeaks.js';
import { alignWordsToAudio, type AlignResult, type TimedWord } from './wordTiming.js';

interface TranscriptShape {
  utterances?: Array<{ start?: number; end?: number; words?: TimedWord[] }>;
}

/** Fit a transcript's word times to the waveform peaks, in place. Utterance spans follow their words. */
export function alignTranscriptWithPeaks<T extends TranscriptShape>(transcript: T, peaks: Uint8Array): AlignResult | null {
  const utterances = transcript.utterances ?? [];
  const all = utterances.flatMap((u) => u.words ?? []);
  if (all.length === 0) return null;
  const result = alignWordsToAudio(all, peaks, PEAKS_PER_SECOND);
  let k = 0;
  for (const u of utterances) {
    const words = u.words ?? [];
    for (const w of words) { w.start = result.words[k].start; w.end = result.words[k].end; k++; }
    if (words.length) { u.start = words[0].start; u.end = words[words.length - 1].end; }
  }
  return result;
}

/** Decode `audioFile` and align the transcript to it. Never throws: alignment is a refinement. */
export async function alignTranscriptToAudio<T extends TranscriptShape>(transcript: T, audioFile: string): Promise<AlignResult | null> {
  try {
    const peaks = new Uint8Array(await decodePeaks(audioFile));
    return alignTranscriptWithPeaks(transcript, peaks);
  } catch (err) {
    console.warn('[transcribe] word alignment skipped:', err instanceof Error ? err.message : err);
    return null;
  }
}
