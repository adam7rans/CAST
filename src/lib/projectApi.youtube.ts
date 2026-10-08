import { BASE, fetchJson } from './projectApi.shared';

export interface YoutubeStatus { connected: boolean; setupRequired?: boolean; unlistedReady?: boolean; channelTitle?: string }
export interface UploadResult { ok: true; videoId: string; url: string; studioUrl: string; privacyStatus: string }
export interface UploadStatus { state: 'idle' | 'uploading' | 'done' | 'error'; progress: number; result?: UploadResult; error?: string }
export const getYoutubeStatus = () => fetchJson<YoutubeStatus>(`${BASE}/youtube/status`);
export const disconnectYoutube = () => fetchJson<{ connected: false }>(`${BASE}/youtube/disconnect`, { method: 'POST' });
export function connectYoutube() {
  const url = `${BASE}/youtube/oauth/start?popup=1&returnTo=${encodeURIComponent(window.location.href)}`;
  const popup = window.open(url, 'cast-youtube-oauth', 'width=620,height=760');
  if (!popup) window.location.href = url;
}
const uploadRoot = (id: string) => `${BASE}/projects/${encodeURIComponent(id)}/youtube/upload`;
export const getUploadStatus = (id: string) => fetchJson<UploadStatus>(`${uploadRoot(id)}/status`);
export const startYoutubeUpload = (id: string) => fetchJson<UploadStatus>(uploadRoot(id), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ communityGuidelinesAccepted: true }),
});
