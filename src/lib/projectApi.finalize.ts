import { BASE, fetchJson } from './projectApi.shared';

export interface FinalizeChunk { exportId: string; start: number; end: number; videoFile: string; size: number; status: 'complete' }
export interface Chapter { start: number; title: string; summary?: string; sourceStart?: number }
export type ChapterVersion = 'sparse' | 'balanced' | 'dense';
export type ChapterVersions = Record<ChapterVersion, Chapter[]>;
export interface FinalizeStatus {
  chunks: FinalizeChunk[];
  coverage: { complete: boolean; expected: number; found: number; gaps: Array<{ start: number; end: number; seconds: number }>; totalSpan: number[] };
  stitched: { exists: boolean; path: string | null; size: number; duration: number; stale: boolean };
}
const root = (id: string) => `${BASE}/projects/${encodeURIComponent(id)}/finalize`;
const json = (value: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
export const getFinalizeStatus = (id: string) => fetchJson<FinalizeStatus>(`${root(id)}/status`);
export const stitchFinalVideo = (id: string) => fetchJson<{ ok: true; outputFile: string; size: number; duration: number; reencoded: boolean }>(`${root(id)}/stitch`, json({}));
export const generateChapterVersions = (id: string) => fetchJson<ChapterVersions>(`${root(id)}/chapters`);
export const getChosenChapters = (id: string) => fetchJson<{ chapters: Chapter[] | null; version?: ChapterVersion; youtubeBlock?: string }>(`${root(id)}/chapters/chosen`);
export const chooseChapterVersion = (id: string, version: ChapterVersion, edits: Chapter[]) =>
  fetchJson<{ ok: true; chapters: Chapter[]; youtubeBlock: string }>(`${root(id)}/chapters/choose`, json({ version, edits }));
export const getYoutubeDescription = (id: string) => fetchJson<{ title: string; template: string; preview: string; saved: boolean }>(`${root(id)}/description`);
export const saveYoutubeDescription = (id: string, title: string, template: string) =>
  fetchJson<{ ok: true; title: string; template: string; preview: string; saved: boolean }>(`${root(id)}/description`, json({ title, template }));
export const openFinalExportFolder = (id: string) => fetchJson<{ ok: true }>(`${root(id)}/open`, { method: 'POST' });
