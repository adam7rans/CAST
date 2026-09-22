import type { ProjectData, ProjectMeta } from './projectApi.types';
import { BASE, fetchJson } from './projectApi.shared';

export async function listProjects(): Promise<ProjectMeta[]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) return [];
  return res.json();
}

export async function createProject(name: string): Promise<{ id: string; name: string }> {
  return fetchJson(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }, 'Failed to create project');
}

export async function getProject(id: string): Promise<ProjectData> {
  return fetchJson(`${BASE}/projects/${id}`, undefined, 'Project not found');
}

export interface SaveSettingsResult {
  ok: boolean;
  preservedCustomCuts?: boolean;
  preservedCount?: number;
}

export interface MouthSoundRegion {
  startMs: number;
  endMs: number;
  label: string;
  score?: number;
}

export async function detectMouthSounds(id: string, threshold = 0.3, classes?: string[]): Promise<{ regions: MouthSoundRegion[] }> {
  return fetchJson<{ regions: MouthSoundRegion[] }>(`${BASE}/projects/${id}/mouth-sounds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threshold, ...(classes ? { classes } : {}) }),
  }, 'Mouth-sound analysis failed');
}

export async function saveSettings(id: string, settings: Record<string, any>): Promise<SaveSettingsResult> {
  return fetchJson<SaveSettingsResult>(`${BASE}/projects/${id}/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  }, 'Failed to save settings');
}
