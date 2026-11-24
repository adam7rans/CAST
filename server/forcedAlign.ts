import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolvePython, trackJob } from './transcribe.api.js';

/**
 * Word-exact timing (forced alignment) via scripts/forced_align.py: a wav2vec2
 * model re-times the words Parakeet found. Returns null when the model isn't
 * installed (scripts/setup-aligner.sh) or alignment fails, so callers can fall
 * back to loudness-only alignment.
 */
export interface ForcedAlignResult { words: Array<{ start: number; end: number }>; aligned: number; pieces: number; fallbacks: number }

const MODEL_DIR = process.env.CAST_ALIGN_MODEL_DIR || path.join(os.homedir(), '.cache/cast/models/wav2vec2-base-960h');

function findScript(): string | null {
  let dir = path.dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'scripts', 'forced_align.py');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

export function forcedAlignAvailable(): boolean {
  return fs.existsSync(path.join(MODEL_DIR, 'model_quantized.onnx')) && !!findScript();
}

export function forcedAlign(
  audioFile: string,
  words: Array<{ text: string; start: number; end: number }>,
  onProgress?: (message: string) => void,
): Promise<ForcedAlignResult | null> {
  const script = findScript();
  if (!script || !forcedAlignAvailable() || words.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(resolvePython(), ['-I', script, audioFile], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      return resolve(null);
    }
    trackJob(proc, path.dirname(audioFile));
    let out = '';
    let errTail = '';
    proc.stdout.on('data', (b: Buffer) => { out += b.toString(); });
    proc.stderr.on('data', (b: Buffer) => {
      const text = b.toString();
      errTail = (errTail + text).slice(-2000);
      for (const line of text.split('\n')) if (line.trim()) onProgress?.(line.trim());
    });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) { console.warn('[align] forced alignment failed:', errTail.trim()); return resolve(null); }
      try {
        const result = JSON.parse(out) as ForcedAlignResult;
        resolve(result.words?.length === words.length ? result : null);
      } catch {
        resolve(null);
      }
    });
    proc.stdin.end(JSON.stringify(words.map((w) => ({ text: w.text, start: w.start, end: w.end }))));
  });
}
