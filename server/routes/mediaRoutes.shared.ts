import { execFile } from 'child_process';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import type { Request, Response } from 'express';
import {
  CAPTION_FILE,
  clearCaptions,
  emit,
  projectDir,
  readProject,
  safeAudioFilename,
  safeFilename,
  safeMusicFilename,
  writeProject,
} from '../helpers.js';
import { runAudioTranscriptionPipeline, runTranscriptionPipeline } from '../transcribe.js';
import type { MusicAsset, Project } from '../types.js';
import { cancelVideoOptimization, optimizeImportedVideo } from './mediaOptimization.js';

const execFileAsync = promisify(execFile);
const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.flac',
  '.ogg',
  '.opus',
  '.aac',
]);

export type ImportedMediaFile = {
  filename: string;
  originalname: string;
  path: string;
};

function deleteFileQuiet(filePath: string) {
  try { fs.unlinkSync(filePath); } catch {}
}

export function cleanupReplacedMedia(
  id: string,
  previousFiles: Array<string | undefined>,
  nextFilename: string,
) {
  for (const name of previousFiles) {
    if (!name || name === nextFilename) continue;
    deleteFileQuiet(path.join(projectDir(id), name));
  }
  clearCaptions(id);
}

function updateTranscriptionReady(id: string, importedAt: string) {
  const project = readProject(id);
  if (!project || project.importedAt !== importedAt) return;
  project.captionFile = CAPTION_FILE;
  project.updatedAt = new Date().toISOString();
  writeProject(id, project);
}

export function startVideoTranscription(id: string, filePath: string): Promise<void> {
  const importedAt = readProject(id)?.importedAt;
  if (!importedAt) return Promise.resolve();
  return runTranscriptionPipeline(filePath, projectDir(id), (event) => {
    if (readProject(id)?.importedAt !== importedAt) return;
    emit(id, event);
    if (event.type === 'done') updateTranscriptionReady(id, importedAt);
  });
}

export function finalizeVideoImport(
  id: string,
  project: Project,
  file: ImportedMediaFile,
  res: Response,
) {
  try {
    cancelVideoOptimization(id);
    cleanupReplacedMedia(id, [project.videoFile, project.audioFile], file.filename);

    project.videoFile = file.filename;
    project.originalVideoName = file.originalname;
    project.mediaType = 'video';
    project.importedAt = new Date().toISOString();
    project.updatedAt = project.importedAt;
    delete project.audioFile;
    delete project.originalAudioName;
    delete project.transcriptFile;
    delete project.captionFile;
    delete project.videoOptimizationResult;
    project.videoOptimization = { status: 'pending', sourceFile: file.filename };
    writeProject(id, project);
    emit(id, { type: 'video_saved', message: 'Video imported into project folder' });

    const transcription = startVideoTranscription(id, file.path);
    void transcription.then(() => optimizeImportedVideo(id, file.filename, Promise.resolve()));

    res.json({
      ok: true,
      mediaType: 'video',
      filename: file.filename,
      originalName: file.originalname,
    });
  } catch (err) {
    console.error(`[media] finalizeVideoImport failed for project ${id}:`, err);
    const message = err instanceof Error ? err.message : 'Video import failed';
    res.status(500).json({ error: message });
  }
}

export function finalizeAudioImport(
  id: string,
  project: Project,
  file: ImportedMediaFile,
  res: Response,
) {
  try {
    cancelVideoOptimization(id);
    cleanupReplacedMedia(id, [project.videoFile, project.audioFile], file.filename);

    project.audioFile = file.filename;
    project.originalAudioName = file.originalname;
    project.mediaType = 'audio';
    project.importedAt = new Date().toISOString();
    project.updatedAt = project.importedAt;
    delete project.videoFile;
    delete project.originalVideoName;
    delete project.transcriptFile;
    delete project.captionFile;
    delete project.videoOptimization;
    delete project.videoOptimizationResult;
    writeProject(id, project);
    emit(id, { type: 'video_saved', message: 'Audio imported into project folder' });

    runAudioTranscriptionPipeline(file.path, projectDir(id), (event) => {
      emit(id, event);
      if (event.type === 'done') updateTranscriptionReady(id, project.importedAt!);
    });

    res.json({
      ok: true,
      mediaType: 'audio',
      filename: file.filename,
      originalName: file.originalname,
    });
  } catch (err) {
    console.error(`[media] finalizeAudioImport failed for project ${id}:`, err);
    const message = err instanceof Error ? err.message : 'Audio import failed';
    res.status(500).json({ error: message });
  }
}

export function isAudioPath(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function chooseNativeMediaPath(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    throw new Error('Native transfer import is currently supported on macOS only');
  }

  const script = [
    'try',
    'POSIX path of (choose file with prompt "Choose a video or audio file to move into this project" of type {"public.movie", "public.audio"})',
    'on error number -128',
    'return ""',
    'end try',
  ];
  const args = script.flatMap((line) => ['-e', line]);
  const { stdout } = await execFileAsync('osascript', args);
  return stdout.trim() || null;
}

export function moveFileIntoPlace(sourcePath: string, targetPath: string) {
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return;
  deleteFileQuiet(targetPath);
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV') throw err;
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
}

function projectDiskStorage(
  filenameFor: (file: Express.Multer.File) => string,
) {
  return multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = projectDir(req.params.id as string);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, filenameFor(file)),
  });
}

export const videoUpload = multer({
  storage: projectDiskStorage((file) => `${randomUUID().slice(0, 8)}-${safeFilename(file.originalname)}`),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

export const audioUpload = multer({
  storage: projectDiskStorage((file) => safeAudioFilename(file.originalname)),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

export const musicUpload = multer({
  storage: projectDiskStorage(
    (file) => `${randomUUID().slice(0, 8)}-${safeMusicFilename(file.originalname)}`,
  ),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

export function ensureMusicLibrary(project: Project): MusicAsset[] {
  if (!Array.isArray(project.musicFiles)) {
    project.musicFiles = [];
  }
  if (project.musicFile) {
    const legacyExists = project.musicFiles.some(
      (asset) => asset.filename === project.musicFile,
    );
    if (!legacyExists) {
      project.musicFiles.push({
        id: 'legacy-music',
        filename: project.musicFile,
        originalName: project.originalMusicName || project.musicFile,
      });
    }
  }
  return project.musicFiles;
}

function getAudioMime(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.wav' ? 'audio/wav'
    : ext === '.m4a' ? 'audio/mp4'
    : ext === '.flac' ? 'audio/flac'
    : ext === '.ogg' ? 'audio/ogg'
    : ext === '.opus' ? 'audio/ogg'
    : ext === '.aac' ? 'audio/aac'
    : 'audio/mpeg';
}

export function streamRangedAudio(
  filePath: string,
  filename: string,
  req: Request,
  res: Response,
) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;
  const mime = getAudioMime(filename);

  if (!range) {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const [startString, endString] = range.replace(/bytes=/, '').split('-');
  const start = parseInt(startString, 10);
  const end = endString ? parseInt(endString, 10) : total - 1;
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': mime,
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
}
