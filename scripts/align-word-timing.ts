/**
 * Re-time the words in existing projects' captions: forced alignment places
 * each word where its sounds are, then a loudness pass fits the edges (see
 * server/transcriptAlign.ts). New transcripts are aligned automatically.
 *
 * It always starts from Parakeet's original timings: the oldest
 * caption.before-align-*.json backup if there is one, else caption.json.
 *
 *   npx tsx scripts/align-word-timing.ts <project-id> [...more] [--write]
 *
 * Without --write it only reports what would change. With --write it saves a
 * backup next to the captions (caption.before-align-<time>.json) first.
 */
import * as fs from 'fs';
import * as path from 'path';
import { alignTranscript } from '../server/transcriptAlign.js';
import { waveformPeaks } from '../server/waveformPeaks.js';

const args = process.argv.slice(2);
const write = args.includes('--write');
const ids = args.filter((a) => !a.startsWith('--'));
if (ids.length === 0) {
  console.error('Usage: npx tsx scripts/align-word-timing.ts <project-id> [...more] [--write]');
  process.exit(1);
}
const projectsDir = path.resolve(process.env.CAST_DATA_DIR || path.join(import.meta.dirname, '..', 'projects'));

function mediaFile(dir: string): string | null {
  const project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  const candidates = [
    project.videoFile && path.join(dir, project.videoFile),
    project.linkedSource?.path,
    project.audioFile && path.join(dir, project.audioFile),
  ].filter(Boolean) as string[];
  return candidates.find((f) => fs.existsSync(f)) ?? null;
}

for (const id of ids) {
  const dir = path.join(projectsDir, id);
  const file = path.join(dir, 'caption.json');
  if (!fs.existsSync(file)) { console.log(`${id}: no caption.json, skipped`); continue; }
  const media = mediaFile(dir);
  if (!media) { console.log(`${id}: no media file, skipped`); continue; }
  const original = fs.readFileSync(file, 'utf8');
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('caption.before-align-')).sort();
  const source = backups.length ? path.join(dir, backups[0]) : file;
  const transcript = JSON.parse(fs.readFileSync(source, 'utf8'));
  console.log(`${id}: starting from ${path.basename(source)}`);
  const peaks = new Uint8Array(await waveformPeaks(dir, media));
  const result = await alignTranscript(transcript, media, peaks);
  if (!result) { console.log(`${id}: no words, skipped`); continue; }
  console.log(result.forced
    ? `${id}: forced alignment placed ${result.forcedAligned} words; edges fitted`
    : `${id}: aligner model not installed — loudness-only (shifted ${result.shiftMs} ms)`);
  if (write) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `caption.before-align-${stamp}.json`), original);
    fs.writeFileSync(file, JSON.stringify(transcript, null, 2));
    console.log(`   saved (backup: caption.before-align-${stamp}.json)`);
  }
}
if (!write) console.log('\nDry run. Add --write to save.');
