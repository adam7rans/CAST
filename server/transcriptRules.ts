/**
 * Spelling rules applied to every new transcript before captions are saved.
 *
 * They work on whole words, which is reliable here: Parakeet emits one entry
 * per spoken word, so "open source" always arrives as "open" + "source" (or a
 * single "open-source" token), however the model punctuates it.
 *
 * Rules only change a word's text, never the number of words, so caption
 * timing and any per-word edits stay aligned.
 */

/** "source" → "SOURCE" (the product name), except in "open source" / "open-source". */
const SOURCE_WORD = /^([("'“‘\[]*)source([.,!?;:)"'”’\]…-]*)$/i;
const ENDS_WITH_OPEN = /(^|[^a-z])open$/i;

function sourceRule(word: string, previous: string | undefined): string {
  const match = word.match(SOURCE_WORD);
  if (!match) return word; // also leaves "open-source", "resource", "sources", "sourced" alone
  // "open source": the previous word is "open" with no punctuation between them.
  if (previous && ENDS_WITH_OPEN.test(previous)) return word;
  return `${match[1]}SOURCE${match[2]}`;
}

const RULES = [sourceRule];

/** Apply every rule to a list of words; returns the new words and how many changed. */
export function applyWordRules(words: string[]): { words: string[]; changed: number } {
  let changed = 0;
  const out = words.map((word, i) => {
    let next = word;
    for (const rule of RULES) next = rule(next, words[i - 1]);
    if (next !== word) changed += 1;
    return next;
  });
  return { words: out, changed };
}

const applyToText = (text: string) => applyWordRules(text.split(' ')).words.join(' ');

interface TranscriptShape {
  text?: string;
  utterances?: Array<{ text?: string; words?: Array<{ text: string }> }>;
}

/** Apply the rules in place to a CAST transcript (words, utterance text, full text). */
export function applyTranscriptRules<T extends TranscriptShape>(transcript: T): { transcript: T; changed: number } {
  let changed = 0;
  for (const utterance of transcript.utterances ?? []) {
    if (utterance.words?.length) {
      const result = applyWordRules(utterance.words.map((w) => w.text));
      result.words.forEach((text, i) => { utterance.words![i].text = text; });
      changed += result.changed;
    }
    if (typeof utterance.text === 'string') utterance.text = applyToText(utterance.text);
  }
  if (typeof transcript.text === 'string') transcript.text = applyToText(transcript.text);
  return { transcript, changed };
}
