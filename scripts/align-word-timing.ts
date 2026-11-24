/**
 * Fit word times in existing projects' captions to the actual sound (see
 * server/wordTiming.ts). New transcripts are aligned automatically.
 *
 *   npx tsx scripts/align-word-timing.ts <project-id> [...more] [--write]
 *
 * Without --write it only reports what would change. With --write it saves a
 * backup next to the captions (caption.before-align-<time>.json) first.
 * Running it twice is harmless: an aligned transcript barely moves.
 */
import * as fs from 'fs';
import * as path from 'path';
import { alignTranscriptWithPeaks } from '../server/transcriptAlign.js';
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
  const transcript = JSON.parse(original);
  const peaks = new Uint8Array(await waveformPeaks(dir, media));
  const result = alignTranscriptWithPeaks(transcript, peaks);
  if (!result) { console.log(`${id}: no words, skipped`); continue; }
  console.log(`${id}: shifted ${result.shiftMs} ms; sound inside words ${result.coverageBefore.toFixed(2)} → ${result.coverageAfter.toFixed(2)}`);
  if (write) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `caption.before-align-${stamp}.json`), original);
    fs.writeFileSync(file, JSON.stringify(transcript, null, 2));
    console.log(`   saved (backup: caption.before-align-${stamp}.json)`);
  }
}
if (!write) console.log('\nDry run. Add --write to save.');
