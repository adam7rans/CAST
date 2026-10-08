import type React from 'react';
import type { FinalizeStatus } from '../../lib/projectApi.finalize';

export const button: React.CSSProperties = { background: '#1e293b', border: '1px solid #486581', color: '#e9f3ff',
  borderRadius: 5, padding: '7px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };
export const input: React.CSSProperties = { background: '#171717', border: '1px solid #373737', color: '#eee',
  borderRadius: 5, padding: '7px 8px', fontSize: 12, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
export const muted: React.CSSProperties = { color: '#999', fontSize: 12, lineHeight: 1.45 };
export const formatTime = (time: number) => {
  const total = Math.max(0, Math.round(time));
  const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
export const formatSize = (size: number) => size >= 1024 ** 3
  ? `${(size / 1024 ** 3).toFixed(1)} GB` : `${(size / 1024 ** 2).toFixed(1)} MB`;
export function missingSteps(status: FinalizeStatus | null, hasChapters: boolean, saved: boolean, connected: boolean, unlistedReady: boolean) {
  const missing: string[] = [];
  if (!status?.coverage.complete) missing.push('Complete chunk coverage');
  if (!status?.stitched.exists || status.stitched.stale) missing.push('Stitch current chunks');
  if (!hasChapters) missing.push('Choose chapters');
  if (!saved) missing.push('Save title and description');
  if (!connected) missing.push('Connect YouTube');
  if (!unlistedReady) missing.push('YouTube API approval for unlisted uploads');
  return missing;
}
