import { Router } from 'express';
import { readFile, stat } from 'node:fs/promises';
import { captionPath, readProject } from '../helpers.js';
import { ClipFinderError, publicClipError } from '../clipFinder/errors.js';
import { isValidKey, readStoredKey, saveKey } from '../clipFinder/keyStore.js';
import { providerConfig } from '../clipFinder/provider.js';
import { transcriptUnits, chunkTranscript } from '../clipFinder/transcript.js';
import { discoverClips } from '../clipFinder/discover.js';
import type { ClipDiscoveryEvent } from '../../src/lib/clipCandidates.js';

export const clipFinderRoutes = Router();
const activeProjects = new Set<string>();

function checkOrigin(req: { get(name: string): string | undefined; protocol: string }) {
  const origin = req.get('origin');
  if (origin && ![`${req.protocol}://${req.get('host')}`, 'http://127.0.0.1:5180', 'http://localhost:5180'].includes(origin)) {
    throw new ClipFinderError('forbidden_origin', 'Clip discovery must be started from the CAST app.', 403);
  }
}

clipFinderRoutes.get('/clip-finder/config', (req, res) => {
  checkOrigin(req);
  res.json({ hasKey: Boolean(process.env.OPENAI_API_KEY?.trim() || readStoredKey()) });
});

clipFinderRoutes.post('/clip-finder/key', (req, res) => {
  try {
    checkOrigin(req);
    if (!isValidKey(req.body?.apiKey)) {
      throw new ClipFinderError('invalid_key',
        'That does not look like an OpenAI API key. It should start with "sk-".', 400);
    }
    saveKey(req.body.apiKey);
    res.json({ ok: true });
  } catch (error) {
    const safe = publicClipError(error);
    res.status(safe.status).json({ error: safe.message, code: safe.code });
  }
});

clipFinderRoutes.post('/:id/clip-candidates', async (req, res) => {
  const id = req.params.id;
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.on('close', abort);
  let acquired = false;
  const send = (event: ClipDiscoveryEvent) => {
    if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };
  try {
    checkOrigin(req);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !readProject(id)) {
      throw new ClipFinderError('not_found', 'Project not found.', 404);
    }
    const config = providerConfig();
    if (activeProjects.has(id) || activeProjects.size >= 2) {
      throw new ClipFinderError('busy', 'Clip discovery is already running. Wait or cancel before retrying.', 409);
    }
    activeProjects.add(id);
    acquired = true;
    let raw: unknown = req.body?.transcript;
    if (raw === undefined) try {
      const file = captionPath(id);
      if ((await stat(file)).size > 25_000_000) {
        throw new ClipFinderError('transcript_too_large', 'Transcript exceeds 25 MB. Split the project before discovery.');
      }
      raw = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error instanceof ClipFinderError) throw error;
      throw new ClipFinderError('no_transcript', 'No readable transcript found. Load a timed transcript first.');
    }
    const chunks = chunkTranscript(transcriptUnits(raw));
    controller.signal.throwIfAborted();
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const candidates = await discoverClips(chunks, config, controller.signal, send);
    send({ type: 'complete', candidates, total: chunks.length });
    res.end();
  } catch (error) {
    const safe = publicClipError(error);
    if (!res.destroyed) {
      if (res.headersSent) {
        send({ type: 'error', error: safe.message, code: safe.code });
        res.end();
      } else res.status(safe.status).json({ error: safe.message, code: safe.code });
    }
  } finally {
    if (acquired) activeProjects.delete(id);
    controller.abort();
    res.off('close', abort);
  }
});
