import * as fs from 'fs';
import type { RequestHandler, Router } from 'express';
import { PROJECTS_DIR } from '../helpers.js';
import { checkSpace, formatGb, freeBytes, RESERVE_BYTES } from '../diskSpace.js';

/**
 * Import-time disk checks. The client asks `/disk-check` before uploading so a
 * file that won't fit is refused before any bytes move; the upload middleware
 * is a backstop for clients that skip that step.
 */
export function registerDiskCheckRoute(router: Router) {
  router.get('/:id/disk-check', (req, res) => {
    const bytes = Math.max(0, Number(req.query.bytes) || 0);
    const space = checkSpace(PROJECTS_DIR, bytes, 'import this file');
    res.json({ ...space, reserveBytes: RESERVE_BYTES });
  });
}

/** Reject an upload whose declared size would leave too little free space. */
export function requireUploadSpace(action: string): RequestHandler {
  return (req, res, next) => {
    const declared = Number(req.headers['content-length']) || 0;
    const space = checkSpace(PROJECTS_DIR, declared, action);
    if (space.ok) return next();
    res.setHeader('Connection', 'close');
    res.status(507).json({ error: space.message });
    req.resume();
  };
}

/**
 * Moving within the same volume is a rename and needs no extra space; moving
 * from another volume (an external drive) copies the whole file first.
 */
export function nativeImportSpaceError(sourcePath: string): string | null {
  try {
    const source = fs.statSync(sourcePath);
    const sameVolume = source.dev === fs.statSync(PROJECTS_DIR).dev;
    const space = checkSpace(PROJECTS_DIR, sameVolume ? 0 : source.size, 'import this file');
    return space.ok ? null : space.message ?? null;
  } catch {
    return null;
  }
}

export function logDiskSpaceAtStartup() {
  const free = freeBytes(PROJECTS_DIR);
  if (free !== null && free < RESERVE_BYTES) {
    console.warn(`[disk] Only ${formatGb(free)} free; imports and background media jobs will be refused below ${formatGb(RESERVE_BYTES)}.`);
  }
}
