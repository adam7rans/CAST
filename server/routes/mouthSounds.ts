import { Router } from 'express';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { APP_ROOT, projectDir, readProject } from '../helpers.js';

export const mouthSoundsRoutes = Router();

const SCRIPT = path.join(APP_ROOT, 'scripts', 'detect-mouth-sounds.py');

// Analyze a project's media for mouth sounds (coughs, sneezes, throat
// clearing…) with YAMNet and return skip regions. The client merges them
// into customCuts so the normal autosave/guard/backup path applies.
//
// NOTE: this blocks the event loop for the duration of the analysis
// (a few minutes on hour-long media). Deliberate v1 tradeoff: one simple
// synchronous path instead of a job system.
mouthSoundsRoutes.post('/:id/mouth-sounds', (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const mediaFile = proj.videoFile || proj.audioFile;
  if (!mediaFile) {
    res.status(400).json({ error: 'Project has no media to analyze' });
    return;
  }
  const mediaPath = path.join(projectDir(id), mediaFile);
  if (!fs.existsSync(mediaPath)) {
    res.status(404).json({ error: `Media file "${mediaFile}" is missing` });
    return;
  }
  const body = (req.body ?? {}) as { threshold?: unknown; classes?: unknown };
  const threshold = typeof body.threshold === 'number' && body.threshold > 0 && body.threshold < 1
    ? body.threshold
    : 0.3;
  const ALLOWED = ['Cough', 'Sneeze', 'Throat clearing', 'Sniff', 'Snort'];
  const classes = Array.isArray(body.classes)
    ? body.classes.filter((c): c is string => typeof c === 'string' && ALLOWED.includes(c))
    : [...ALLOWED];
  if (classes.length === 0) {
    res.status(400).json({ error: 'Select at least one mouth-sound type' });
    return;
  }
  try {
    const out = execFileSync(
      'python3',
      [SCRIPT, mediaPath, '--threshold', String(threshold), '--classes', classes.join(',')],
      { timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, encoding: 'utf-8' },
    );
    const parsed = JSON.parse(out) as { regions?: unknown[]; meta?: unknown };
    res.json({ ok: true, regions: Array.isArray(parsed.regions) ? parsed.regions : [], meta: parsed.meta ?? {} });
  } catch (e: any) {
    const stderr = typeof e?.stderr === 'string' ? e.stderr.trim().split('\n').slice(-3).join(' ') : '';
    res.status(500).json({ error: `Mouth-sound analysis failed${stderr ? `: ${stderr}` : ''}` });
  }
});
