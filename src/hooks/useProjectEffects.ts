import type React from 'react';
import { useEffect } from 'react';
import { parseTranscript, type TranscriptData } from '../lib/transcript';
import {
  listProjects, getTranscript, openEventStream,
  type ProjectMeta,
} from '../lib/projectApi';
import type { ProjectTaskStatus } from '../lib/constants';
import type { Toast } from '../components/StatusToast';

export interface SSEDeps {
  activeProjectId: string | null;
  activeProjectIdRef: React.MutableRefObject<string | null>;
  setProjectStatus: (s: ProjectTaskStatus) => void;
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptData | null>>;
  setTranscriptName: React.Dispatch<React.SetStateAction<string | null>>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectMeta[]>>;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
  updateToast: (id: number, message: string, type: Toast['type']) => void;
}

/** SSE stream for transcription progress. */
export function useSSEStream(deps: SSEDeps) {
  const { activeProjectId, activeProjectIdRef, setProjectStatus, setTranscript, setTranscriptName, setProjects, addToast, updateToast } = deps;
  useEffect(() => {
    if (!activeProjectId) return;
    let progressToastId: number | null = null;
    const close = openEventStream(activeProjectId, (event) => {
      const statusKind: ProjectTaskStatus['kind'] =
        event.type === 'done' || event.type === 'caption_saved' ? 'success' :
          event.type === 'error' ? 'error' :
            event.type === 'video_saved' || event.type === 'audio_extracted' ? 'success' : 'progress';
      setProjectStatus({
        kind: statusKind,
        message: event.message,
        detail: event.type === 'polling' && event.status ? `AssemblyAI status: ${event.status}` : undefined,
      });

      if (event.type === 'video_saved') {
        addToast(event.message, 'info');
      } else if (event.type === 'audio_extracting') {
        progressToastId = addToast(event.message, 'progress', true);
      } else if (event.type === 'audio_extracted') {
        if (progressToastId) updateToast(progressToastId, event.message, 'info');
        progressToastId = null;
      } else if (event.type === 'uploading' || event.type === 'submitted') {
        if (progressToastId) updateToast(progressToastId, event.message, 'progress');
        else progressToastId = addToast(event.message, 'progress', true);
      } else if (event.type === 'polling') {
        if (progressToastId) updateToast(progressToastId, event.message, 'progress');
        else progressToastId = addToast(event.message, 'progress', true);
      } else if (event.type === 'done') {
        if (progressToastId) updateToast(progressToastId, event.message, 'success');
        else addToast(event.message, 'success');
        progressToastId = null;
        const pid = activeProjectIdRef.current;
        if (pid) getTranscript(pid).then(data => {
          if (data) {
            try { setTranscript(parseTranscript(data)); setTranscriptName('caption.json'); } catch { }
          }
        });
        listProjects().then(setProjects);
      } else if (event.type === 'caption_saved') {
        addToast(event.message, 'success');
      } else if (event.type === 'error') {
        if (progressToastId) updateToast(progressToastId, `Error: ${event.message}`, 'error');
        else addToast(`Error: ${event.message}`, 'error');
        progressToastId = null;
      }
    });
    return close;
  }, [activeProjectId]);
}

/**
 * Load project list on mount, auto-select from URL, and keep URL in sync
 * with the active project.
 */
export function useProjectRouting(
  activeProjectIdRef: React.MutableRefObject<string | null>,
  activeProjectId: string | null,
  setProjects: React.Dispatch<React.SetStateAction<ProjectMeta[]>>,
  handleSelectProject: (id: string) => Promise<void>,
) {
  useEffect(() => {
    listProjects().then((all) => {
      setProjects(all);
      const slug = decodeURIComponent(window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, ''));
      if (!slug) return;
      const match = all.find((p) => p.id === slug);
      if (match) handleSelectProject(match.id);
      else {
        window.history.replaceState(null, '', '/');
      }
    });
    const onPop = () => {
      const slug = decodeURIComponent(window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, ''));
      if (!slug) return;
      if (slug !== activeProjectIdRef.current) handleSelectProject(slug);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    const target = `/${encodeURIComponent(activeProjectId)}`;
    if (window.location.pathname !== target) {
      window.history.replaceState(null, '', target);
    }
  }, [activeProjectId]);
}
