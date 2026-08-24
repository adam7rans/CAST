import { spawn, type ChildProcess } from 'child_process';
import net from 'net';
import path from 'path';
import fs from 'fs';

/**
 * Supervises the cast-metal binary: ensures it's running when the CAST UI
 * needs it (auto-start on demand), reports status to the panel.
 *
 * The binary is looked up at:
 *   1. cast-metal/.build/release/castmetal
 *   2. cast-metal/.build/debug/castmetal   (dev builds)
 * relative to the CAST repo root. Build once with:
 *   cd cast-metal && swift build -c release
 */

const REPO_ROOT = path.resolve(process.cwd());
const CANDIDATES = [
  path.join(REPO_ROOT, 'cast-metal', '.build', 'release', 'castmetal'),
  path.join(REPO_ROOT, 'cast-metal', '.build', 'debug', 'castmetal'),
];

export const METAL_CONTROL_PORT = 4313;

let proc: ChildProcess | null = null;
let starting = false;

function binaryPath(): string | null {
  for (const p of CANDIDATES) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}

export function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => {
      s.destroy();
      resolve(false);
    });
    setTimeout(() => {
      s.destroy();
      resolve(false);
    }, 1500);
  });
}

/** True if castmetal's control server answers on :4313. */
export async function metalRunning(): Promise<boolean> {
  return portInUse(METAL_CONTROL_PORT);
}

/** Spawn the binary unless already running. Returns error string or null. */
export async function ensureMetalRunning(): Promise<string | null> {
  if (await metalRunning()) return null;
  if (starting) return 'already starting';
  const bin = binaryPath();
  if (!bin) return 'not built — run: cd cast-metal && swift build';

  starting = true;
  try {
    // detached so it survives independent of the node server; log to a file
    // so crashes are diagnosable.
    const logFd = fs.openSync('/tmp/castmetal.log', 'a');
    proc = spawn(bin, [], {
      cwd: REPO_ROOT,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    proc.unref();
    proc.on('exit', () => {
      proc = null;
    });
    // wait for the control port to come up (camera permission can take a beat)
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await metalRunning()) return null;
    }
    return 'started but control port never opened';
  } finally {
    starting = false;
  }
}

/** Stop the supervised instance (only ones we spawned). */
export function stopMetal(): void {
  if (proc) {
    try {
      process.kill(-proc.pid!, 'SIGTERM');
    } catch {
      /* already gone */
    }
    proc = null;
  }
}
