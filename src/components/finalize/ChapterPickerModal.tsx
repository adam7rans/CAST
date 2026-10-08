import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Chapter, ChapterVersion, ChapterVersions } from '../../lib/projectApi.finalize';
import { button, formatTime, input, muted } from './finalizeUi';

interface Props {
  initial: ChapterVersions; currentVersion: ChapterVersion | null; onClose: () => void;
  onContinue: (version: ChapterVersion, chapters: Chapter[]) => void;
  onSeek: (second: number) => void; busy: boolean;
}
const names: ChapterVersion[] = ['sparse', 'balanced', 'dense'];
export function ChapterPickerModal({ initial, currentVersion, onClose, onContinue, onSeek, busy }: Props) {
  const [versions, setVersions] = useState(initial);
  const [selected, setSelected] = useState<ChapterVersion | null>(currentVersion);
  const edit = (version: ChapterVersion, index: number, title: string) => setVersions(prev => ({
    ...prev, [version]: prev[version].map((chapter, i) => i === index ? { ...chapter, title } : chapter),
  }));
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Choose chapter density" style={{
    position: 'fixed', inset: 0, zIndex: 10000, background: '#000c', display: 'grid', placeItems: 'center',
  }}>
    <div style={{ width: '90vw', height: '90vh', background: '#101114', border: '1px solid #41454d', borderRadius: 10,
      display: 'flex', flexDirection: 'column', boxShadow: '0 20px 80px #000a', color: '#eee' }}>
      <header style={{ padding: '16px 20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong>Choose chapter density</strong><div style={muted}>
          {currentVersion ? 'Your saved version is selected. Each column has different chapter times and editable titles.' : 'Compare the three chapter cuts, edit any title, then choose one version.'}
        </div></div>
        <button onClick={onClose} aria-label="Close" style={{ ...button, padding: '3px 8px' }}>×</button>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, padding: 12 }}>
        {names.map(version => <section key={version} style={{ minWidth: 0, border: selected === version ? '1px solid #74aeef' : '1px solid #31343a', borderRadius: 7,
          display: 'flex', flexDirection: 'column', background: selected === version ? '#15202b' : '#17191d' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#1d2025', padding: 10, borderBottom: '1px solid #333' }}>
            <strong style={{ textTransform: 'capitalize' }}>{version} ({versions[version].length}){currentVersion === version ? ' · Saved chapters' : ' · Alternative'}</strong>
            <button onClick={() => setSelected(version)} style={{ ...button, float: 'right', padding: '4px 7px' }}>
              {selected === version ? '✓ Selected' : 'Use this version'}
            </button>
          </div>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {versions[version].map((chapter, index) => <div key={chapter.start} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 6, alignItems: 'start' }}>
              <button onClick={() => onSeek(chapter.sourceStart ?? chapter.start)} title="Seek preview" style={{ background: 'none', border: 0, color: '#91c2ff', cursor: 'pointer', padding: '7px 0', textAlign: 'left', fontSize: 11 }}>
                {formatTime(chapter.start)}
              </button>
              <div><textarea aria-label={`${version} chapter ${index + 1} title`} style={{ ...input, resize: 'vertical', lineHeight: 1.4 }} rows={2} maxLength={80} value={chapter.title}
                onChange={e => edit(version, index, e.target.value.replace(/[\r\n]+/g, ' '))} />
                <div style={{ color: '#777', fontSize: 10, lineHeight: 1.35, marginTop: 3 }}>{chapter.summary}</div></div>
            </div>)}
          </div>
        </section>)}
      </div>
      <footer style={{ borderTop: '1px solid #333', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={button} onClick={onClose} disabled={busy}>Cancel</button>
        <button style={button} disabled={!selected || busy || !versions[selected]?.every(c => c.title.trim())}
          onClick={() => selected && onContinue(selected, versions[selected])}>{busy ? 'Saving…' : 'Continue'}</button>
      </footer>
    </div>
  </div>, document.body);
}
