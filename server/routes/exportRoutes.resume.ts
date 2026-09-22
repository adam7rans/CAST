import * as fs from 'fs';
import * as path from 'path';
import { exportDir, projectDir } from '../helpers.js';

const MATCHED_FIELDS = [
  'prefix',
  'width',
  'height',
  'fps',
  'totalFrames',
  'exportMode',
  'preserveAlpha',
  'startTime',
  'duration',
  'baseDuration',
  'outroDuration',
  'musicOutputStartTime',
  'keptSegments',
  'layers',
  'musicTimelineClips',
  'musicSnapshot',
  'limiter',
  'ui',
] as const;

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesRequest(manifest: Record<string, unknown>, request: Record<string, unknown>) {
  if (manifest.status !== 'exporting') return false;
  if (manifest.renderFingerprint && request.renderFingerprint) {
    if (manifest.renderFingerprint !== request.renderFingerprint) return false;
  }
  return MATCHED_FIELDS.every((field) => sameValue(manifest[field], request[field]));
}

function contiguousFrameCount(dir: string, prefix: string) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const framePattern = new RegExp(`^${escapedPrefix}_(\\d{5})\\.png$`, 'i');
  const frameNumbers = fs.readdirSync(dir)
    .map((entry) => framePattern.exec(entry)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .sort((a, b) => a - b);

  for (let index = 0; index < frameNumbers.length; index += 1) {
    if (frameNumbers[index] !== index + 1) return null;
  }
  return frameNumbers.length;
}

export function findResumableExport(projectId: string, request: Record<string, unknown>) {
  const exportsRoot = path.join(projectDir(projectId), 'exports');
  if (!fs.existsSync(exportsRoot)) return null;
  const prefix = String(request.prefix || 'export');
  const candidates = fs.readdirSync(exportsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  let bestMatch: { exportId: string; nextFrame: number; manifest: Record<string, unknown> } | null = null;
  for (const exportId of candidates) {
    const dir = exportDir(projectId, exportId);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!matchesRequest(manifest, request)) continue;
      const nextFrame = contiguousFrameCount(dir, prefix);
      if (nextFrame === null || nextFrame > Number(request.totalFrames)) continue;
      if (!bestMatch || nextFrame > bestMatch.nextFrame) {
        bestMatch = { exportId, nextFrame, manifest };
      }
    } catch {
      // Ignore malformed/incompatible interrupted exports and create a new one.
    }
  }
  if (!bestMatch) return null;
  const manifestPath = path.join(exportDir(projectId, bestMatch.exportId), 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...bestMatch.manifest,
    renderFingerprint: request.renderFingerprint ?? bestMatch.manifest.renderFingerprint,
    resumedAt: new Date().toISOString(),
    resumeCount: Number(bestMatch.manifest.resumeCount || 0) + 1,
  }, null, 2));
  return { exportId: bestMatch.exportId, nextFrame: bestMatch.nextFrame };
}
