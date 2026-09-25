import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REQUIRED_MODULES = ['numpy', 'scipy', 'onnxruntime'];

function hasDeps(python: string): boolean {
  try {
    const r = spawnSync(python, ['-c', `import ${REQUIRED_MODULES.join(', ')}`], {
      timeout: 60_000,
      encoding: 'utf-8',
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Resolve a Python interpreter that can run the analysis scripts.
 *
 * Plain `python3` resolves differently depending on how the server was
 * launched (terminal picks up pyenv with numpy/onnxruntime; the dock
 * launcher gets macOS system Python with nothing installed). So we probe
 * candidates in order and use the first one with the required modules:
 *   1. $CAST_PYTHON (explicit override)
 *   2. ~/.pyenv/shims/python3 (this dev machine's setup)
 *   3. plain `python3`
 *
 * Throws with a human-readable message when nothing qualifies.
 */
export function resolvePython(): string {
  const candidates: string[] = [];
  if (process.env.CAST_PYTHON) candidates.push(process.env.CAST_PYTHON);
  const pyenvShim = path.join(os.homedir(), '.pyenv', 'shims', 'python3');
  try {
    if (fs.existsSync(pyenvShim)) candidates.push(pyenvShim);
  } catch {}
  candidates.push('python3');

  for (const candidate of candidates) {
    if (hasDeps(candidate)) {
      console.log(`[python] using ${candidate} (has ${REQUIRED_MODULES.join(', ')})`);
      return candidate;
    }
  }
  throw new Error(
    `No Python with ${REQUIRED_MODULES.join(', ')} found. Install them ` +
    `(${candidates.join(', ')}) or set CAST_PYTHON to an interpreter that has them.`,
  );
}
