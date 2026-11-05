import { randomUUID } from 'crypto';
import type { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { emit, projectDir, PROJECTS_DIR, readProject, writeProject } from '../helpers.js';
import { checkSpace, formatGb, WRITE_RESERVE_BYTES } from '../diskSpace.js';
import { locateDroppedFile } from '../mediaLocate.js';
import type { Project } from '../types.js';
import { cancelVideoOptimization, encode, probe, videoShape } from './mediaOptimization.js';
import { cleanupReplacedMedia, startVideoTranscription } from './mediaRoutes.shared.js';

/**
 * Drop-to-link import: the dropped video stays where it is (usually
 * ~/Downloads); the project plays it from there while it transcribes, then a
 * compressed copy is written into the project folder and replaces the link.
 * The original is never copied or deleted.
 */

/** The compressed copy is usually far smaller; the disk watchdog covers a bad guess. */
const COMPRESSED_ESTIMATE = 0.5;

/** Where the project's video currently lives: its own file, else the linked original. */
export function projectVideoPath(id: string, proj: Project): string | null {
  if (proj.videoFile) {
    const own = path.join(projectDir(id), proj.videoFile);
    if (fs.existsSync(own)) return own;
  }
  if (proj.linkedSource && fs.existsSync(proj.linkedSource.path)) return proj.linkedSource.path;
  return null;
}

const compressionSpace = (dir: string, size: number) =>
  checkSpace(dir, size * COMPRESSED_ESTIMATE, 'compress this video into the project', WRITE_RESERVE_BYTES);

/**
 * Transcription can leave macOS swap files behind for a while, so a shortage
 * right after it is usually temporary: check every minute and start then.
 */
const RETRY_MS = 60_000;
const waitingForSpace = new Set<string>();

function waitForSpace(id: string, needBytes: number, freeBytes: number | null) {
  if (waitingForSpace.has(id)) return;
  waitingForSpace.add(id);
  emit(id, {
    type: 'video_optimizing',
    message: `Waiting for free space before compressing (needs ${formatGb(needBytes)}, has ${formatGb(freeBytes ?? 0)}). ` +
      'It starts by itself once there is room; the original keeps playing meanwhile.',
  });
  const timer = setInterval(() => {
    const p = readProject(id);
    const stillWaiting = p?.linkedSource && p.videoOptimization?.status === 'pending';
    if (stillWaiting && !compressionSpace(projectDir(id), p.linkedSource!.size).ok) return;
    clearInterval(timer);
    waitingForSpace.delete(id);
    if (stillWaiting) void compressLinkedVideo(id);
  }, RETRY_MS);
  timer.unref();
}

const isCurrent = (id: string, importedAt: string | undefined) => {
  const p = readProject(id);
  return p && p.importedAt === importedAt && p.linkedSource ? p : null;
};

export async function compressLinkedVideo(id: string): Promise<void> {
  const start = readProject(id);
  const link = start?.linkedSource;
  if (!start || !link) return;
  const importedAt = start.importedAt;
  const dir = projectDir(id);
  const temporary = path.join(dir, `.optimizing-${randomUUID()}.mp4`);
  const fail = (message: string) => {
    const p = isCurrent(id, importedAt);
    if (!p) return;
    p.videoOptimization = { status: 'failed', sourceFile: path.basename(link.path), error: message };
    writeProject(id, p);
    emit(id, { type: 'video_optimization_failed', message: `Compression didn't finish; still playing the original from ${path.dirname(link.path)}. ${message}` });
  };
  try {
    if (!fs.existsSync(link.path)) throw new Error('The original file was moved or deleted.');
    const space = compressionSpace(dir, link.size);
    if (!space.ok) {
      const p = isCurrent(id, importedAt);
      if (p && p.videoOptimization?.status !== 'pending') {
        p.videoOptimization = { status: 'pending', sourceFile: path.basename(link.path) };
        writeProject(id, p);
      }
      waitForSpace(id, space.needBytes, space.freeBytes);
      return;
    }
    const sourceInfo = videoShape(await probe(link.path));
    if (!sourceInfo.width || !sourceInfo.height || !Number.isFinite(sourceInfo.duration)) {
      throw new Error('Could not read the source video');
    }
    emit(id, { type: 'video_optimizing', message: 'Compressing the original into the project…' });
    await encode(link.path, temporary, id, sourceInfo.duration);
    const resultInfo = videoShape(await probe(temporary));
    if (resultInfo.width !== sourceInfo.width || resultInfo.height !== sourceInfo.height ||
        resultInfo.audio !== sourceInfo.audio ||
        Math.abs(resultInfo.duration - sourceInfo.duration) > Math.max(2, sourceInfo.duration * 0.001)) {
      throw new Error('Converted video did not pass duration, size, and audio checks');
    }
    const project = isCurrent(id, importedAt);
    if (!project) return;
    const replacement = `optimized-${randomUUID().slice(0, 8)}.mp4`;
    fs.renameSync(temporary, path.join(dir, replacement));
    const optimizedBytes = fs.statSync(path.join(dir, replacement)).size;
    project.videoFile = replacement;
    delete project.linkedSource;
    delete project.videoOptimization;
    project.videoOptimizationResult = { originalBytes: link.size, optimizedBytes, profile: 'bw-crf28' };
    project.updatedAt = new Date().toISOString();
    writeProject(id, project);
    emit(id, {
      type: 'video_optimized',
      message: `Compressed into the project (${Math.round(optimizedBytes / link.size * 100)}% of the original). The original in ${path.basename(path.dirname(link.path))} is untouched.`,
      originalBytes: link.size,
      optimizedBytes,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

function linkVideo(id: string, project: Project, sourcePath: string) {
  cancelVideoOptimization(id);
  cleanupReplacedMedia(id, [project.videoFile, project.audioFile], '');
  const size = fs.statSync(sourcePath).size;
  delete project.videoFile;
  delete project.audioFile;
  delete project.originalAudioName;
  delete project.transcriptFile;
  delete project.captionFile;
  delete project.videoOptimizationResult;
  project.linkedSource = { path: sourcePath, size };
  project.originalVideoName = path.basename(sourcePath);
  project.mediaType = 'video';
  project.importedAt = new Date().toISOString();
  project.updatedAt = project.importedAt;
  project.videoOptimization = { status: 'pending', sourceFile: path.basename(sourcePath) };
  writeProject(id, project);
  emit(id, { type: 'video_saved', message: `Using the original from ${path.basename(path.dirname(sourcePath))} — transcribing, then compressing into the project` });
  // Transcribe first, then compress, so two heavy jobs never run at once.
  void startVideoTranscription(id, sourcePath).then(() => compressLinkedVideo(id));
}

export function registerLinkRoute(router: Router) {
  router.post('/:id/video-link', (req, res) => {
    const id = req.params.id as string;
    const project = readProject(id);
    if (!project) return void res.status(404).json({ error: 'Project not found' });
    const { name, size, lastModified } = (req.body ?? {}) as { name?: string; size?: number; lastModified?: number };
    const sourcePath = locateDroppedFile({ name: String(name ?? ''), size: Number(size), lastModified: Number(lastModified) || undefined });
    if (!sourcePath) return void res.status(404).json({ notFound: true });
    // Transcription scratch plus the compressed copy, with the usual free-space reserve.
    const space = checkSpace(PROJECTS_DIR, Number(size) * COMPRESSED_ESTIMATE, 'import this video');
    if (!space.ok) return void res.status(507).json({ error: space.message });
    try {
      linkVideo(id, project, sourcePath);
      res.json({ ok: true, mediaType: 'video', originalName: path.basename(sourcePath), linkedFrom: path.dirname(sourcePath) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Import failed' });
    }
  });
}

/** After a restart, finish linked imports that were still transcribing or compressing. */
export function resumeLinkedImports() {
  for (const id of fs.readdirSync(PROJECTS_DIR)) {
    const project = readProject(id);
    const lowDiskFailure = project?.videoOptimization?.status === 'failed' &&
      /not enough free disk space/i.test(project.videoOptimization.error ?? '');
    if (!project?.linkedSource || (project.videoOptimization?.status !== 'pending' && !lowDiskFailure)) continue;
    for (const name of fs.readdirSync(projectDir(id))) {
      if (name.startsWith('.optimizing-')) { try { fs.unlinkSync(path.join(projectDir(id), name)); } catch {} }
    }
    const transcription = project.captionFile ? Promise.resolve() : startVideoTranscription(id, project.linkedSource.path);
    void transcription.then(() => compressLinkedVideo(id));
  }
}
