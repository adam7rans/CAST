/**
 * Deterministic filler-phrase detector. Given a transcript and a set of
 * enabled categories, returns the time ranges that should be skipped to
 * tighten rambling speech.
 *
 * Categories (each independently toggleable from the Editor panel):
 *   - interjection: "um", "uh", "erm", "hmm" — hesitation noises. Always cut.
 *   - like:         "like" as a discourse particle, guarded so "I like this"
 *                   and "like a car" survive.
 *   - hedge:        "basically", "actually", "literally" — cut only when they
 *                   sit next to a comma or pause.
 *   - phrase:       "you know", "I mean", "kind of", "I guess", "I don't know".
 *   - stutter:      same body token said 2+ times in a row ("I, I, I").
 *
 * Pure function — no state, no DOM, no AI. The same input always produces
 * the same output. Output is sorted by startMs and non-overlapping.
 */
import type { TranscriptData, TranscriptWord } from './transcript';

export interface CustomCut {
  key: string;
  startMs: number;
  endMs: number;
  /** Free-form tag explaining why this was cut (for the timeline tooltip). */
  label?: string;
}

export type FillerCategoryId = 'interjection' | 'like' | 'hedge' | 'phrase' | 'stutter';

export interface FillerCategoryMeta {
  id: FillerCategoryId;
  /** Chip label in the Editor panel. */
  label: string;
  /** Tooltip explaining what the chip matches. */
  hint: string;
  /** Short description of the words this category matches. */
  words: string;
}

/** Ordered for display — chips render in this order. */
export const FILLER_CATEGORIES: FillerCategoryMeta[] = [
  { id: 'interjection', label: 'um / uh', hint: 'Hesitation noises. Always cut — they carry no meaning.', words: 'um, uh, erm, hmm…' },
  { id: 'like', label: 'like', hint: '"like" as a filler. Kept when it reads as a real verb or preposition ("I like this", "like a car").', words: 'like' },
  { id: 'hedge', label: 'hedges', hint: 'Softening words. Only cut next to a comma or pause, so "I actually liked it" survives.', words: 'basically, actually…' },
  { id: 'phrase', label: 'phrases', hint: 'Multi-word fillers. Cut wherever they appear, no punctuation required.', words: 'you know, I mean…' },
  { id: 'stutter', label: 'stutters', hint: 'A word repeated back-to-back. Keeps the last repeat so the sentence still flows.', words: 'the the, I I I' },
];

/** Everything on by default. */
export const DEFAULT_FILLER_CATEGORIES: FillerCategoryId[] = FILLER_CATEGORIES.map((c) => c.id);

export const isFillerCategoryId = (v: string): v is FillerCategoryId =>
  FILLER_CATEGORIES.some((c) => c.id === v);

/** Keep only known ids, dropping duplicates. Returns null for non-arrays. */
export function sanitizeFillerCategories(list: unknown): FillerCategoryId[] | null {
  if (!Array.isArray(list)) return null;
  const out: FillerCategoryId[] = [];
  for (const raw of list) {
    if (typeof raw === 'string' && isFillerCategoryId(raw) && !out.includes(raw)) out.push(raw);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z']+/g, '');

/** Hesitation noises. Whisper spells these several ways, so cover the variants. */
const INTERJECTIONS = new Set([
  'um', 'umm', 'ummm', 'umh',
  'uh', 'uhh', 'uhhh', 'uhm', 'uhhum',
  'erm', 'er', 'errm',
  'ah', 'ahh', 'ahem',
  'eh', 'ehm',
  'hmm', 'hmmm', 'hm', 'mm', 'mmm', 'mhm', 'mmhmm',
  'huh', 'huhh',
]);

/** Softening / intensifier words — only cut when they read as interjections. */
const HEDGES = new Set(['basically', 'literally', 'actually', 'honestly', 'obviously', 'totally']);

/** Multi-word filler phrases, cut wherever they appear. */
const FILLER_PHRASES: string[][] = [
  ['you', 'know'],
  ['i', 'mean'],
  ['kind', 'of'],
  ['sort', 'of'],
  ['i', 'guess'],
  ['i', 'dont', 'know'],
];

/**
 * When "like" is preceded by one of these it is almost certainly a real verb
 * or part of a fixed expression ("I like", "do you like", "would like"), so it
 * must survive even when it happens to follow a pause.
 */
const LIKE_MEANINGFUL_PREV = new Set([
  'i', 'you', 'we', 'they', 'he', 'she', 'it', 'id', 'ive', 'idk', 'youre', 'youve', 'hed',
  'do', 'does', 'did', 'would', 'will', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'to', 'and', 'or', 'but', 'so', 'if',
  'feel', 'feels', 'felt', 'look', 'looks', 'looked', 'looking',
  'sound', 'sounds', 'sounded', 'seem', 'seems', 'seemed',
  'think', 'thinks', 'thought', 'know', 'knows', 'knew',
  'want', 'wants', 'wanted', 'need', 'needs', 'needed',
  'try', 'tries', 'tried', 'trying',
  'enjoy', 'enjoys', 'enjoyed', 'prefer', 'prefers', 'love', 'loves', 'hate', 'hates',
  'ready', 'sure', 'glad', 'happy', 'afraid',
]);

/**
 * "like" directly before one of these is a preposition introducing a noun
 * phrase ("like this", "like a car", "like to eat"), not a filler.
 */
const LIKE_NEXT_IS_NOUN = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'it', 'them', 'him', 'her', 'us', 'me', 'my', 'your',
  'to', 'if', 'when',
]);

