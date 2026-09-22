import * as fs from 'fs';
import * as path from 'path';
import { projectDir, readSettings, writeSettings, SETTINGS_FILE } from './helpers.js';
import type { Settings } from './types';

const SETTINGS_HISTORY_DIR = 'settings-history';
const SETTINGS_HISTORY_KEEP = 20;
// Write a new history snapshot at most this often so an editing session
// yields depth (hours) instead of 20 copies of the last few minutes.
const SETTINGS_HISTORY_MIN_INTERVAL_MS = 10 * 60 * 1000;

function historyDir(id: string) {
  return path.join(projectDir(id), SETTINGS_HISTORY_DIR);
}

function pruneSettingsHistory(id: string) {
  const dir = historyDir(id);
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return;
  }
  while (files.length > SETTINGS_HISTORY_KEEP) {
    const oldest = files.shift()!;
    try { fs.unlinkSync(path.join(dir, oldest)); } catch {}
  }
}

/** Snapshot the current settings.json before overwriting it (time-gated). */
function backupSettings(id: string) {
  const current = path.join(projectDir(id), SETTINGS_FILE);
  if (!fs.existsSync(current)) return;
  const dir = historyDir(id);
  fs.mkdirSync(dir, { recursive: true });
  let newest = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const m = fs.statSync(path.join(dir, f)).mtimeMs;
        if (m > newest) newest = m;
      } catch {}
    }
  } catch {}
  if (Date.now() - newest < SETTINGS_HISTORY_MIN_INTERVAL_MS) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.copyFileSync(current, path.join(dir, `${stamp}.json`));
  } catch {}
  pruneSettingsHistory(id);
}

const CUSTOM_KEY_PREFIXES = ['custom:', 'filler:', 'stutter:', 'editorial:', 'mouth:'];
const isCustomCutKey = (k: string) => CUSTOM_KEY_PREFIXES.some((p) => k.startsWith(p));

export interface GuardedWriteResult {
  preservedCustomCuts: boolean;
  preservedCount: number;
}

/**
 * Write settings with two safety nets:
 * 1. Snapshot the previous settings.json into settings-history/ first.
 * 2. Refuse an accidental wipe: when the incoming payload carries an empty
 *    customCuts array while the stored file has cuts — and the client did not
 *    explicitly mark this save as an intentional clear (customCutsClearedAt
 *    newer than the stored one) — the stored cuts (plus their custom-keyed
 *    jumpCuts overrides/disabled entries) are preserved.
 */
export function writeSettingsGuarded(id: string, body: Record<string, any>): GuardedWriteResult {
  const stored = readSettings(id);
  const storedCuts = Array.isArray((stored as any).customCuts) ? (stored as any).customCuts : [];
  const incomingCuts = Array.isArray(body.customCuts) ? body.customCuts : undefined;
  const storedClearedAt = typeof (stored as any).customCutsClearedAt === 'number' ? (stored as any).customCutsClearedAt : 0;
  const incomingClearedAt = typeof body.customCutsClearedAt === 'number' ? body.customCutsClearedAt : 0;

  let preservedCustomCuts = false;
  let preservedCount = 0;
  const next: Record<string, any> = { ...(stored as any), ...body };
  if (incomingCuts !== undefined && incomingCuts.length === 0 && storedCuts.length > 0 && incomingClearedAt <= storedClearedAt) {
    // Stale/empty save (e.g. autosave fired before cuts loaded, or a second
    // tab with old state) — keep the stored cuts instead of wiping them.
    next.customCuts = storedCuts;
    next.customCutsClearedAt = (stored as any).customCutsClearedAt ?? null;
    const storedJumpCuts = (stored as any).jumpCuts;
    if (storedJumpCuts && typeof storedJumpCuts === 'object') {
      const incomingJumpCuts = (next.jumpCuts && typeof next.jumpCuts === 'object') ? next.jumpCuts : {};
      const keepIfCustom = (obj: any) => {
        const out: Record<string, any> = {};
        if (obj && typeof obj === 'object') {
          for (const [k, v] of Object.entries(obj)) if (isCustomCutKey(k)) out[k] = v;
        }
        return out;
      };
      const storedOverrides = keepIfCustom(storedJumpCuts.overrides);
      const storedDisabled = keepIfCustom(storedJumpCuts.disabled);
      incomingJumpCuts.overrides = { ...(incomingJumpCuts.overrides ?? {}), ...storedOverrides };
      incomingJumpCuts.disabled = { ...(incomingJumpCuts.disabled ?? {}), ...storedDisabled };
      next.jumpCuts = incomingJumpCuts;
    }
    preservedCustomCuts = true;
    preservedCount = storedCuts.length;
  }

  backupSettings(id);
  writeSettings(id, next as Settings);
  return { preservedCustomCuts, preservedCount };
}
