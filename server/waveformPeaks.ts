import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Waveform peaks for the timeline: the loudest sample in every 10 ms bin,
 * scaled to 0–255. ffmpeg decodes the audio at 24 kHz mono and streams it, so a
 * 70-minute video needs a few seconds and almost no memory. (8 kHz was too low:
 * it drops everything above 4 kHz, which is most of an "s" or "sh", so hissy
 * word endings looked like silence.) the result (about
 * 400 KB) is cached beside the media and rebuilt when the media changes.
 */
export const PEAKS_PER_SECOND = 100;
const SAMPLE_RATE = 24000;
const SAMPLES_PER_BIN = SAMPLE_RATE / PEAKS_PER_SECOND;
const CACHE_FILE = '.peaks.bin';
const CACHE_META = '.peaks.json';

function mediaKey(file: string): string {
  const stat = fs.statSync(file);
  return `${path.basename(file)}:${stat.size}:${Math.round(stat.mtimeMs)}`;
}

/** Decode `file`'s peaks without caching (e.g. a temporary audio file). */
export function decodePeaks(file: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file,
      '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const peaks: number[] = [];
    let binMax = 0;
    let binCount = 0;
    let carry: Buffer | null = null;
    proc.stdout.on('data', (chunk: Buffer) => {
      const data = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = data.length - (data.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const v = Math.abs(data.readInt16LE(i));
        if (v > binMax) binMax = v;
        if (++binCount === SAMPLES_PER_BIN) {
          peaks.push(Math.min(255, Math.round((binMax / 32768) * 255)));
          binMax = 0;
          binCount = 0;
        }
      }
      carry = usable < data.length ? data.subarray(usable) : null;
    });
    let errors = '';
    proc.stderr.on('data', (chunk: Buffer) => { errors = (errors + chunk.toString()).slice(-2000); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(errors.trim() || `ffmpeg exited ${code}`));
      if (binCount > 0) peaks.push(Math.min(255, Math.round((binMax / 32768) * 255)));
      resolve(Buffer.from(peaks));
    });
  });
}

const jobs = new Map<string, Promise<Buffer>>();

/** Cached peaks for `file`, stored in `dir`; computed once per media version. */
export function waveformPeaks(dir: string, file: string): Promise<Buffer> {
  const key = mediaKey(file);
  const cacheFile = path.join(dir, CACHE_FILE);
  const metaFile = path.join(dir, CACHE_META);
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { key?: string; rate?: number; sampleRate?: number };
    if (meta.key === key && meta.rate === PEAKS_PER_SECOND && meta.sampleRate === SAMPLE_RATE) return Promise.resolve(fs.readFileSync(cacheFile));
  } catch {}
  const running = jobs.get(cacheFile);
  if (running) return running;
  const job = decodePeaks(file).then((peaks) => {
    try {
      fs.writeFileSync(cacheFile, peaks);
      fs.writeFileSync(metaFile, JSON.stringify({ key, rate: PEAKS_PER_SECOND, sampleRate: SAMPLE_RATE }));
    } catch {}
    return peaks;
  }).finally(() => jobs.delete(cacheFile));
  jobs.set(cacheFile, job);
  return job;
}