function flattenWords(transcript: TranscriptData): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  for (const u of transcript.utterances) {
    if (u.words) out.push(...u.words);
  }
  out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  return out;
}

function matchPhrase(words: TranscriptWord[], i: number, phrase: string[]): boolean {
  for (let k = 0; k < phrase.length; k++) {
    if (i + k >= words.length) return false;
    if (norm(words[i + k].text) !== phrase[k]) return false;
  }
  return true;
}

const endsSentence = (w: TranscriptWord) => /[.!?]$/.test(w.text);
const startsWithPunct = (w: TranscriptWord | undefined) => !!w && /^[.,!?;:]/.test(w.text);
const endsWithComma = (w: TranscriptWord | undefined) => !!w && /[,;:]$/.test(w.text);

/**
 * Heuristic: is this "like" a discourse particle rather than a real word?
 * The guards run first — a verb or preposition reading always wins — and only
 * then do we treat the word as a cuttable filler.
 */
function isLikeFiller(words: TranscriptWord[], i: number): boolean {
  const prev = words[i - 1];
  const next = words[i + 1];
  const prevNorm = prev ? norm(prev.text) : '';
  const nextNorm = next ? norm(next.text) : '';
  if (prevNorm && LIKE_MEANINGFUL_PREV.has(prevNorm)) return false;
  if (nextNorm && LIKE_NEXT_IS_NOUN.has(nextNorm)) return false;
  return true;
}

function detectStutters(words: TranscriptWord[]): CustomCut[] {
  const cuts: CustomCut[] = [];
  let i = 0;
  while (i < words.length - 1) {
    const a = norm(words[i].text);
    if (!a || a.length === 0) { i++; continue; }
    let j = i + 1;
    while (j < words.length && norm(words[j].text) === a) j++;
    if (j - i >= 2) {
      // Keep the LAST occurrence (so the sentence still flows), cut the rest.
      const last = words[j - 1];
      cuts.push({
        key: `stutter:${words[i].start}`,
        startMs: words[i].start ?? 0,
        endMs: last.start ?? words[j - 2].end ?? 0,
        label: `stutter "${a}"`,
      });
    }
    i = j;
  }
  return cuts;
}

function detectPhrases(words: TranscriptWord[], on: Set<FillerCategoryId>): CustomCut[] {
  const cuts: CustomCut[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    if (on.has('phrase')) {
      for (const phrase of FILLER_PHRASES) {
        if (matchPhrase(words, i, phrase)) {
          const first = words[i];
          const last = words[i + phrase.length - 1];
          cuts.push({
            key: `filler:${first.start}`,
            startMs: first.start ?? 0,
            endMs: (last.end ?? last.start ?? 0),
            label: phrase.join(' '),
          });
          i += phrase.length;
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;
    const w = words[i];
    const lower = norm(w.text);
    if (on.has('interjection') && INTERJECTIONS.has(lower)) {
      // Hesitation noises carry no meaning — cut unconditionally.
      cuts.push({
        key: `filler:${w.start}`,
        startMs: w.start ?? 0,
        endMs: w.end ?? w.start ?? 0,
        label: lower,
      });
      i++;
      continue;
    }
    if (on.has('like') && lower === 'like' && isLikeFiller(words, i)) {
      cuts.push({
        key: `filler:${w.start}`,
        startMs: w.start ?? 0,
        endMs: w.end ?? w.start ?? 0,
        label: 'like',
      });
      i++;
      continue;
    }
    if (on.has('hedge') && HEDGES.has(lower)) {
      // Hedges are often real words ("I actually liked it"), so only cut when a
      // comma or pause sits on EITHER side. Relaxed from requiring both, because
      // transcripts rarely punctuate a hesitation on both ends.
      const prev = words[i - 1];
      const next = words[i + 1];
      const afterPause = !prev || endsSentence(prev) || endsWithComma(prev);
      const beforePause = !next || startsWithPunct(next) || /[,.!?]$/.test(w.text);
      if (afterPause || beforePause) {
        cuts.push({
          key: `filler:${w.start}`,
          startMs: w.start ?? 0,
          endMs: w.end ?? w.start ?? 0,
          label: lower,
        });
      }
    }
    i++;
  }
  return cuts;
}

/** Merge overlapping / adjacent cuts so the player doesn't bounce. */
function mergeCuts(cuts: CustomCut[], minGapMs = 40): CustomCut[] {
  if (cuts.length === 0) return cuts;
  const sorted = [...cuts].sort((a, b) => a.startMs - b.startMs);
  const out: CustomCut[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.startMs - last.endMs <= minGapMs) {
      last.endMs = Math.max(last.endMs, cur.endMs);
      last.label = last.label && cur.label ? `${last.label} + ${cur.label}` : last.label ?? cur.label;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Detect filler cuts for the enabled categories. Omitting `categories` enables
 * everything, which keeps the old one-argument call site working.
 */
export function detectFillerCuts(
  transcript: TranscriptData,
  categories: FillerCategoryId[] = DEFAULT_FILLER_CATEGORIES,
): CustomCut[] {
  const words = flattenWords(transcript);
  if (words.length === 0) return [];
  const on = new Set(categories);
  const cuts: CustomCut[] = [];
  if (on.has('stutter')) cuts.push(...detectStutters(words));
  cuts.push(...detectPhrases(words, on));
  return mergeCuts(cuts);
}
