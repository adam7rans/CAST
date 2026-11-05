import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { hasCaption, projectDir, readProject, readSettings } from './helpers.js';

const execFileAsync = promisify(execFile);
const THUMBNAIL_FILE = '.thumbnail.jpg';
/** Rendered preview (shaders, captions) captured by the app; preferred over the raw frame. */
export const PREVIEW_FILE = '.preview.jpg';

function previewKey(id: string): string | null {
  try { return `preview:${Math.round(fs.statSync(path.join(projectDir(id), PREVIEW_FILE)).mtimeMs)}`; } catch { return null; }
}
const PROBE_CACHE_FILE = '.probe-cache.json';

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  mediaType: 'video' | 'audio' | null;
  mediaName: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasTranscript: boolean;
  musicTrackCount: number;
  musicClipCount: number;
  cutCount: number;
  exportCount: number;
  sizeBytes: number;
  hasThumbnail: boolean;
  thumbnailKey: string | null;
  processing: boolean;
  /** Path of an original still outside the project folder (never deleted with it). */
  linkedFrom: string | null;
}

type Probe = { key: string; durationSec: number | null; width: number | null; height: number | null };

/** Total bytes under `dir`, following no symlinks. */
export function folderBytes(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += folderBytes(full);
    else if (entry.isFile()) {
      try { total += fs.statSync(full).size; } catch {}
    }
  }
  return total;
}

function fileKey(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    return `${path.basename(file)}:${stat.size}:${Math.round(stat.mtimeMs)}`;
  } catch {
    return null;
  }
}

/** Duration and frame size, cached beside the media until the file changes. */
async function probeMedia(dir: string, file: string): Promise<Probe | null> {
  const key = fileKey(file);
  if (!key) return null;
  const cachePath = path.join(dir, PROBE_CACHE_FILE);
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as Probe;
    if (cached.key === key) return cached;
  } catch {}
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file,
    ]);
    const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
    const video = data.streams?.find((s) => s.codec_type === 'video');
    const duration = Number(data.format?.duration);
    const probe: Probe = {
      key,
      durationSec: Number.isFinite(duration) ? duration : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
    };
    try { fs.writeFileSync(cachePath, JSON.stringify(probe)); } catch {}
    return probe;
  } catch {
    return { key, durationSec: null, width: null, height: null };
  }
}

function mediaPath(id: string): { file: string; type: 'video' | 'audio' } | null {
  const proj = readProject(id);
  if (!proj) return null;
  const dir = projectDir(id);
  if (proj.videoFile && fs.existsSync(path.join(dir, proj.videoFile))) return { file: path.join(dir, proj.videoFile), type: 'video' };
  if (proj.linkedSource && fs.existsSync(proj.linkedSource.path)) return { file: proj.linkedSource.path, type: 'video' };
  if (proj.audioFile && fs.existsSync(path.join(dir, proj.audioFile))) return { file: path.join(dir, proj.audioFile), type: 'audio' };
  return null;
}

export async function summarizeProject(id: string): Promise<ProjectSummary | null> {
  const proj = readProject(id);
  if (!proj) return null;
  const dir = projectDir(id);
  const settings = readSettings(id, proj) as Record<string, any>;
  const media = mediaPath(id);
  const probe = media ? await probeMedia(dir, media.file) : null;
  const musicTracks = Array.isArray(proj.musicFiles)
    ? proj.musicFiles.filter((asset) => fs.existsSync(path.join(dir, asset.filename))).length
    : proj.musicFile && fs.existsSync(path.join(dir, proj.musicFile)) ? 1 : 0;
  let exportCount = 0;
  try {
    exportCount = fs.readdirSync(path.join(dir, 'exports'), { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {}
  return {
    id,
    name: proj.name || id,
    createdAt: proj.createdAt,
    updatedAt: proj.updatedAt,
    mediaType: media?.type ?? null,
    mediaName: media?.type === 'video' ? proj.originalVideoName || proj.videoFile || null
      : media?.type === 'audio' ? proj.originalAudioName || proj.audioFile || null : null,
    durationSec: probe?.durationSec ?? null,
    width: probe?.width ?? null,
    height: probe?.height ?? null,
    hasTranscript: hasCaption(id, proj),
    musicTrackCount: musicTracks,
    musicClipCount: Array.isArray(settings.musicTimelineClips) ? settings.musicTimelineClips.length : 0,
    cutCount: Array.isArray(settings.customCuts) ? settings.customCuts.length : 0,
    exportCount,
    sizeBytes: folderBytes(dir),
    hasThumbnail: !!previewKey(id) || media?.type === 'video',
    thumbnailKey: previewKey(id) ?? (media?.type === 'video' ? probe?.key ?? null : null),
    processing: proj.videoOptimization?.status === 'pending',
    linkedFrom: proj.linkedSource ? path.dirname(proj.linkedSource.path) : null,
  };
}

const thumbnailJobs = new Map<string, Promise<string | null>>();

/** The captured preview if there is one, else a raw JPEG frame from the video (regenerated when it changes). */
export function projectThumbnail(id: string): Promise<string | null> {
  const running = thumbnailJobs.get(id);
  if (running) return running;
  const job = (async () => {
    const preview = path.join(projectDir(id), PREVIEW_FILE);
    if (fs.existsSync(preview)) return preview;
    const media = mediaPath(id);
    if (media?.type !== 'video') return null;
    const out = path.join(projectDir(id), THUMBNAIL_FILE);
    try {
      if (fs.statSync(out).mtimeMs >= fs.statSync(media.file).mtimeMs) return out;
    } catch {}
    const probe = await probeMedia(projectDir(id), media.file);
    const at = Math.min(30, Math.max(0, (probe?.durationSec ?? 0) * 0.1));
    const temp = `${out}.${process.pid}.tmp.jpg`;
    try {
      await execFileAsync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', at.toFixed(2), '-i', media.file,
        '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', temp,
      ]);
      fs.renameSync(temp, out);
      return out;
    } catch {
      try { fs.unlinkSync(temp); } catch {}
      return null;
    }
  })().finally(() => thumbnailJobs.delete(id));
  thumbnailJobs.set(id, job);
  return job;
}
