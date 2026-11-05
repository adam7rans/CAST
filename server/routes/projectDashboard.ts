import express, { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { APP_ROOT, PROJECTS_DIR, projectDir } from '../helpers.js';
import { freeBytes, RESERVE_BYTES } from '../diskSpace.js';
import { folderBytes, PREVIEW_FILE, projectThumbnail, summarizeProject } from '../projectSummary.js';
import { cancelTranscriptionJobs } from '../transcribe.api.js';

/**
 * Dashboard API. Mounted at /api/projects BEFORE the main project routes so
 * `/summaries` is not swallowed by `GET /:id`.
 */
export const projectDashboardRoutes = Router();

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The project's folder, only if `id` names a real project directly inside PROJECTS_DIR. */
function projectFolder(id: string): string | null {
  if (!PROJECT_ID.test(id)) return null;
  const dir = path.resolve(projectDir(id));
  if (path.dirname(dir) !== path.resolve(PROJECTS_DIR)) return null;
  return fs.existsSync(path.join(dir, 'project.json')) ? dir : null;
}

projectDashboardRoutes.get('/summaries', async (_req, res) => {
  const ids = fs.existsSync(PROJECTS_DIR)
    ? fs.readdirSync(PROJECTS_DIR).filter((id) => projectFolder(id))
    : [];
  const summaries = (await Promise.all(ids.map((id) => summarizeProject(id))))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  res.json({ projects: summaries, disk: { freeBytes: freeBytes(PROJECTS_DIR), reserveBytes: RESERVE_BYTES } });
});

projectDashboardRoutes.get('/:id/thumbnail', async (req, res) => {
  if (!projectFolder(req.params.id)) return void res.status(404).end();
  const file = await projectThumbnail(req.params.id);
  if (!file) return void res.status(404).end();
  // The client adds ?v=<video key>, so a changed video gets a new URL.
  // The image files are dot-files so they stay out of the way in Finder; sendFile hides those by default.
  res.sendFile(file, { dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=31536000, immutable' } });
});

/** Store the app's rendered preview (JPEG) as the project's card image. */
projectDashboardRoutes.put('/:id/thumbnail', express.raw({ type: 'image/jpeg', limit: '4mb' }), (req, res) => {
  const dir = projectFolder(req.params.id);
  if (!dir) return void res.status(404).json({ error: 'Project not found' });
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length < 100 || body[0] !== 0xff || body[1] !== 0xd8) {
    return void res.status(400).json({ error: 'Expected a JPEG image' });
  }
  const out = path.join(dir, PREVIEW_FILE);
  const temp = `${out}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, body);
    fs.renameSync(temp, out);
  } catch (err) {
    try { fs.unlinkSync(temp); } catch {}
    const message = err instanceof Error ? err.message : String(err);
    return void res.status(500).json({ error: `Could not save the preview: ${message}` });
  }
  res.json({ ok: true });
});

/** Permanently delete a project: its folder (video, captions, music, exports) and its settings archive. */
projectDashboardRoutes.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const dir = projectFolder(id);
  if (!dir) return void res.status(404).json({ error: 'Project not found' });
  const freedBytes = folderBytes(dir);

  // Stop background work first so nothing keeps writing into the folder.
  if (cancelTranscriptionJobs(dir) > 0) await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return void res.status(500).json({ error: `Could not delete the project folder: ${message}` });
  }
  const archive = path.join(APP_ROOT, 'archive', id);
  if (path.dirname(archive) === path.join(APP_ROOT, 'archive')) {
    try { fs.rmSync(archive, { recursive: true, force: true }); } catch {}
  }
  console.log(`[projects] Deleted "${id}" (${(freedBytes / 1e9).toFixed(2)} GB freed)`);
  res.json({ ok: true, freedBytes });
});
