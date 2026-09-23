import * as fs from 'fs';
import * as path from 'path';
import { APP_ROOT, readProject, readSettings } from './helpers.js';

/**
 * Permanent settings archive. Every settings save also writes
 * `archive/<project-id>/latest.json` — one small file, always the current
 * truth, living OUTSIDE the deletable project folder. Delete the 2GB video
 * whenever you like; the 17KB of decisions survives.
 */
export function writeLatest(projectId: string): void {
  try {
    const proj = readProject(projectId);
    if (!proj) return;
    const settings = readSettings(projectId, proj);
    const customCuts = Array.isArray((settings as any).customCuts) ? (settings as any).customCuts : [];
    const snapshot = {
      archivedAt: new Date().toISOString(),
      project: {
        id: proj.id,
        name: proj.name,
        videoFile: proj.videoFile ?? null,
        audioFile: proj.audioFile ?? null,
        captionFile: proj.captionFile ?? null,
        createdAt: proj.createdAt ?? null,
        updatedAt: proj.updatedAt ?? null,
      },
      stats: {
        customCutCount: customCuts.length,
        manualCutCount: customCuts.filter((c: any) => String(c?.key ?? '').startsWith('editorial:')).length,
        mouthCutCount: customCuts.filter((c: any) => String(c?.key ?? '').startsWith('mouth:')).length,
        fillerCutCount: customCuts.filter((c: any) => {
          const k = String(c?.key ?? '');
          return k.startsWith('filler:') || k.startsWith('stutter:');
        }).length,
      },
      settings,
    };
    const dir = path.join(APP_ROOT, 'archive', projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(snapshot, null, 2));
  } catch {
    // Archiving must never break a save.
  }
}
