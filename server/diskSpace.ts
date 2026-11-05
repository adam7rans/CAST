import * as fs from 'fs';
import type { ChildProcess } from 'child_process';

/**
 * Disk-space guards for heavy media work.
 *
 * Why a large reserve: importing copies the whole source file, transcription
 * loads a speech model into memory, and compression writes a second copy of
 * the video. On a 16 GB Mac the model pushes macOS into swap, and swap files
 * live on the same disk. When the disk is nearly full, macOS cannot grow swap
 * and the whole machine hangs. This happened on 2026-11-05 with a 4.8 GB import
 * on a disk with ~5 GB free. So every heavy step must leave RESERVE free after
 * its own writes, and running jobs are stopped if free space drops below FLOOR.
 */
/** Decimal gigabytes, matching what Finder shows. */
const GB = 1e9;

function envGb(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value * GB : fallback;
}

/** Free space that must remain after a step finishes writing. */
export const RESERVE_BYTES = envGb('CAST_MIN_FREE_GB', 10 * GB);
/**
 * Smaller reserve for jobs that only write files (video compression). They use
 * little memory, so they don't need swap headroom; the watchdog still guards them.
 */
export const WRITE_RESERVE_BYTES = envGb('CAST_MIN_FREE_WRITE_GB', 5 * GB);
/** A running job is stopped when free space drops below this. */
export const FLOOR_BYTES = envGb('CAST_ABORT_FREE_GB', 4 * GB);

export const formatGb = (bytes: number) => `${(bytes / GB).toFixed(1)} GB`;

/** Free bytes on the volume holding `dir`, or null if the platform can't say. */
export function freeBytes(dir: string): number | null {
  try {
    const stat = fs.statfsSync(dir);
    return Number(stat.bavail) * Number(stat.bsize);
  } catch {
    return null;
  }
}

export type SpaceCheck = { ok: boolean; freeBytes: number | null; needBytes: number; message?: string };

/** Can `dir` take `writeBytes` more and still keep `reserve` free? */
export function checkSpace(dir: string, writeBytes: number, action: string, reserve = RESERVE_BYTES): SpaceCheck {
  const free = freeBytes(dir);
  const needBytes = Math.max(0, writeBytes) + reserve;
  if (free === null || free >= needBytes) return { ok: true, freeBytes: free, needBytes };
  return {
    ok: false,
    freeBytes: free,
    needBytes,
    message:
      `Not enough free disk space to ${action}. It needs about ${formatGb(needBytes)} free ` +
      `(${formatGb(writeBytes)} for the files plus ${formatGb(reserve)} kept free so macOS ` +
      `has room for memory swap); this disk has ${formatGb(free)}. Free up space and try again.`,
  };
}

export class LowDiskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LowDiskError';
  }
}

/**
 * Stop `child` if free space on `dir`'s volume drops below FLOOR_BYTES while it
 * runs. Returns a function that reports the stop reason (or null) once the
 * process has exited; the watcher cleans itself up on exit.
 */
export function guardChildDiskSpace(child: ChildProcess, dir: string, label: string): () => string | null {
  let reason: string | null = null;
  const timer = setInterval(() => {
    const free = freeBytes(dir);
    if (free === null || free >= FLOOR_BYTES || reason) return;
    reason = `${label} stopped: free disk space fell to ${formatGb(free)} ` +
      `(below the ${formatGb(FLOOR_BYTES)} safety floor). Free up space and try again.`;
    console.warn(`[disk] ${reason}`);
    child.kill('SIGTERM');
    setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 5000).unref();
  }, 3000);
  timer.unref();
  child.once('exit', () => clearInterval(timer));
  child.once('error', () => clearInterval(timer));
  return () => reason;
}
