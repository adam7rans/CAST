import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { captionPath, projectDir, readProject } from '../helpers.js';

export interface KeptSegment { srcStart: number; srcEnd: number }
export interface Chunk {
  exportId: string; start: number; end: number; videoFile: string;
  size: number; status: 'complete'; file: string; completedAt: string;
  keptSegments: KeptSegment[]; exportMode?: string;
}
export interface Chapter { start: number; title: string; summary?: string; sourceStart?: number }
export type Version = 'sparse' | 'balanced' | 'dense';
export interface Receipt { outputFile: string; chunkIds: string[]; createdAt: string; duration: number; fingerprint: string; reencoded?: boolean }

const VIDEO_RE = /_(\d\dh\d\dm\d\ds\d\d)-(\d\dh\d\dm\d\ds\d\d)\.(mp4|mov|webm)$/i;
const tokenSeconds = (value: string) => {
  const m = value.match(/(\d\d)h(\d\d)m(\d\d)s(\d\d)/i);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 100 : NaN;
};
export function projectExists(id: string) {
  return /^[a-zA-Z0-9_-]+$/.test(id) && !!readProject(id);
}
export function exportsPath(id: string) { return path.join(projectDir(id), 'exports'); }
export function jsonPath(id: string, name: string) { return path.join(exportsPath(id), name); }
export function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return null; }
}
export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
export function discoverChunks(id: string): Chunk[] {
  const dir = exportsPath(id);
  if (!fs.existsSync(dir)) return [];
  const chunks: Chunk[] = [];
  for (const exportId of fs.readdirSync(dir)) {
    const folder = path.join(dir, exportId);
    if (!fs.statSync(folder).isDirectory()) continue;
    const manifest = readJson<Record<string, any>>(path.join(folder, 'manifest.json'));
    if (manifest?.status !== 'complete' || typeof manifest.videoFile !== 'string') continue;
    if (path.basename(manifest.videoFile) !== manifest.videoFile) continue;
    const match = manifest.videoFile.match(VIDEO_RE);
    if (!match) continue;
    const file = path.join(folder, manifest.videoFile);
    if (!fs.existsSync(file)) continue;
    const start = tokenSeconds(match[1]), end = tokenSeconds(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    chunks.push({
      exportId, start, end, videoFile: manifest.videoFile, file,
      size: fs.statSync(file).size, status: 'complete', completedAt: manifest.completedAt || '',
      keptSegments: Array.isArray(manifest.keptSegments) ? manifest.keptSegments.filter(
        (s: any) => Number.isFinite(s.srcStart) && Number.isFinite(s.srcEnd) && s.srcEnd > s.srcStart,
      ) : [],
      exportMode: manifest.exportMode,
    });
  }
  return chunks.sort((a, b) => a.start - b.start || a.end - b.end);
}
export function sourceFingerprint(id: string, chunks: Chunk[]) {
  const settings = path.join(projectDir(id), 'settings.json');
  const saved = readJson<Record<string, any>>(settings) || {};
  // The app autosaves UI state on project load, so file mtime alone would make every stitch stale.
  const skips = { customCuts: saved.customCuts, customCutsClearedAt: saved.customCutsClearedAt,
    jumpCuts: saved.jumpCuts, fullChunkOverrides: saved.ui?.fullChunkOverrides };
  const skipHash = createHash('sha256').update(JSON.stringify(skips)).digest('hex');
  return JSON.stringify({ chunks: chunks.map(c => [c.exportId, c.completedAt, c.size]), skipHash });
}
function transcriptEnd(id: string) {
  const data = readJson<{ utterances?: Array<{ end?: number }> }>(captionPath(id));
  return Math.max(0, ...(data?.utterances || []).map(u => (u.end || 0) / 1000));
}
export function finalizeStatus(id: string) {
  const chunks = discoverChunks(id);
  const gaps: Array<{ start: number; end: number; seconds: number }> = [];
  if (chunks[0]?.start > 0.5) gaps.push({ start: 0, end: chunks[0].start, seconds: chunks[0].start });
  for (let i = 1; i < chunks.length; i++) {
    const seconds = chunks[i].start - chunks[i - 1].end;
    if (seconds > 0.5) gaps.push({ start: chunks[i - 1].end, end: chunks[i].start, seconds });
  }
  const spanEnd = Math.max(transcriptEnd(id), chunks.at(-1)?.end || 0);
  const expected = spanEnd ? Math.ceil((spanEnd - 0.5) / 300) : 0;
  const lastEnd = chunks.at(-1)?.end || 0;
  if (spanEnd - lastEnd > 0.5) gaps.push({ start: lastEnd, end: spanEnd, seconds: spanEnd - lastEnd });
  const receipt = readJson<Receipt>(jsonPath(id, 'finalize.json'));
  const outputFile = receipt?.outputFile || `${id}-full-youtube.mp4`;
  const output = path.join(exportsPath(id), outputFile);
  const exists = path.basename(outputFile) === outputFile && fs.existsSync(output);
  const stale = !receipt || receipt.fingerprint !== sourceFingerprint(id, chunks)
    || (exists && chunks.some(c => Date.parse(c.completedAt) > fs.statSync(output).mtimeMs));
  return {
    chunks: chunks.map(({ file, completedAt, keptSegments, exportMode, ...publicChunk }) => publicChunk),
    coverage: { complete: chunks.length > 0 && gaps.length === 0 && chunks.length >= expected,
      expected, found: chunks.length, gaps, totalSpan: [0, spanEnd] },
    stitched: { exists, path: exists ? `exports/${outputFile}` : null,
      size: exists ? fs.statSync(output).size : 0, duration: receipt?.duration || 0, stale: !exists || stale },
    receipt, chunksInternal: chunks,
  };
}
