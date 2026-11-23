import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PROJECTS_DIR } from './helpers.js';

/**
 * Find the file behind a browser drag-and-drop. A dropped File carries its
 * name, size and modification time but not its path, so the server looks for
 * an exact name + size match in the places downloads and recordings land.
 * When several match, the closest modification time wins.
 */
const SEARCH_ROOTS = ['Downloads', 'Desktop', 'Movies', 'Documents'];
const MAX_DEPTH = 1; // the folder itself plus one level of subfolders
const MAX_ENTRIES_PER_DIR = 5000;
/** Only video files can be linked; anything else must be uploaded explicitly. */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);

export interface DroppedFile { name: string; size: number; lastModified?: number }

function candidates(dir: string, name: string, depth: number, out: string[]) {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  if (entries.length > MAX_ENTRIES_PER_DIR) entries = entries.slice(0, MAX_ENTRIES_PER_DIR);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) out.push(full);
    else if (entry.isDirectory() && depth < MAX_DEPTH && !full.startsWith(PROJECTS_DIR) && !entry.name.endsWith('.app')) {
      candidates(full, name, depth + 1, out);
    }
  }
}

/** True when `file` really lives inside one of the search roots (no symlink escapes). */
function insideRoots(file: string, roots: string[]): boolean {
  try {
    const real = fs.realpathSync(file);
    return roots.some((root) => real.startsWith(root + path.sep));
  } catch {
    return false;
  }
}

export function locateDroppedFile(file: DroppedFile): string | null {
  if (!file.name || file.name.includes('/') || !(file.size > 0)) return null;
  if (!VIDEO_EXTENSIONS.has(path.extname(file.name).toLowerCase())) return null;
  const home = os.homedir();
  const roots = SEARCH_ROOTS.map((root) => {
    try { return fs.realpathSync(path.join(home, root)); } catch { return null; }
  }).filter((root): root is string => !!root);
  const found: string[] = [];
  for (const root of roots) candidates(root, file.name, 0, found);
  let best: { file: string; drift: number } | null = null;
  for (const candidate of found) {
    if (!insideRoots(candidate, roots)) continue;
    try {
      const stat = fs.statSync(candidate);
      if (stat.size !== file.size) continue;
      const drift = file.lastModified ? Math.abs(stat.mtimeMs - file.lastModified) : 0;
      if (!best || drift < best.drift) best = { file: candidate, drift };
    } catch {}
  }
  return best?.file ?? null;
}
