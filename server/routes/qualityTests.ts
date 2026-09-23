import { Router } from 'express';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { exportDir, projectDir, readProject } from '../helpers.js';

export const qualityTestsRoutes = Router();

interface LadderRung {
  key: string;
  label: string;
  detail: string;
  videoArgs: string[];
}

// The quality ladder, cheapest first. Audio is identical on every rung.
const LADDER: LadderRung[] = [
  {
    key: 'current',
    label: 'Current (YouTube)',
    detail: 'CRF 21, 8 Mbps cap — what exports use today',
    videoArgs: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '8000k', '-bufsize', '16000k', '-pix_fmt', 'yuv420p'],
  },
  {
    key: 'mid',
    label: 'Mid (CRF 19, 16M)',
    detail: 'CRF 19, 16 Mbps cap — ~2x size, visibly cleaner grain',
    videoArgs: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '16000k', '-bufsize', '32000k', '-pix_fmt', 'yuv420p'],
  },
  {
    key: 'raw28',
    label: 'High (CRF 18, 28M)',
    detail: 'CRF 18, 28 Mbps cap — the middle ground, ~3.5x size',
    videoArgs: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-maxrate', '28000k', '-bufsize', '56000k', '-pix_fmt', 'yuv420p'],
  },
  {
    key: 'raw',
    label: 'RAW (CRF 18, free)',
    detail: 'CRF 18, no cap — near-transparent, ~6.5x size',
    videoArgs: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p'],
  },
];

const AUDIO_ARGS = ['-c:a', 'aac', '-b:a', '192k'];

function run(cmd: string, args: string[], timeoutMs = 10 * 60 * 1000): string {
  return execFileSync(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf-8' });
}

function probeJson(file: string): any {
  const out = run('ffprobe', [
    '-hide_banner', '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-of', 'json', file,
  ]);
  return JSON.parse(out);
}

function listFinishedMp4s(projectId: string): Array<{ file: string; exportId: string; name: string; size: number }> {
  const root = path.join(projectDir(projectId), 'exports');
  if (!fs.existsSync(root)) return [];
  const out: Array<{ file: string; exportId: string; name: string; size: number }> = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.mp4')) continue;
      const full = path.join(dir, f);
      try {
        out.push({ file: full, exportId: entry.name, name: f, size: fs.statSync(full).size });
      } catch {}
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Finished clip mp4s usable as test sources.
qualityTestsRoutes.get('/:id/quality-tests/sources', (req, res) => {
  const id = req.params.id as string;
  if (!readProject(id)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({
    sources: listFinishedMp4s(id).map((s) => ({
      exportId: s.exportId,
      name: s.name,
      size: s.size,
    })),
  });
});

// Cut a short segment from a finished clip, encode every ladder rung,
// and report sizes extrapolated to GB/hour plus SSIM vs the segment.
//
// NOTE: synchronous like mouth-sound analysis (a few minutes). Same tradeoff.
qualityTestsRoutes.post('/:id/quality-tests', (req, res) => {
  const id = req.params.id as string;
  if (!readProject(id)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const body = (req.body ?? {}) as { name?: unknown; offsetSec?: unknown; lengthSec?: unknown };
  const lengthSec = Math.min(15, Math.max(2, typeof body.lengthSec === 'number' ? body.lengthSec : 5));
  const offsetSec = Math.max(0, typeof body.offsetSec === 'number' ? body.offsetSec : 20);

  const match = listFinishedMp4s(id).find((s) => s.name === body.name)
    ?? listFinishedMp4s(id)[0];
  if (!match) {
    res.status(400).json({ error: 'Export a clip first — there is no finished video to test on yet.' });
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportId = `quality-test-${stamp}`;
  const dir = exportDir(id, exportId);
  fs.mkdirSync(dir, { recursive: true });

  try {
    // Accurate cut of the test segment.
    const segPath = path.join(dir, 'segment.mp4');
    run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(offsetSec), '-i', match.file,
      '-t', String(lengthSec),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      segPath,
    ]);
    const segInfo = probeJson(segPath);
    const segDuration = Number(segInfo?.format?.duration) || lengthSec;

    const results = [];
    for (const rung of LADDER) {
      const outName = `${rung.key}.mp4`;
      const outPath = path.join(dir, outName);
      run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', segPath,
        ...rung.videoArgs, ...AUDIO_ARGS, '-movflags', '+faststart', outPath,
      ]);
      const size = fs.statSync(outPath).size;
      // SSIM summary goes to stderr — capture it via spawnSync.
      let ssim: number | null = null;
      try {
        const scored = spawnSync('ffmpeg', [
          '-hide_banner', '-i', outPath, '-i', segPath,
          '-lavfi', 'ssim', '-f', 'null', '-',
        ], { timeout: 5 * 60 * 1000, encoding: 'utf-8' });
        const m = /All:([0-9.]+)/.exec(String(scored.stderr ?? ''));
        if (m) ssim = Number(m[1]);
      } catch {}
      results.push({
        key: rung.key,
        label: rung.label,
        detail: rung.detail,
        file: outName,
        sizeBytes: size,
        gbPerHour: (size / segDuration) * 3600 / 1e9,
        ssim,
      });
    }

    res.json({
      ok: true,
      exportId,
      folder: `projects/${id}/exports/${exportId}`,
      source: { name: match.name, offsetSec, lengthSec: segDuration },
      results,
    });
  } catch (e: any) {
    res.status(500).json({ error: `Quality test failed: ${e instanceof Error ? e.message : String(e)}` });
  }
});
