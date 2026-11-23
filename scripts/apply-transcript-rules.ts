/**
 * Apply server/transcriptRules.ts to projects that were transcribed before a
 * rule existed. New transcripts get the rules automatically.
 *
 *   npx tsx scripts/apply-transcript-rules.ts <project-id> [...more] [--write]
 *
 * Without --write it only prints what would change. With --write it saves a
 * backup next to the captions (caption.before-rules-<time>.json) first.
 */
import * as fs from 'fs';
import * as path from 'path';
import { applyTranscriptRules } from '../server/transcriptRules.js';

const args = process.argv.slice(2);
const write = args.includes('--write');
const ids = args.filter((a) => !a.startsWith('--'));
if (ids.length === 0) {
  console.error('Usage: npx tsx scripts/apply-transcript-rules.ts <project-id> [...more] [--write]');
  process.exit(1);
}

const projectsDir = path.resolve(process.env.CAST_DATA_DIR || path.join(import.meta.dirname, '..', 'projects'));

for (const id of ids) {
  const file = path.join(projectsDir, id, 'caption.json');
  if (!fs.existsSync(file)) { console.log(`${id}: no caption.json, skipped`); continue; }
  const original = fs.readFileSync(file, 'utf8');
  const before = JSON.parse(original);
  const beforeWords = (before.utterances ?? []).flatMap((u: any) => (u.words ?? []).map((w: any) => w.text as string));
  const { transcript, changed } = applyTranscriptRules(JSON.parse(original));
  const afterWords = (transcript.utterances ?? []).flatMap((u: any) => (u.words ?? []).map((w: any) => w.text as string));
  console.log(`${id}: ${changed} word${changed === 1 ? '' : 's'} changed`);
  afterWords.forEach((word: string, i: number) => {
    if (word !== beforeWords[i]) {
      console.log(`   …${beforeWords.slice(Math.max(0, i - 4), i).join(' ')} [${beforeWords[i]} → ${word}] ${beforeWords.slice(i + 1, i + 5).join(' ')}…`);
    }
  });
  if (write && changed > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(path.dirname(file), `caption.before-rules-${stamp}.json`), original);
    fs.writeFileSync(file, JSON.stringify(transcript, null, 2));
    console.log(`   saved (backup: caption.before-rules-${stamp}.json)`);
  }
}
if (!write) console.log('\nDry run. Add --write to save.');
