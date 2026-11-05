import React, { useEffect, useRef, useState } from 'react';
import { C } from '../../lib/designTokens';
import { deleteProject, type ProjectSummary } from '../../lib/projectApi.dashboard';
import { formatBytes } from './dashboardFormat';

interface Props {
  project: ProjectSummary;
  onCancel: () => void;
  onDeleted: (project: ProjectSummary, freedBytes: number) => void;
}

function contents(p: ProjectSummary): string {
  const parts: string[] = [];
  if (p.mediaName && !p.linkedFrom) parts.push(`the ${p.mediaType === 'audio' ? 'audio' : 'video'} file (${p.mediaName})`);
  if (p.hasTranscript) parts.push('captions');
  if (p.musicTrackCount > 0) parts.push(`${p.musicTrackCount} music track${p.musicTrackCount === 1 ? '' : 's'}`);
  if (p.cutCount > 0) parts.push(`${p.cutCount} cuts`);
  if (p.exportCount > 0) parts.push(`${p.exportCount} export${p.exportCount === 1 ? '' : 's'}`);
  parts.push('all settings');
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

export const DeleteProjectDialog: React.FC<Props> = ({ project, onCancel, onDeleted }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onCancel]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteProject(project.id);
      onDeleted(project, result.freedBytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  };

  return (
    <div
      role="presentation"
      onClick={() => !busy && onCancel()}
      style={{ position: 'fixed', inset: 0, zIndex: 950, background: '#000000a8', display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cdash-del-title"
        aria-describedby="cdash-del-body"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)', background: '#141414', border: `1px solid ${C.line3}`, borderRadius: 12,
          padding: 22, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 60px #000c',
        }}
      >
        <h2 id="cdash-del-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.text }}>
          Delete “{project.name}”?
        </h2>
        <div id="cdash-del-body" style={{ fontSize: 12, lineHeight: 1.6, color: C.dim, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>This permanently removes the project folder from disk: {contents(project)}.</span>
          <span style={{ color: C.text }}>
            Frees {formatBytes(project.sizeBytes)}. This can’t be undone.
          </span>
          {project.linkedFrom && (
            <span>The original video in {project.linkedFrom} is not touched.</span>
          )}
          {project.processing && (
            <span style={{ color: C.orange }}>Background processing for this project will be stopped.</span>
          )}
        </div>
        {error && <div role="alert" style={{ fontSize: 12, color: C.red }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button ref={cancelRef} type="button" className="cdash-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="cdash-btn danger" onClick={confirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete project'}
          </button>
        </div>
      </div>
    </div>
  );
};
