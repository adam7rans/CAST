import React, { useState } from 'react';
import type { ProjectMeta } from '../lib/projectApi';
import type { SaveStatus } from '../hooks/useAutoSave';
import { useDashboardControl } from './app/useDashboard';
import { Icon } from './ui/Icon';

interface Props {
  projects: ProjectMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  saveStatus: SaveStatus;
}

function formatSaveTime(at: number | null): string {
  if (!at) return '';
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Persistent settings-autosave indicator. Distinct from the caption-transcript
 *  "saved" toasts — this one never disappears and always shows the truth. */
const SavePill: React.FC<{ status: SaveStatus }> = ({ status }) => {
  if (status.state === 'idle') return null;
  const conf =
    status.state === 'saved'
      ? { color: '#22c55e', label: `Saved ${formatSaveTime(status.at)}`, title: 'All settings, styles and skip edits are saved on disk.' }
      : status.state === 'error'
        ? { color: '#ef4444', label: 'Save failed', title: 'The last autosave did NOT reach the server. Your latest edits may only exist in this tab — do not close it. Check that the server is running, then tweak any setting to retry.' }
        : { color: '#f59e0b', label: 'Saving…', title: 'Unsaved changes — writing to disk…' };
  return (
    <span
      title={conf.title}
      style={{
        background: `${conf.color}1a`, border: `1px solid ${conf.color}88`,
        color: conf.color, borderRadius: 4, padding: '2px 8px',
        fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: conf.color,
        boxShadow: `0 0 6px ${conf.color}`,
        animation: status.state === 'saved' ? undefined : 'save-pulse 1s ease-in-out infinite',
      }} />
      {conf.label}
      <style>{`@keyframes save-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
    </span>
  );
};

export const ProjectBar: React.FC<Props> = ({ projects, activeId, onCreate, saveStatus }) => {
  const dashboard = useDashboardControl();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const active = projects.find(p => p.id === activeId);

  const submit = () => {
    const n = newName.trim();
    if (!n) return;
    onCreate(n);
    setNewName('');
    setCreating(false);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 10px', borderBottom: '1px solid #1f1f1f',
      background: 'linear-gradient(180deg, #111 0%, #0c0c0c 100%)',
      flexShrink: 0,
    }}>
      {creating ? (
        <>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            placeholder="Project name…"
            style={{
              flex: 1, background: '#161616', border: '1px solid #1f6feb',
              borderRadius: 4, color: '#eee', padding: '3px 8px',
              fontSize: 12, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button onClick={submit} style={btn('#1f6feb')}>Create</button>
          <button onClick={() => { setCreating(false); setNewName(''); }} style={btn('#222')}>Cancel</button>
        </>
      ) : (
        <>
          <button
            onClick={() => dashboard?.open()}
            title="All projects"
            style={{
              ...btn('#161616', '#2a2a2a'), display: 'inline-flex', alignItems: 'center', gap: 6, color: '#bbb',
            }}
          >
            <Icon name="grid" size={13} /> Projects
          </button>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 12, color: active ? '#ddd' : '#555',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {active?.name ?? 'No project open'}
          </span>

          {active && (
            <span style={{ fontSize: 10, display: 'flex', gap: 4, flexShrink: 0 }}>
              {active.hasVideo && <Badge color="#1f6feb">VIDEO</Badge>}
              {active.hasVideo && active.videoOptimizationResult && (
                <Badge color="#58c4a2" title={`${(active.videoOptimizationResult.originalBytes / 1e9).toFixed(2)} GB original → ${(active.videoOptimizationResult.optimizedBytes / 1e6).toFixed(1)} MB black-and-white MP4`}>
                  B&amp;W {Math.round(active.videoOptimizationResult.optimizedBytes / 1e6)} MB
                </Badge>
              )}
              {active.hasTranscript && <Badge color="#22c55e">CAPS</Badge>}
            </span>
          )}

          <SavePill status={saveStatus} />

          <button onClick={() => setCreating(true)} style={btn('#1a1a1a', '#2a2a2a')} title="New project">
            + New
          </button>
        </>
      )}
    </div>
  );
};

const Badge: React.FC<{ color: string; children: React.ReactNode; title?: string }> = ({ color, children, title }) => (
  <span title={title} style={{
    background: `${color}22`, border: `1px solid ${color}66`,
    color, borderRadius: 3, padding: '1px 5px', fontSize: 9, letterSpacing: 0.5,
  }}>{children}</span>
);

function btn(bg: string, border = '#1f6feb') {
  return {
    background: bg, border: `1px solid ${border}`,
    color: border === '#1f6feb' ? '#fff' : '#aaa',
    borderRadius: 4, padding: '3px 10px', fontSize: 11,
    fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0,
  } as React.CSSProperties;
}
