import { useCallback, useEffect, useRef, useState } from 'react';
import { saveSettings } from '../lib/projectApi';
import type { ProjectTaskStatus, MainTab, BgSubTab, VideoSubTab, VideoShaderSubTab, AudioSubTab, GuideKey, CaptionsSubTab, EditorMode, EditorSubTab } from '../lib/constants';
import type {
  BackgroundParams, DitherParams, VideoShaderParams, ExportParams,
  CaptionStyle, AudioReactivityParams, CaptionShaderParams, MicroTimeline, MusicTimelineClip,
  AudioVisualizerParams, CompositionMode,
} from '../lib/types';
import type { CustomCut } from '../lib/fillerDetector';
import type { CaptionMode, ClipCaptionEdits } from '../lib/transcript';
import type { LimiterParams } from '../lib/AudioSource';
import type { MusicParams } from '../lib/MusicPlayer';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface SaveStatus {
  state: SaveState;
  /** Epoch ms of the last successful save, or null if never saved. */
  at: number | null;
  /** How many times the server refused an empty-over-full cut wipe. */
  guardedCount: number;
  /** Cut count protected by the most recent guard intervention. */
  guardedProtected: number;
}

export interface AutoSaveSettings {
  bg: BackgroundParams;
  bgDither: DitherParams;
  vid: VideoShaderParams;
  audioReactivity: AudioReactivityParams;
  visualizer: AudioVisualizerParams;
  compositionMode: CompositionMode;
  music: MusicParams;
  musicLibraryDurations: Record<string, number>;
  musicTimelineClips: MusicTimelineClip[];
  limiter: LimiterParams;
  captionMode: CaptionMode;
  captionStyle: CaptionStyle;
  captionShader: CaptionShaderParams;
  captionStyleByGuide: Record<string, CaptionStyle>;
  captionShaderByGuide: Record<string, CaptionShaderParams>;
  bgLayerOn: boolean;
  bgOffMode: 'grid' | 'color';
  bgOffColor: string;
  videoLayerOn: boolean;
  captionsLayerOn: boolean;
  musicLayerOn: boolean;
  activeGuide: GuideKey | null;
  cropToGuide: boolean;
  bgExport: ExportParams;
  vidExport: ExportParams;
  microTimelines: MicroTimeline[];
  selectedClipId: string | null;
  captionClipEdits: Record<string, ClipCaptionEdits>;
  customCuts: CustomCut[];
  customCutsClearedAt: number | null;
  jumpCutGapOverrides: Record<string, { startMs: number; endMs: number }>;
  jumpCutGapDisabled: Record<string, true>;
  jumpCutsEnabled: boolean;
  jumpCutGapMs: number;
  jumpCutPaddingMs: number;
  customCutPaddingMs: number;
  showSilenceGaps: boolean;
  showFillerCuts: boolean;
  showManualCuts: boolean;
  showMouthCuts: boolean;
  mouthDetectClasses: string[];
  mainTab: MainTab;
  bgSubTab: BgSubTab;
  videoSubTab: VideoSubTab;
  videoShaderSubTab: VideoShaderSubTab;
  audioSubTab: AudioSubTab;
  captionsSubTab: CaptionsSubTab;
  editorSubTab: EditorSubTab;
  editorMode: EditorMode;
  selectedFullSegmentId: string | null;
  fullChunkOverrides: Record<string, { startSecond?: number; endSecond?: number }>;
  showAudioTracks: boolean;
  muted: boolean;
  mediaVolume: number;
  outroVolume: number;
  currentPresetId: string | null;
  projectHasVideo: boolean;
  projectHasAudio: boolean;
  videoInfoLoaded: boolean;
  audioInfoLoaded: boolean;
}

/** Build the settings payload to persist. */
function buildSavePayload(settings: AutoSaveSettings) {
  const {
    bg, bgDither, vid, audioReactivity, visualizer, compositionMode, music, musicLibraryDurations, musicTimelineClips, limiter,
    captionMode, captionStyle, captionShader, captionStyleByGuide, captionShaderByGuide,
    bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn,
    activeGuide, cropToGuide, bgExport, vidExport,
    microTimelines, selectedClipId, captionClipEdits,
    customCuts, customCutsClearedAt, jumpCutGapOverrides, jumpCutGapDisabled, jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
    showSilenceGaps, showFillerCuts, showManualCuts, showMouthCuts, mouthDetectClasses,
    mainTab, bgSubTab, videoSubTab, videoShaderSubTab, audioSubTab, captionsSubTab, editorSubTab, editorMode, selectedFullSegmentId, fullChunkOverrides, showAudioTracks, muted, mediaVolume, outroVolume, currentPresetId,
  } = settings;
  return {
    background: bg, backgroundDither: bgDither, video: vid,
    audioReactivity, visualizer, compositionMode, music, musicLibraryDurations, musicTimelineClips, limiter,
    captionMode, captionStyle, captionShader, captionStyleByGuide, captionShaderByGuide,
    layers: { background: bgLayerOn, video: videoLayerOn, captions: captionsLayerOn, music: musicLayerOn, bgOffMode, bgOffColor },
    activeGuide, cropToGuide, exportBackground: bgExport, exportVideo: vidExport,
    microTimelines, selectedClipId, captionClipEdits,
    customCuts, customCutsClearedAt,
    jumpCuts: {
      enabled: jumpCutsEnabled,
      gapMs: jumpCutGapMs,
      paddingMs: jumpCutPaddingMs,
      customPaddingMs: customCutPaddingMs,
      showSilence: showSilenceGaps,
      showFiller: showFillerCuts,
      showManual: showManualCuts,
      showMouth: showMouthCuts,
      mouthClasses: mouthDetectClasses,
      overrides: jumpCutGapOverrides,
      disabled: jumpCutGapDisabled,
    },
    ui: { mainTab, bgSubTab, videoSubTab, videoShaderSubTab, audioSubTab, captionsSubTab, editorSubTab, editorMode, selectedFullSegmentId, fullChunkOverrides, showAudioTracks, muted, mediaVolume, outroVolume, presetId: currentPresetId },
  };
}

