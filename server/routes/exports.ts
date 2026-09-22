import { Router } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import {
  exportDir,
  safePngFilename,
  slugify,
  readProject,
  writeProject,
} from '../helpers.js';
import { cleanupExportFrames, stitchVideo } from './exportRoutes.stitch.js';
import { findResumableExport } from './exportRoutes.resume.js';

export const exportRoutes = Router();

// ── routes ────────────────────────────────────────────────────────────────────

// Create export session
exportRoutes.post('/:id/exports', (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj) return void res.status(404).json({ error: 'Not found' });

  const rawPrefix = String(req.body?.prefix || 'export').trim();
  const prefix = slugify(rawPrefix);
  const resumable = findResumableExport(id, { ...req.body, prefix: rawPrefix });
  if (resumable) {
    return void res.json({
      ok: true,
      resumed: true,
      ...resumable,
      folder: `projects/${id}/exports/${resumable.exportId}`,
    });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportId = slugify(`${stamp}-${prefix}`);
  const dir = exportDir(id, exportId);
  fs.mkdirSync(dir, { recursive: true });
  // Fail fast when the disk can't hold the render: ~750KB per PNG frame
  // plus headroom for the stitched output. A mid-render ENOSPC leaves
  // stranded corrupt artifacts and a "stuck" looking client.
  const totalFrames = Number(req.body?.totalFrames) || 0;
  if (totalFrames > 0) {
    try {
      const stat = fs.statfsSync(dir);
      const freeBytes = Number(stat.bavail) * Number(stat.bsize);
      const needBytes = Math.ceil(totalFrames * 750 * 1024 + 512 * 1024 * 1024);
      if (freeBytes < needBytes) {
        const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
        return void res.status(507).json({
          error: `Not enough disk space for this export (need ~${gb(needBytes)}, have ${gb(freeBytes)}). Free space or delete old exports, then retry.`,
        });
      }
    } catch {
      // statfs unavailable on this platform — proceed without the preflight.
    }
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    status: 'exporting',
    createdAt: new Date().toISOString(),
    ...req.body,
  }, null, 2));
  res.json({ ok: true, resumed: false, nextFrame: 0, exportId, folder: `projects/${id}/exports/${exportId}` });
});

const frameUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 128 * 1024 * 1024 },
});

// Upload a single PNG frame
exportRoutes.post('/:id/exports/:exportId/frame', frameUpload.single('frame'), (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj || !req.file) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }

  const eid = slugify(req.params.exportId as string);
  const dir = exportDir(id, eid);
  if (!fs.existsSync(dir)) {
    res.status(404).json({ error: 'Export folder not found' });
    return;
  }
  if (req.file.buffer.length <= 0) {
    res.status(400).json({ error: 'Empty frame upload' });
    return;
  }

  const filename = safePngFilename(String(req.body?.filename || req.file.originalname || 'frame.png'));
  try {
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  } catch (err: any) {
    // A full disk must read as "disk full", not a generic 500.
    if (err?.code === 'ENOSPC') {
      return void res.status(507).json({ error: 'Disk full — frame could not be saved. Free space and resume the export.' });
    }
    throw err;
  }
  res.json({ ok: true, filename });
});

// Finish export — stitch video with FFMPEG
exportRoutes.post('/:id/exports/:exportId/finish', async (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const eid = slugify(req.params.exportId as string);
  const dir = exportDir(id, eid);
  if (!fs.existsSync(dir)) {
    res.status(404).json({ error: 'Export folder not found' });
    return;
  }

  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : {};
  // NOTE: status stays "exporting" until a video file actually exists. An
  // earlier revision marked "complete" up front, which stranded failed
  // stitches as complete-but-videoless and invisible to resume.

  let videoFile = null;
  let stitchError = null;
  let deletedFrames = 0;
  try {
    videoFile = await stitchVideo(id, eid);
    if (videoFile) {
      const updatedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      // Frames are intermediate artifacts; remove them after any successful stitch.
      deletedFrames = cleanupExportFrames(dir);
      fs.writeFileSync(manifestPath, JSON.stringify({
        ...updatedManifest,
        status: 'complete',
        completedAt: new Date().toISOString(),
        videoFile,
        cleanedFramesAt: deletedFrames > 0 ? new Date().toISOString() : updatedManifest.cleanedFramesAt,
        deletedFrameCount: (updatedManifest.deletedFrameCount || 0) + deletedFrames,
      }, null, 2));
    } else {
      throw new Error('Stitch produced no video file');
    }
  } catch (err) {
    console.error('Stitching failed', err);
    stitchError = err instanceof Error ? err.message : String(err);
    const logPath = path.join(dir, 'stitch-error.log');
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${stitchError}\n\n`);
    // Leave the export resumable: frames are intact, only the stitch failed.
    try {
      const failedManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : manifest;
      fs.writeFileSync(manifestPath, JSON.stringify({
        ...failedManifest,
        status: 'exporting',
        lastStitchError: stitchError,
      }, null, 2));
    } catch {}
  }

  if (stitchError) {
    res.json({ ok: false, error: `Video stitching failed: ${stitchError}`, folder: `projects/${id}/exports/${eid}` });
    return;
  }

  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);
  res.json({ ok: true, folder: `projects/${id}/exports/${eid}`, videoFile });
});

// Open a local folder in the OS file explorer
exportRoutes.post('/:id/exports/:exportId/open', (req, res) => {
  const id = req.params.id as string;
  const eid = req.params.exportId as string;
  const dir = path.resolve(exportDir(id, eid));

  console.log(`[shell] Open request for project=${id} export=${eid}`);
  console.log(`[shell] Resolved directory: ${dir}`);

  if (!fs.existsSync(dir)) {
    console.error(`[shell] Directory does not exist: ${dir}`);
    res.status(404).json({ error: 'Folder not found' });
    return;
  }

  const platform = process.platform;
  // NOTE: exec is used intentionally — `open`/`xdg-open` need shell resolution,
  // and `dir` is a server-controlled path derived from the project directory.
  const openCmd = platform === 'win32' ? `start ""` : platform === 'darwin' ? 'open' : 'xdg-open';

  console.log(`[shell] Executing: ${openCmd} "${dir}"`);
  exec(`${openCmd} "${dir}"`, (err) => {
    if (err) {
      console.error('[shell] Failed to open folder:', err);
      res.status(500).json({ error: 'Failed to open folder' });
      return;
    }
    res.json({ ok: true });
  });
});
