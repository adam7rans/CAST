import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR } from '../helpers.js';

export const KEY_FILE = path.join(PROJECTS_DIR, '.openai-key');

const KEY_PATTERN = /^\S{20,512}$/;
const KEY_SHAPE = /^sk-[A-Za-z0-9_-]+$/;
let cachedKey: string | null | undefined;

export function isValidKey(raw: unknown): raw is string {
  return typeof raw === 'string' && KEY_PATTERN.test(raw.trim()) && KEY_SHAPE.test(raw.trim());
}

export function saveKey(raw: string) {
  const key = raw.trim();
  mkdirSync(PROJECTS_DIR, { recursive: true });
  const temporary = `${KEY_FILE}.${process.pid}.tmp`;
  writeFileSync(temporary, `${key}\n`, { mode: 0o600 });
  renameSync(temporary, KEY_FILE);
  cachedKey = key;
}

export function readStoredKey(): string | null {
  if (cachedKey !== undefined) return cachedKey;
  try {
    const key = readFileSync(KEY_FILE, 'utf8').trim();
    cachedKey = isValidKey(key) ? key : null;
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}
