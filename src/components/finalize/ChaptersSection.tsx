import React from 'react';
import { Section } from '../Controls';
import type { Chapter } from '../../lib/projectApi.finalize';
import { button, formatTime, muted } from './finalizeUi';

interface Props { chapters: Chapter[] | null; busy: boolean; canGenerate: boolean; onGenerate: () => void; onCompare: () => void; onSeek: (second: number) => void }
export function ChaptersSection({ chapters, busy, canGenerate, onGenerate, onCompare, onSeek }: Props) {
  return <Section title="3 · Chapters">
    <div style={muted}>{chapters ? `${chapters.length} chapters chosen. Review or edit them before upload.` : 'Generate three chapter densities from the kept transcript.'}</div>
    <div style={{ display: 'flex', gap: 6 }}>
      <button style={button} disabled={!canGenerate || busy} onClick={onGenerate}>{busy ? 'Generating…' : 'Generate 3 versions'}</button>
      {chapters && <button style={button} disabled={!canGenerate} onClick={onCompare}>Compare versions</button>}
    </div>
    {chapters && <div style={{ maxHeight: 185, overflowY: 'auto' }}>{chapters.map(c => <div key={c.start} style={{ fontSize: 11, padding: '4px 0', borderTop: '1px solid #222' }}>
      <button onClick={() => onSeek(c.sourceStart ?? c.start)} style={{ border: 0, background: 'transparent', color: '#8bbcff', cursor: 'pointer', marginRight: 6 }}>{formatTime(c.start)}</button>
      <span style={{ color: '#ddd' }}>{c.title}</span>
    </div>)}</div>}
  </Section>;
}
