import React, { useCallback, useEffect, useState } from 'react';
import { C } from '../../lib/designTokens';
import { listProjectSummaries, type ProjectSummaries, type ProjectSummary } from '../../lib/projectApi.dashboard';
import type { DashboardControl } from '../app/useDashboard';
import { SNAPSHOT_SAVED_EVENT } from '../app/useProjectSnapshot';
import { Icon } from '../ui/Icon';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { DASHBOARD_CSS } from './dashboardStyles';
import { formatBytes } from './dashboardFormat';
import { NewProjectControl } from './NewProjectControl';
import { ProjectCard, ProjectRow, ProjectRowHeader } from './ProjectTile';

type ViewMode = 'grid' | 'list';
const VIEW_KEY = 'cast.dashboard.view';

function readView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
}

export const ProjectDashboard: React.FC<{ control: DashboardControl }> = ({ control }) => {
  const [data, setData] = useState<ProjectSummaries | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(readView);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listProjectSummaries().then((next) => { setData(next); setLoadError(null); })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load projects'));
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    window.addEventListener(SNAPSHOT_SAVED_EVENT, refresh);
    return () => window.removeEventListener(SNAPSHOT_SAVED_EVENT, refresh);
  }, [refresh]);

  const canClose = !!control.activeProjectId;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose && !pendingDelete) control.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canClose, pendingDelete, control]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const chooseView = (mode: ViewMode) => {
    setView(mode);
    try { localStorage.setItem(VIEW_KEY, mode); } catch {}
  };

  const open = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try { await control.openProject(id); } finally { setOpening(null); }
  };

  const onDeleted = (project: ProjectSummary, freedBytes: number) => {
    setPendingDelete(null);
    setData((prev) => prev && { ...prev, projects: prev.projects.filter((p) => p.id !== project.id) });
    setNotice(`Deleted “${project.name}” — ${formatBytes(freedBytes)} freed`);
    control.handleDeleted(project.id);
    refresh();
  };

  const projects = data?.projects ?? [];
  const activeName = projects.find((p) => p.id === control.activeProjectId)?.name;
  const disk = data?.disk;
  const lowDisk = !!disk && disk.freeBytes !== null && disk.freeBytes < disk.reserveBytes;
  const tileProps = (p: ProjectSummary) => ({ project: p, active: p.id === control.activeProjectId, onOpen: open, onDelete: setPendingDelete });

  return (
    <div className="cdash-root" aria-busy={!!opening}>
      <style>{DASHBOARD_CSS}</style>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 28px',
        borderBottom: `1px solid ${C.line}`, background: C.bar,
      }}>
        {canClose && (
          <button type="button" className="cdash-btn" onClick={control.close} title="Back to the open project (Esc)">
            <Icon name="chevR" size={13} style={{ transform: 'rotate(180deg)' }} />
            {activeName ? `Back to ${activeName}` : 'Back'}
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginRight: 'auto' }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: 0.2 }}>Projects</h1>
          {data && <span style={{ fontSize: 12, color: C.faint }}>{projects.length}</span>}
        </div>
        {notice && <span role="status" style={{ fontSize: 12, color: C.green }}>{notice}</span>}
        {disk && disk.freeBytes !== null && (
          <span
            title={lowDisk ? `Imports and processing need at least ${formatBytes(disk.reserveBytes)} free. Delete a project or free up space.` : 'Free space on this disk'}
            style={{ fontSize: 12, color: lowDisk ? C.orange : C.faint, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: lowDisk ? C.orange : C.green }} />
            {formatBytes(disk.freeBytes)} free{lowDisk ? ' (low)' : ''}
          </span>
        )}
        <div className="cdash-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'grid'} onClick={() => chooseView('grid')} title="Grid view"><Icon name="grid" size={15} /></button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')} title="List view"><Icon name="list" size={15} /></button>
        </div>
        <NewProjectControl onCreate={control.createProject} />
      </header>

      <div className="cdash-scroll">
        {loadError && <div role="alert" style={{ color: C.red, fontSize: 13, marginBottom: 16 }}>{loadError}</div>}
        {!data && !loadError && <div style={{ color: C.faint, fontSize: 13 }}>Loading projects…</div>}
        {data && projects.length === 0 && (
          <div style={{ display: 'grid', placeItems: 'center', gap: 14, padding: '80px 0', color: C.faint, textAlign: 'center' }}>
            <Icon name="folder" size={36} color={C.fainter} />
            <div style={{ fontSize: 14, color: C.dim }}>No projects yet</div>
            <div style={{ fontSize: 12 }}>Create one, then add a video or audio file to it.</div>
            <NewProjectControl onCreate={control.createProject} />
          </div>
        )}
        {projects.length > 0 && view === 'grid' && (
          <div className="cdash-grid">{projects.map((p) => <ProjectCard key={p.id} {...tileProps(p)} />)}</div>
        )}
        {projects.length > 0 && view === 'list' && (
          <div className="cdash-list">
            <ProjectRowHeader />
            {projects.map((p) => <ProjectRow key={p.id} {...tileProps(p)} />)}
          </div>
        )}
      </div>

      {pendingDelete && (
        <DeleteProjectDialog project={pendingDelete} onCancel={() => setPendingDelete(null)} onDeleted={onDeleted} />
      )}
    </div>
  );
};
