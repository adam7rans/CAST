import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { uploadProjectSnapshot } from '../../lib/projectApi.dashboard';
import { capturePreviewSnapshot } from '../../lib/previewSnapshot';

export const SNAPSHOT_SAVED_EVENT = 'cast:snapshot-saved';
const MIN_INTERVAL_MS = 15_000;
const AFTER_LOAD_MS = 2_500;
const AFTER_EDIT_MS = 4_000;

interface Options {
  previewWrapRef: React.Ref<HTMLDivElement>;
  activeProjectId: string | null;
  mediaLoaded: boolean;
  /** Last autosave time; a change means the look may have changed. */
  savedAt: number | null;
  dashboardVisible: boolean;
  backdrop: string;
  invert: boolean;
}

/**
 * Keeps each project's dashboard image in step with how it actually looks:
 * shortly after its media loads, after edits settle, and whenever the
 * dashboard is opened over it.
 */
export function useProjectSnapshot(o: Options) {
  const lastRef = useRef<{ id: string; at: number } | null>(null);
  const live = useRef(o);
  live.current = o;

  const capture = useCallback(async (force: boolean) => {
    const { previewWrapRef, activeProjectId: id, mediaLoaded, backdrop, invert } = live.current;
    const root = (previewWrapRef as React.RefObject<HTMLDivElement> | null)?.current;
    if (!id || !mediaLoaded || !root) return;
    const last = lastRef.current;
    if (!force && last?.id === id && Date.now() - last.at < MIN_INTERVAL_MS) return;
    try {
      const blob = await capturePreviewSnapshot(root, { backdrop, invert });
      if (!blob || live.current.activeProjectId !== id) return;
      lastRef.current = { id, at: Date.now() };
      await uploadProjectSnapshot(id, blob);
      window.dispatchEvent(new CustomEvent(SNAPSHOT_SAVED_EVENT, { detail: { id } }));
    } catch {
      // A missing card image is not worth interrupting the editor for.
    }
  }, []);

  useEffect(() => {
    if (!o.activeProjectId || !o.mediaLoaded) return;
    const timer = window.setTimeout(() => void capture(true), AFTER_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [o.activeProjectId, o.mediaLoaded, capture]);

  useEffect(() => {
    if (!o.savedAt) return;
    const timer = window.setTimeout(() => void capture(false), AFTER_EDIT_MS);
    return () => window.clearTimeout(timer);
  }, [o.savedAt, capture]);

  const wasVisible = useRef(o.dashboardVisible);
  useEffect(() => {
    if (o.dashboardVisible && !wasVisible.current) void capture(true);
    wasVisible.current = o.dashboardVisible;
  }, [o.dashboardVisible, capture]);
}
