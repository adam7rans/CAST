import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface DashboardControl {
  /** True when the projects dashboard covers the editor. */
  visible: boolean;
  activeProjectId: string | null;
  open: () => void;
  /** Back to the open project; a no-op when none is open. */
  close: () => void;
  openProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  /** Call after the server deleted a project. */
  handleDeleted: (id: string) => void;
}

export const DashboardContext = createContext<DashboardControl | null>(null);
export const useDashboardControl = () => useContext(DashboardContext);

const urlSlug = () => decodeURIComponent(window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, ''));

interface Options {
  activeProjectId: string | null;
  selectProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
}

/**
 * The dashboard is the start screen whenever no project is open, and can be
 * reopened over the editor. The editor stays mounted underneath because its
 * preview canvases own WebGL renderers that must not be torn down.
 */
export function useDashboard({ activeProjectId, selectProject, createProject }: Options): DashboardControl {
  const [open, setOpen] = useState(false);
  // A deep link (/<project-id>) is still loading: don't flash the dashboard.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const bootPending = !activeProjectId && !bootTimedOut && urlSlug() !== '';
  useEffect(() => {
    if (!bootPending) return;
    const timer = window.setTimeout(() => setBootTimedOut(true), 3000);
    return () => window.clearTimeout(timer);
  }, [bootPending]);

  const visible = open || (!activeProjectId && !bootPending);

  const close = useCallback(() => setOpen(false), []);
  const openDashboard = useCallback(() => setOpen(true), []);

  const openProject = useCallback(async (id: string) => {
    if (id !== activeProjectId) await selectProject(id);
    setOpen(false);
  }, [activeProjectId, selectProject]);

  const create = useCallback(async (name: string) => {
    await createProject(name);
    setOpen(false);
  }, [createProject]);

  const handleDeleted = useCallback((id: string) => {
    // The open project's state lives all over the editor; a reload is the
    // only reset that can't leave a stale autosave pointed at a dead folder.
    if (id === activeProjectId) window.location.assign('/');
  }, [activeProjectId]);

  return { visible, activeProjectId, open: openDashboard, close, openProject, createProject: create, handleDeleted };
}
