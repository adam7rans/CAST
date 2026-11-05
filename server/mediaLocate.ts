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

export function locateDroppedFile(file: DroppedFile): string | null {
  if (!file.name || file.name.includes('/') || !(file.size > 0)) return null;
  const home = os.homedir();
  const found: string[] = [];
  for (const root of SEARCH_ROOTS) candidates(path.join(home, root), file.name, 0, found);
  let best: { file: string; drift: number } | null = null;
  for (const candidate of found) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.size !== file.size) continue;
      const drift = file.lastModified ? Math.abs(stat.mtimeMs - file.lastModified) : 0;
      if (!best || drift < best.drift) best = { file: candidate, drift };
    } catch {}
  }
  return best?.file ?? null;
}
