import { BASE, fetchJson } from './projectApi.shared';

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  mediaType: 'video' | 'audio' | null;
  mediaName: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasTranscript: boolean;
  musicTrackCount: number;
  musicClipCount: number;
  cutCount: number;
  exportCount: number;
  sizeBytes: number;
  hasThumbnail: boolean;
  thumbnailKey: string | null;
  processing: boolean;
}

export interface ProjectSummaries {
  projects: ProjectSummary[];
  disk: { freeBytes: number | null; reserveBytes: number };
}

export function listProjectSummaries(): Promise<ProjectSummaries> {
  return fetchJson(`${BASE}/projects/summaries`, undefined, 'Could not load projects');
}

export function projectThumbnailUrl(project: ProjectSummary): string | null {
  if (!project.hasThumbnail) return null;
  return `${BASE}/projects/${encodeURIComponent(project.id)}/thumbnail?v=${encodeURIComponent(project.thumbnailKey ?? '')}`;
}

/** Permanently deletes the project folder on disk. */
export function deleteProject(id: string): Promise<{ ok: boolean; freedBytes: number }> {
  return fetchJson(`${BASE}/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'Could not delete project');
}

/** Save the rendered preview as the project's dashboard image. */
export async function uploadProjectSnapshot(id: string, jpeg: Blob): Promise<void> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(id)}/thumbnail`, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: jpeg,
  });
  if (!res.ok) throw new Error(`Snapshot upload failed (${res.status})`);
}
