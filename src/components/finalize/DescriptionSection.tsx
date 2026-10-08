import React from 'react';
import { Section } from '../Controls';
import { button, input, muted } from './finalizeUi';

interface Props { title: string; template: string; preview: string; saved: boolean; canSave: boolean; busy: boolean;
  onTitle: (value: string) => void; onTemplate: (value: string) => void; onSave: () => void }
export function DescriptionSection({ title, template, preview, saved, canSave, busy, onTitle, onTemplate, onSave }: Props) {
  return <Section title="4 · Description">
    <label style={muted}>YouTube title<input style={{ ...input, marginTop: 4 }} maxLength={100} value={title} onChange={e => onTitle(e.target.value)} /></label>
    <label style={muted}>Description template<textarea style={{ ...input, marginTop: 4, minHeight: 100, resize: 'vertical' }} maxLength={4900}
      value={template} onChange={e => onTemplate(e.target.value)} /></label>
    <div style={{ ...muted, color: '#777' }}>Use {'{chapters}'} where the selected chapter list should appear.</div>
    <button style={button} disabled={!canSave || busy || !title.trim() || !template.trim()} onClick={onSave}>
      {busy ? 'Saving…' : saved ? 'Saved · Save changes' : 'Save description'}
    </button>
    <div style={{ ...muted, marginTop: 4 }}>Preview</div>
    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#ccc', background: '#171717', border: '1px solid #292929',
      borderRadius: 5, padding: 8, maxHeight: 180, overflowY: 'auto', fontSize: 11, margin: 0 }}>{preview}</pre>
  </Section>;
}