/**
 * Auto-save project settings whenever they change. Nothing is sent until
 * `ready` is true — the caller flips it only after the freshly loaded
 * project state (including cuts) has been applied, so a mid-load empty
 * state can never overwrite good data on disk.
 *
 * Returns the live save status for the header indicator. Failures are
 * surfaced in that status instead of being silently swallowed.
 */
export function useAutoSave(activeProjectId: string | null, ready: boolean, settings: AutoSaveSettings): SaveStatus {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref to the latest payload so the beforeunload handler can flush it.
  const pendingPayloadRef = useRef<{ projectId: string; payload: Record<string, any> } | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle', at: null, guardedCount: 0, guardedProtected: 0 });
  const {
    bg, bgDither, vid, audioReactivity, visualizer, compositionMode, music, musicLibraryDurations, musicTimelineClips, limiter,
    captionMode, captionStyle, captionShader, captionStyleByGuide, captionShaderByGuide,
    bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn,
    activeGuide, cropToGuide, bgExport, vidExport,
    microTimelines, selectedClipId, captionClipEdits,
    customCuts, customCutsClearedAt, jumpCutGapOverrides, jumpCutGapDisabled, jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
    showSilenceGaps, showFillerCuts, showManualCuts, showMouthCuts, mouthDetectClasses,
    mainTab, bgSubTab, videoSubTab, videoShaderSubTab, audioSubTab, captionsSubTab, editorSubTab, editorMode, selectedFullSegmentId, fullChunkOverrides, showAudioTracks, muted, mediaVolume, outroVolume, currentPresetId,
    projectHasVideo, projectHasAudio, videoInfoLoaded, audioInfoLoaded,
  } = settings;

  const flushPending = useCallback(() => {
    const pending = pendingPayloadRef.current;
    if (!pending) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    pendingPayloadRef.current = null;
    // Use sendBeacon so the save survives page unload.
    const url = `/api/projects/${encodeURIComponent(pending.projectId)}/settings`;
    navigator.sendBeacon(url, new Blob([JSON.stringify(pending.payload)], { type: 'application/json' }));
  }, []);

  // Flush pending saves on page close / refresh / navigate away.
  useEffect(() => {
    const handler = () => flushPending();
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', handler);
    };
  }, [flushPending]);

  // A new project (or no project) resets the indicator.
  useEffect(() => {
    setStatus({ state: 'idle', at: null, guardedCount: 0, guardedProtected: 0 });
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId || !ready) return;
    // Avoid clobbering persisted settings while a media-backed project is still
    // mid-load. This prevents a stale in-memory state from overwriting clip
    // layouts or export params after refresh/HMR before metadata arrives.
    if (projectHasVideo && !videoInfoLoaded) return;
    if (projectHasAudio && !projectHasVideo && !audioInfoLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const payload = buildSavePayload(settings);
    pendingPayloadRef.current = { projectId: activeProjectId, payload };
    setStatus((prev) => (prev.state === 'saved' || prev.state === 'idle' ? { ...prev, state: 'pending' } : prev));
    const projectId = activeProjectId;
    saveTimerRef.current = setTimeout(() => {
      pendingPayloadRef.current = null;
      saveTimerRef.current = null;
      setStatus((prev) => ({ ...prev, state: 'saving' }));
      saveSettings(projectId, payload).then((res) => {
        setStatus((prev) => ({
          ...prev,
          state: 'saved',
          at: Date.now(),
          guardedCount: res?.preservedCustomCuts ? prev.guardedCount + 1 : prev.guardedCount,
          guardedProtected: res?.preservedCustomCuts ? (res?.preservedCount ?? 0) : prev.guardedProtected,
        }));
      }).catch(() => {
        // Surfaced in the header pill — never silently dropped.
        setStatus((prev) => ({ ...prev, state: 'error' }));
      });
    }, 800);
    return () => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, ready, bg, bgDither, vid, audioReactivity, visualizer, compositionMode, music, musicLibraryDurations, musicTimelineClips, limiter, captionMode, captionStyle, captionShader, captionStyleByGuide, captionShaderByGuide, bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn, activeGuide, cropToGuide, bgExport, vidExport, microTimelines, selectedClipId, captionClipEdits,     customCuts, customCutsClearedAt, jumpCutGapOverrides, jumpCutGapDisabled, jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
    showSilenceGaps, showFillerCuts, showManualCuts, showMouthCuts, mouthDetectClasses, mainTab, bgSubTab, videoSubTab, videoShaderSubTab, audioSubTab, captionsSubTab, editorSubTab, editorMode, selectedFullSegmentId, fullChunkOverrides, showAudioTracks, muted, mediaVolume, outroVolume, currentPresetId, projectHasVideo, projectHasAudio, videoInfoLoaded, audioInfoLoaded]);

  return status;
}
