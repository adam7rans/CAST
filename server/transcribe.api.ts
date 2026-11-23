import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { guardChildDiskSpace } from './diskSpace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate scripts/parakeet_transcribe.py by walking up from this file. The depth
 * of server/ varies between the dev server and a bundled build, so searching is
 * more robust than assuming a fixed number of parent levels.
 */
function findScript(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'scripts', 'parakeet_transcribe.py');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate scripts/parakeet_transcribe.py above ${__dirname}`);
}

const SCRIPT_PATH = findScript();

/** Repo root, found by walking up to the directory that holds scripts/. */
const REPO_ROOT = path.dirname(path.dirname(SCRIPT_PATH));

/**
 * Python interpreter used to run the local Parakeet model. MLX needs a 3.11+
 * interpreter with mlx_audio installed. Cast's own venv wins if present;
 * otherwise fall back to a shared one, overridable via the environment.
 */
const PYTHON_CANDIDATES = [
  process.env.CAST_PARAKEET_PYTHON,
  path.join(REPO_ROOT, '.venv', 'bin', 'python3'),
  path.join(process.env.HOME ?? '', '.observer_data/helpers/.venv/bin/python3'),
].filter((p): p is string => !!p);

export function resolvePython(): string {
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* keep looking */ }
  }
  throw new Error(
    'No Python interpreter found for local Parakeet transcription. ' +
    "Run scripts/setup-parakeet.sh to create CAST's environment, or set " +
    'CAST_PARAKEET_PYTHON to an interpreter that has mlx_audio installed.',
  );
}

/** Transcription child processes by the project folder they work in, so deleting a project can stop them. */
const runningJobs = new Map<ChildProcess, string>();

function trackJob(proc: ChildProcess, dir: string) {
  runningJobs.set(proc, dir);
  proc.once('exit', () => runningJobs.delete(proc));
  proc.once('error', () => runningJobs.delete(proc));
}

/** Stop every transcription process working inside `dir`. Returns how many were signalled. */
export function cancelTranscriptionJobs(dir: string): number {
  let count = 0;
  for (const [proc, jobDir] of runningJobs) {
    if (jobDir !== dir) continue;
    proc.kill('SIGTERM');
    count += 1;
  }
  return count;
}

export interface ParakeetRun {
  transcript: any;
}

/**
 * Run the local Parakeet transcriber over `audioPath`, streaming progress to
 * `onProgress`. Resolves with the parsed CAST-shaped transcript.
 */
export function runParakeet(
  audioPath: string,
  onProgress: (message: string) => void,
  extraArgs: string[] = [],
): Promise<ParakeetRun> {
  return new Promise((resolve, reject) => {
    const proc = spawn(resolvePython(), [SCRIPT_PATH, audioPath, ...extraArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    trackJob(proc, path.dirname(audioPath));
    const diskStop = guardChildDiskSpace(proc, path.dirname(audioPath), 'Transcription');

    let stdout = '';
    let stderrTail = '';
    proc.stdout.on('data', (buf) => { stdout += buf.toString(); });
    // Progress lines are the script's own logging; keep the tail for errors.
    proc.stderr.on('data', (buf) => {
      const text = buf.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      for (const line of text.split('\n')) {
        const clean = line.replace(/\r/g, '').trim();
        // Skip tqdm/progress-bar noise from the model download.
        if (clean && !/\d+%\|/.test(clean) && !/it\/s\]/.test(clean)) onProgress(clean);
      }
    });

    proc.on('error', (err) => reject(new Error(`Parakeet failed to start: ${err.message}`)));
    proc.on('close', (code) => {
      const stopped = diskStop();
      if (stopped) {
        reject(new Error(stopped));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Parakeet exited ${code}: ${stderrTail.trim() || 'no output'}`));
        return;
      }
      try {
        resolve({ transcript: JSON.parse(stdout) });
      } catch {
        reject(new Error(`Parakeet returned unreadable JSON: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

export function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', videoPath,
      '-vn', '-c:a', 'aac', '-b:a', '128k', audioPath,
    ]);
    trackJob(proc, path.dirname(audioPath));
    const diskStop = guardChildDiskSpace(proc, path.dirname(audioPath), 'Audio extraction');
    proc.on('close', (code) => {
      const stopped = diskStop();
      if (stopped) reject(new Error(stopped));
      else if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}`));
    });
    proc.on('error', reject);
  });
}
