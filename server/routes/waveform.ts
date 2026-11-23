import { spawn } from 'child_process';
import type { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { projectDir, readProject } from '../helpers.js';
import { PEAKS_PER_SECOND, waveformPeaks } from '../waveformPeaks.js';
import { projectVideoPath } from './mediaLink.js';

/** The file holding the project's sound: its video (or linked original), else its audio file. */
function projectMediaFile(id: string): string | null {
  const project = readProject(id);
  if (!project) return null;
  const audio = project.audioFile ? path.join(projectDir(id), project.audioFile) : null;
  return projectVideoPath(id, project) ?? (audio && fs.existsSync(audio) ? audio : null);
}

/** GET /:id/peaks — the project's waveform as raw bytes (0–255 per 10 ms). */
export function registerWaveformRoute(router: Router) {
  router.get('/:id/peaks', async (req, res) => {
    const id = req.params.id as string;
    const media = projectMediaFile(id);
    if (!media) return void res.status(404).json({ error: 'No media' });
    try {
      const peaks = await waveformPeaks(projectDir(id), media);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Peaks-Rate', String(PEAKS_PER_SECOND));
      res.setHeader('Cache-Control', 'no-cache');
      res.send(peaks);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not read the audio' });
    }
  });

  /**
   * GET /:id/scrub-audio?start=SEC&dur=SEC — a short stretch of the project's
   * sound as raw mono 16 kHz 16-bit samples (little-endian), for scrubbing the playhead. ffmpeg seeks before decoding,
   * so a clip anywhere in a long video comes back in tens of milliseconds.
   */
  router.get('/:id/scrub-audio', (req, res) => {
    const media = projectMediaFile(req.params.id as string);
    if (!media) return void res.status(404).json({ error: 'No media' });
    const start = Math.max(0, Number(req.query.start) || 0);
    const dur = Math.min(10, Math.max(0.1, Number(req.query.dur) || 4));
    const proc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', start.toFixed(3), '-t', dur.toFixed(3),
      '-i', media, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    proc.stdout.pipe(res);
    proc.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.end(); });
    req.on('close', () => { if (proc.exitCode === null) proc.kill('SIGKILL'); });
  });
}
