#!/usr/bin/env node
/**
 * Stitch per-chunk CAST exports back into one continuous video.
 *
 * Workflow:
 *   1. In the app, export the project in ~5 min ranges, one chunk at a time
 *      (set the range on the timeline beneath the preview, then Render export).
 *   2. Once every chunk is rendered, run this script to concatenate them
 *      in time order into a single file.
 *
 * It scans projects/<id>/exports/<*>/ for the stitched chunk videos, sorts them
 * by the start-time token embedded in each filename (e.g.
 * "talking_00h00m00s00-00h04m47s20.mp4"), and concatenates them losslessly with
 * ffmpeg's concat demuxer (-c copy), so no re-encode / quality loss.
 *
 * Usage:
 *   node scripts/stitch-chunks.mjs <projectId> [--prefix <substr>] [--out <file>] [--reencode]
 *
 * Examples:
 *   node scripts/stitch-chunks.mjs june-5
 *   node scripts/stitch-chunks.mjs june-5 --prefix talking --out june-5-full.mp4
 *
 * Env:
 *   CAST_DATA_DIR  override projects root (defaults to ./projects)
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, '..');
const PROJECTS_DIR = path.resolve(process.env.CAST_DATA_DIR || path.join(APP_ROOT, 'projects'));

const VIDEO_RE = /_(\d\dh\d\dm\d\ds\d\d)-(\d\dh\d\dm\d\ds\d\d)\.(mp4|mov|webm)$/i;

function parseArgs(argv) {
  const args = { projectId: null, prefix: null, out: null, reencode: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--prefix') args.prefix = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--reencode') args.reencode = true;
    else rest.push(a);
  }
  args.projectId = rest[0] ?? null;
  return args;
}

function tokenToSeconds(token) {
  // "00h04m47s20" -> seconds (last pair is centiseconds)
  const m = token.match(/(\d\d)h(\d\d)m(\d\d)s(\d\d)/);
  if (!m) return 0;
  const [, h, mm, s, cs] = m;
  return Number(h) * 3600 + Number(mm) * 60 + Number(s) + Number(cs) / 100;
}

function findChunks(exportsDir, prefixFilter) {
  if (!fs.existsSync(exportsDir)) {
    throw new Error(`No exports folder found at ${exportsDir}`);
  }
  const chunks = [];
  for (const entry of fs.readdirSync(exportsDir)) {
    const dir = path.join(exportsDir, entry);
    if (!fs.statSync(dir).isDirectory()) continue;

    // Prefer the file recorded in the manifest, else scan the folder.
    let candidates = [];
    const manifestPath = path.join(dir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (manifest?.videoFile) candidates.push(manifest.videoFile);
      } catch {
        /* ignore malformed manifest, fall back to scan */
      }
    }
    if (candidates.length === 0) {
      candidates = fs.readdirSync(dir).filter((f) => VIDEO_RE.test(f));
    }

    for (const file of candidates) {
      const m = file.match(VIDEO_RE);
      if (!m) continue;
      if (prefixFilter && !file.includes(prefixFilter)) continue;
      const full = path.join(dir, file);
      if (!fs.existsSync(full)) continue;
      chunks.push({
        file: full,
        name: file,
        start: tokenToSeconds(m[1]),
        end: tokenToSeconds(m[2]),
        ext: m[3].toLowerCase(),
      });
    }
  }
  // Sort by start time, then end time.
  chunks.sort((a, b) => a.start - b.start || a.end - b.end);
  return chunks;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectId) {
    console.error('Usage: node scripts/stitch-chunks.mjs <projectId> [--prefix <substr>] [--out <file>] [--reencode]');
    process.exit(1);
  }

  const projectDir = path.join(PROJECTS_DIR, args.projectId);
  const exportsDir = path.join(projectDir, 'exports');
  const chunks = findChunks(exportsDir, args.prefix);

  if (chunks.length === 0) {
    console.error(`No chunk videos found in ${exportsDir}${args.prefix ? ` matching "${args.prefix}"` : ''}.`);
    process.exit(1);
  }

  // Warn if the chunk extensions differ (concat -c copy needs matching codecs).
  const exts = new Set(chunks.map((c) => c.ext));
  if (exts.size > 1 && !args.reencode) {
    console.warn(`⚠️  Mixed container types (${[...exts].join(', ')}). Consider --reencode.`);
  }

  console.log(`Found ${chunks.length} chunk(s) for "${args.projectId}":`);
  let prevEnd = null;
  for (const c of chunks) {
    const gap = prevEnd !== null ? c.start - prevEnd : 0;
    const gapNote = Math.abs(gap) > 0.5 ? `  (⚠️ ${gap > 0 ? 'gap' : 'overlap'} ${Math.abs(gap).toFixed(2)}s vs prev)` : '';
    console.log(`  ${c.start.toFixed(2).padStart(9)}s → ${c.end.toFixed(2).padStart(9)}s  ${c.name}${gapNote}`);
    prevEnd = c.end;
  }

  const outExt = args.reencode ? 'mp4' : chunks[0].ext;
  const outFile = path.resolve(args.out || path.join(exportsDir, `${args.projectId}-full.${outExt}`));

  // Build a concat list file (absolute paths, escaped single quotes).
  const listPath = path.join(exportsDir, `.stitch-list-${Date.now()}.txt`);
  const listBody = chunks
    .map((c) => `file '${c.file.replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(listPath, listBody + '\n');

  const ffArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath];
  if (args.reencode) {
    ffArgs.push('-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '320k');
  } else {
    ffArgs.push('-c', 'copy');
  }
  ffArgs.push(outFile);

  console.log(`\nStitching → ${outFile}\n`);
  try {
    await runFfmpeg(ffArgs);
    console.log(`\n✅ Done: ${outFile}`);
  } finally {
    fs.unlinkSync(listPath);
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message ?? err}`);
  process.exit(1);
});
