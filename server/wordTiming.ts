/**
 * Line transcript words up with the actual sound.
 *
 * Parakeet is reliable about *which* words were said but only approximate
 * about *when*: its word times come from when each piece of the word was
 * recognised, in 80 ms steps. Measured on a 70-minute recording, words began
 * ~160 ms before their sound (a constant offset, no drift) and lasted a median
 * 240 ms, so a drawn-out word kept a short box and its tail fell into the "gap"
 * after it — and skipping that word left the tail audible.
 *
 * Using the waveform peaks (loudest sample per 10 ms bin, 0–255):
 *  1. remove the constant offset, found by testing shifts and keeping the one
 *     where word spans cover the most sound;
 *  2. fit each word to its sound: the end extends while the sound continues
 *     (up to the next word), the start moves onto where the sound begins.
 * "Sound" is judged against each word's own loudness, so quiet and loud words
 * both work and room noise isn't mistaken for speech. Word edges use a lower
 * bar — clearly above the room's background level — because the hiss of an
 * "s" or the breath of an "h" is far quieter than the vowel before it. Words keep their order
 * and never overlap; only start/end change, never the word count.
 */
export interface TimedWord { text: string; start: number; end: number }

const MAX_SHIFT_MS = 500;
const SHIFT_STEP_MS = 10;
const MAX_TAIL_MS = 1500; // how far a word's end may grow
const MAX_LEAD_MS = 150; // how far a start may move earlier
const MIN_WORD_MS = 40;
const GAP_MS = 10; // keep words this far apart
const TAIL_GAP_MS = 80; // a word's sound may dip this long (e.g. the "k" before the "s" in "X") and continue

function percentile(values: Uint8Array, p: number): number {
  const counts = new Uint32Array(256);
  for (const v of values) counts[v]++;
  let seen = 0;
  const target = values.length * p;
  for (let v = 0; v < 256; v++) { seen += counts[v]; if (seen >= target) return v; }
  return 255;
}

/** Share of word time that has sound in it, if every word were moved by `shiftMs`. */
function coverage(words: TimedWord[], voiced: Uint8Array, rate: number, shiftMs: number): number {
  let hit = 0;
  let total = 0;
  for (const w of words) {
    const a = Math.max(0, Math.floor(((w.start + shiftMs) / 1000) * rate));
    const b = Math.min(voiced.length, Math.ceil(((w.end + shiftMs) / 1000) * rate));
    for (let i = a; i < b; i++) { hit += voiced[i]; total++; }
  }
  return total ? hit / total : 0;
}

export interface AlignResult { words: TimedWord[]; shiftMs: number; coverageBefore: number; coverageAfter: number }

export function alignWordsToAudio(input: TimedWord[], peaks: Uint8Array, rate: number): AlignResult {
  const words = input.map((w) => ({ ...w }));
  if (words.length === 0 || peaks.length === 0) return { words, shiftMs: 0, coverageBefore: 0, coverageAfter: 0 };
  const floor = percentile(peaks, 0.3);
  const loud = percentile(peaks, 0.95);
  const speech = floor + Math.max(2, (loud - floor) * 0.12);
  const voiced = new Uint8Array(peaks.length);
  for (let i = 0; i < peaks.length; i++) voiced[i] = peaks[i] > speech ? 1 : 0;

  const coverageBefore = coverage(words, voiced, rate, 0);
  let shiftMs = 0;
  let best = coverageBefore;
  for (let s = -MAX_SHIFT_MS; s <= MAX_SHIFT_MS; s += SHIFT_STEP_MS) {
    const c = coverage(words, voiced, rate, s);
    if (c > best + 1e-4) { best = c; shiftMs = s; }
  }
  for (const w of words) { w.start += shiftMs; w.end += shiftMs; }

  const ms = (bin: number) => (bin / rate) * 1000;
  const bin = (t: number) => Math.max(0, Math.min(peaks.length - 1, Math.round((t / 1000) * rate)));
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prevEnd = i > 0 ? words[i - 1].end + GAP_MS : 0;
    const nextStart = i + 1 < words.length ? words[i + 1].start - GAP_MS : ms(peaks.length);
    let local = 0;
    for (let b = bin(w.start); b <= bin(w.end); b++) local = Math.max(local, peaks[b]);
    const level = Math.max(speech, local * 0.15);
    const loudAt = (b: number) => peaks[b] > level;
    const edge = Math.max(floor + 2, local * 0.06);
    const audibleAt = (b: number) => peaks[b] >= edge;

    // Start: if it sits in silence, move onto the first sound inside the word;
    // if sound is already there, follow it back to where it began.
    let s = bin(w.start);
    const sLimit = bin(Math.min(w.end - MIN_WORD_MS, w.start + 300));
    while (s < sLimit && !loudAt(s)) s++;
    const back = bin(Math.max(prevEnd, w.start - MAX_LEAD_MS));
    while (s > back && audibleAt(s - 1)) s--;

    // End: extend while the sound continues, stopping before the next word.
    let e = Math.max(bin(w.end), s + 1);
    const eLimit = bin(Math.min(nextStart, w.end + MAX_TAIL_MS));
    const maxDip = Math.round((TAIL_GAP_MS / 1000) * rate);
    let lastAudible = e - 1;
    for (let b = e; b < eLimit; b++) {
      if (audibleAt(b)) lastAudible = b;
      else if (b - lastAudible > maxDip) break;
    }
    e = Math.max(e, lastAudible + 1);

    w.start = Math.max(prevEnd, Math.round(ms(s)));
    w.end = Math.max(w.start + MIN_WORD_MS, Math.min(Math.round(ms(e)), Math.max(nextStart, w.start + MIN_WORD_MS)));
  }
  return { words, shiftMs, coverageBefore, coverageAfter: coverage(words, voiced, rate, 0) };
}
