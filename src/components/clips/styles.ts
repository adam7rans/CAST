import type { CSSProperties } from 'react';

export const clipButtonStyle: CSSProperties = {
  background: '#1a1a1a', color: '#ddd', border: '1px solid #333', borderRadius: 4,
  padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
};

export const clipFieldStyle: CSSProperties = {
  boxSizing: 'border-box', width: '100%', minWidth: 0, background: '#0a0a0a', color: '#ddd',
  border: '1px solid #333', padding: '6px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12,
};

export function formatClipTime(second: number): string {
  if (!Number.isFinite(second) || second < 0) return '—';
  const milliseconds = Math.round(second * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = (milliseconds % 60_000) / 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}
