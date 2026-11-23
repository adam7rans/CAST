import type { TranscriptWord } from '../../lib/transcript';

/** CAST's UI font is monospaced, so text width is predictable: ~0.6em per character at 11px. */
export const WORD_FONT_PX = 11;
const CHAR_PX = WORD_FONT_PX * 0.6;
const TEXT_PAD_PX = 6;

export interface PlacedWord {
  index: number;
  word: TranscriptWord;
  leftPx: number;
  /** How long the word is spoken. */
  widthPx: number;
  /** Room up to the next word's start: the word's text and click area may use the silence after it. */
  slotPx: number;
  /** 0: text on the first row. 1: it would run into the next word, so it drops to the row below. null: no room, show on hover. */
  textRow: 0 | 1 | null;
}

/** Words overlapping the view, with each word's box and where its text goes. */
export function layoutWords(
  words: TranscriptWord[],
  viewStartSec: number,
  viewEndSec: number,
  widthPx: number,
): PlacedWord[] {
  const span = Math.max(0.001, viewEndSec - viewStartSec);
  const pxPerMs = widthPx / (span * 1000);
  const viewStartMs = viewStartSec * 1000;
  const viewEndMs = viewEndSec * 1000;
  const placed: PlacedWord[] = [];
  let row1End = -Infinity;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.end <= viewStartMs) continue;
    if (word.start >= viewEndMs) break;
    const leftPx = (word.start - viewStartMs) * pxPerMs;
    const widthPx = Math.max(1, (word.end - word.start) * pxPerMs);
    const next = words[i + 1];
    const slotPx = Math.max(widthPx, next ? (next.start - word.start) * pxPerMs : widthPx);
    const textPx = word.text.length * CHAR_PX + TEXT_PAD_PX;
    let textRow: PlacedWord['textRow'] = 0;
    if (textPx > slotPx) {
      if (leftPx >= row1End) {
        textRow = 1;
        row1End = leftPx + textPx;
      } else {
        textRow = null;
      }
    }
    placed.push({ index: i, word, leftPx, widthPx, slotPx, textRow });
  }
  return placed;
}

/** The placed word whose slot contains `x`, if any (placed is sorted by position). */
export function wordAtX(placed: PlacedWord[], x: number): PlacedWord | null {
  let lo = 0;
  let hi = placed.length - 1;
  let found: PlacedWord | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (placed[mid].leftPx <= x) { found = placed[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return found && x <= found.leftPx + found.slotPx ? found : null;
}

/** Is the middle of [startMs, endMs) inside any active cut? */
export function insideCut(startMs: number, endMs: number, cuts: Array<{ startMs: number; endMs: number }>): boolean {
  const mid = (startMs + endMs) / 2;
  return cuts.some((cut) => mid >= cut.startMs && mid < cut.endMs);
}
