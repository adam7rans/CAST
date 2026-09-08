import { ClipFinderError } from './errors.js';

export interface TimedUnit {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export const MAX_CHUNK_BYTES = 48_000;
const OVERLAP_BYTES = 12_000;

function timedText(value: any): boolean {
  return typeof value?.text === 'string' && !!value.text.trim()
    && Number.isFinite(value.start) && Number.isFinite(value.end)
    && value.start >= 0 && value.end > value.start;
}

const normalizeText = (text: string) => text.replace(/\s+/g, '').toLowerCase();

export function transcriptUnits(raw: unknown): TimedUnit[] {
  const source = raw as any;
  const utterances = Array.isArray(source) ? source : source?.utterances;
  if (!Array.isArray(utterances) || !utterances.length) {
    throw new ClipFinderError('no_transcript', 'Load a transcript with timed utterances first.');
  }
  const units: TimedUnit[] = [];
  for (const utterance of utterances) {
    const words = utterance?.words;
    const wordsUsable = Array.isArray(words) && words.length && words.every(timedText)
      && words.every((word, index) => !index || word.start >= words[index - 1].start);
    const hasText = typeof utterance?.text === 'string' && !!utterance.text.trim();
    const wordsComplete = wordsUsable && (!hasText
      || normalizeText(words.map((word: any) => word.text).join(' ')) === normalizeText(utterance.text));
    const entries = wordsComplete ? words : timedText(utterance) ? [utterance] : null;
    if (!entries) {
      throw new ClipFinderError('invalid_transcript',
        'A transcript section has missing text or invalid timing. Fix it before discovery; nothing was omitted.');
    }
    for (const entry of entries) {
      units.push({ id: 0, start: entry.start, end: entry.end, text: entry.text,
        ...(typeof utterance.speaker === 'string' ? { speaker: utterance.speaker } : {}) });
    }
  }
  return units.sort((left, right) => left.start - right.start || left.end - right.end)
    .map((unit, index) => ({ ...unit, id: index }));
}

export function chunkTranscript(units: TimedUnit[], maxBytes = MAX_CHUNK_BYTES): TimedUnit[][] {
  const sizes = units.map((unit) => Buffer.byteLength(JSON.stringify(unit), 'utf8') + 1);
  if (sizes.some((size) => size + 2 > maxBytes)) {
    throw new ClipFinderError('section_too_large',
      'A timed section exceeds the request limit. Use a word-timed transcript or split that section; nothing was omitted.');
  }
  const chunks: TimedUnit[][] = [];
  let start = 0;
  while (start < units.length) {
    let end = start;
    let bytes = 2;
    while (end < units.length && bytes + sizes[end] <= maxBytes) bytes += sizes[end++];
    chunks.push(units.slice(start, end));
    if (chunks.length > 300) {
      throw new ClipFinderError('transcript_too_large',
        'This transcript exceeds 300 analysis sections. Split the project before discovery; nothing was sent.');
    }
    if (end === units.length) break;
    let overlapStart = end;
    let overlapBytes = 0;
    const overlapLimit = Math.min(OVERLAP_BYTES, maxBytes / 4);
    while (overlapStart > start + 1
      && units[end - 1].end - units[overlapStart - 1].start <= 120_000
      && overlapBytes + sizes[overlapStart - 1] <= overlapLimit
      && overlapBytes + sizes[overlapStart - 1] + sizes[end] + 2 <= maxBytes) {
      overlapBytes += sizes[--overlapStart];
    }
    start = overlapStart;
  }
  return chunks;
}
