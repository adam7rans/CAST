import { Router } from 'express';
import { spawn } from 'node:child_process';
import { readProject } from '../helpers.js';
import { chooseChapters, generateChapters, readChosen, youtubeBlock } from './finalize.chapters.js';
import { exportsPath, finalizeStatus, jsonPath, projectExists, readJson, writeJson, type Chapter, type Version } from './finalize.data.js';
import { stitchChunks } from './finalize.stitch.js';

export const finalizeRoutes = Router();
type Meta = { title: string; template: string };
const defaultTemplate = 'New episode is live!\n\nChapters:\n{chapters}';
const route = (id: string) => projectExists(id);
function ready(id: string) {
  const status = finalizeStatus(id);
  if (!status.coverage.complete) throw new Error('Complete all chunk exports before finalizing');
  if (!status.stitched.exists || status.stitched.stale || !status.receipt) throw new Error('Stitch the current chunks first');
  return status;
}
export function description(id: string, fingerprint: string) {
  const saved = readJson<Meta>(jsonPath(id, 'youtube-meta.json'));
  const title = saved?.title || readProject(id)?.name || id;
  const template = saved?.template ?? defaultTemplate;
  const chosen = readChosen(id, fingerprint);
  const block = chosen ? youtubeBlock(chosen.chapters) : '';
  const preview = template.includes('{chapters}')
    ? template.replaceAll('{chapters}', block)
    : `${template.trim()}\n\nChapters:\n${block}`;
  return { title, template, preview, saved: !!saved };
}

finalizeRoutes.get('/:id/finalize/status', (req, res) => {
  if (!route(req.params.id)) return void res.status(404).json({ error: 'Project not found' });
  const { receipt, chunksInternal, ...publicStatus } = finalizeStatus(req.params.id);
  res.json(publicStatus);
});

finalizeRoutes.post('/:id/finalize/stitch', async (req, res) => {
  const id = req.params.id;
  if (!route(id)) return void res.status(404).json({ error: 'Project not found' });
  const status = finalizeStatus(id);
  if (!status.coverage.complete) return void res.status(409).json({ error: 'Chunk coverage has gaps or missing exports' });
  try { res.json(await stitchChunks(id, req.body?.outName)); }
  catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Stitch failed' }); }
});

finalizeRoutes.get('/:id/finalize/chapters', (req, res) => {
  const id = req.params.id;
  if (!route(id)) return void res.status(404).json({ error: 'Project not found' });
  try {
    const status = ready(id);
    res.json(generateChapters(id, status.receipt!.fingerprint));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Chapter generation failed' }); }
});

finalizeRoutes.get('/:id/finalize/chapters/chosen', (req, res) => {
  const id = req.params.id;
  if (!route(id)) return void res.status(404).json({ error: 'Project not found' });
  const status = finalizeStatus(id);
  const chosen = status.receipt && !status.stitched.stale ? readChosen(id, status.receipt.fingerprint) : null;
  res.json(chosen ? { ...chosen, youtubeBlock: youtubeBlock(chosen.chapters) } : { chapters: null });
});

finalizeRoutes.post('/:id/finalize/chapters/choose', (req, res) => {
  const id = req.params.id;
  if (!route(id)) return void res.status(404).json({ error: 'Project not found' });
  try {
    const status = ready(id);
    res.json(chooseChapters(id, req.body?.version as Version, req.body?.edits as Chapter[] | undefined,
      status.receipt!.fingerprint, status.receipt!.duration));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Could not choose chapters' }); }
});

finalizeRoutes.get('/:id/finalize/description', (req, res) => {
  const id = req.params.id;
  if (!route(id)) return void res.status(404).json({ error: 'Project not found' });
  const status = finalizeStatus(id);
  res.json(description(id, status.receipt?.fingerprint || ''));
});

finalizeRoutes.post('/:id/finalize/description', (req, res) => {
  const id = req.params.id;
  if (!route(id)) return void res.status(404).json({ error: 'Project not found' });
  try { ready(id); } catch (error) { return void res.status(409).json({ error: (error as Error).message }); }
  const title = String(req.body?.title || '').trim(), template = String(req.body?.template || '').trim();
  if (!title || title.length > 100 || !template || template.length > 4900) {
    return void res.status(400).json({ error: 'Title must be 1–100 characters; description template must be 1–4900 characters' });
  }
  writeJson(jsonPath(id, 'youtube-meta.json'), { title, template });
  const status = finalizeStatus(id);
  res.json({ ok: true, ...description(id, status.receipt!.fingerprint) });
});

finalizeRoutes.post('/:id/finalize/open', (req, res) => {
  const id = req.params.id;
  if (!route(id)) return void res.status(404).json({ error: 'Project not found' });
  const folder = exportsPath(id);
  const child = spawn(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open', [folder]);
  child.on('error', () => res.status(500).json({ error: 'Could not reveal exports folder' }));
  child.on('close', code => code === 0 ? res.json({ ok: true }) : res.status(500).json({ error: 'Could not reveal exports folder' }));
});
