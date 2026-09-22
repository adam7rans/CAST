import { CaptionShaderRenderer } from '../lib/CaptionShaderRenderer';
import type { AudioSource } from '../lib/AudioSource';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import { AudioVisualizerRenderer } from '../lib/AudioVisualizerRenderer';
import { GUIDES } from '../lib/constants';
import { resolveExportRange } from '../lib/layoutUtils';
import { buildExportBaseName } from '../lib/exporter';
import { fingerprintExportRender } from '../lib/exportFingerprint';
import {
  createProjectExport,
} from '../lib/projectApi';
import { finishRenderedExport, renderExportFrames } from './useExporter.renderFrames';
import {
  buildExportTiming,
  resolveLayerRenderFrame,
} from './useExporter.shared';
import type {
  ExporterCallbacks,
  ExporterRefs,
  ExporterState,
} from './useExporter.types';

export type {
  ExporterCallbacks,
  ExporterRefs,
  ExporterState,
} from './useExporter.types';

export function createExportComposition(
  refs: ExporterRefs,
  state: ExporterState,
  callbacks: ExporterCallbacks,
) {
  return async (
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal,
  ) => {
    const { activeProjectIdRef, bgRendererRef, videoRendererRef, videoElRef, audioElRef, audioSourceRef, activeExportParamsRef, exportingRef, startRef, jumpCutGapListRef } = refs;
    const { bg, bgDither, vid, bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn, jumpCutsEnabled, audioReactivity, visualizer, compositionMode, music, limiter, mediaVolume, outroVolume, musicTimelineClips, captionMode, captionStyle, captionShader, transcript, videoInfo, audioInfo, cropToGuide, activeGuide, availableGuides, previewFrame } = state;
    const { setPlaying, setProjectStatus, addToast, updateToast, fitPreviewBack } = callbacks;

    const projectId = activeProjectIdRef.current;
    if (!projectId) throw new Error('Create or select a project before exporting.');
    const video = videoElRef.current;
    // Audio-only projects can't turn the video layer off in the UI, so treat the
    // video layer as off whenever no video is actually loaded.
    const effectiveVideoLayerOn = videoLayerOn && !!video;
    const visualizerLayerOn = compositionMode === 'audio' && visualizer.enabled;
    if (!bgLayerOn && !effectiveVideoLayerOn && !captionsLayerOn && !visualizerLayerOn) throw new Error('Turn on at least one layer before exporting.');
    const audio = audioSourceRef.current;
    const params = activeExportParamsRef.current;
    const exportMode = params.exportMode ?? 'web';
    const sourceDuration = videoInfo?.duration ?? audioInfo?.duration ?? null;
    const range = resolveExportRange(params, sourceDuration);
    const exportBaseName = buildExportBaseName(params.filenamePrefix, range.start, range.end);

    // Show feedback BEFORE the slow steps below: audio analysis fetches and
    // decodes the entire media file, which takes minutes on long videos.
    // Without an early toast the click looks dead.
    exportingRef.current = true;
    const mediaEl = video ?? audioElRef.current;
    if (mediaEl) { mediaEl.pause(); setPlaying(false); }
    const toastId = addToast('Preparing export…', 'progress', true);

    // Visualizers require deterministic analysis; optional background
    // reactivity can still degrade gracefully if analysis is unavailable.
    if (visualizerLayerOn) {
      if (!audio) throw new Error('Audio visualizer export requires a loaded audio source.');
      try { await audio.preloadEnvelope(); }
      catch (error) { throw new Error(`Could not analyze audio for visualizer export: ${error instanceof Error ? error.message : String(error)}`); }
    } else if (audio && audioReactivity.enabled) {
      updateToast(toastId, 'Analyzing audio for export… (one-time per session, can take minutes on long videos)', 'progress');
      try { await audio.preloadEnvelope(); } catch (error) { console.warn('Audio envelope preload failed', error); }
    }

    const activeGuideObj = (cropToGuide ? GUIDES.find((g) => g.key === activeGuide) : null) ?? null;
    const width = activeGuideObj ? activeGuideObj.w : Math.max(1, Math.floor(params.width));
    const height = activeGuideObj ? activeGuideObj.h : Math.max(1, Math.floor(params.height));
    const preserveAlpha = exportMode === 'master' && !bgLayerOn;
    const renderFrame = resolveLayerRenderFrame(width, height, videoInfo, activeGuideObj);

    const timing = buildExportTiming(
      range,
      params.fps,
      jumpCutsEnabled,
      jumpCutGapListRef.current,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create export canvas.');
    const invertCanvas = params.invertFinalOutput ? document.createElement('canvas') : null;
    const invertCtx = invertCanvas?.getContext('2d') ?? null;
    if (invertCanvas) {
      invertCanvas.width = width;
      invertCanvas.height = height;
    }
    const bgRenderer = bgLayerOn
      ? new BackgroundRenderer(document.createElement('canvas'), bg, bgDither)
      : null;
    const videoRenderer = effectiveVideoLayerOn
      ? new VideoRenderer(document.createElement('canvas'), vid)
      : null;
    videoRenderer?.setVideo(video);
    const visualizerRenderer = compositionMode === 'audio' && visualizer.enabled ? new AudioVisualizerRenderer() : null;

    const capRenderer = (captionsLayerOn && captionShader.enabled) ? new CaptionShaderRenderer(document.createElement('canvas')) : null;
    const capOffscreen = capRenderer ? document.createElement('canvas') : null;
    if (capRenderer && capOffscreen) {
      capRenderer.resize(width, height, 1);
      capOffscreen.width = width;
      capOffscreen.height = height;
    }

    updateToast(toastId, 'Creating project export folder…', 'progress');

    try {
      bgRenderer?.setSize(renderFrame.w, renderFrame.h);
      videoRenderer?.setSize(renderFrame.w, renderFrame.h);
      const renderFingerprint = await fingerprintExportRender({
        projectId,
        exportBaseName,
        width,
        height,
        fps: params.fps,
        range,
        timing: {
          total: timing.total,
          duration: timing.duration,
          contentDuration: timing.contentDuration,
          kept: timing.kept,
        },
        invertFinalOutput: params.invertFinalOutput,
        bg,
        bgDither,
        vid,
        bgLayerOn,
        bgOffMode,
        bgOffColor,
        videoLayerOn: effectiveVideoLayerOn,
        captionsLayerOn,
        audioReactivity,
        visualizer,
        compositionMode,
        captionMode,
        captionStyle,
        captionShader,
        transcript,
        videoInfo,
        audioInfo,
        cropToGuide,
        activeGuide,
      });
      const created = await createProjectExport(projectId, {
        prefix: exportBaseName,
        width,
        height,
        fps: params.fps,
        totalFrames: timing.total,
        exportMode,
        preserveAlpha,
        startTime: range.start,
        duration: timing.duration,
        baseDuration: timing.contentDuration,
        outroDuration: range.outroDuration,
        musicOutputStartTime: timing.musicOutputStartTime,
        keptSegments: timing.activeGapsForExport.length > 0
          ? timing.kept.map(({ srcStart, srcEnd }) => ({ srcStart, srcEnd }))
          : undefined,
        layers: {
          background: bgLayerOn,
          video: effectiveVideoLayerOn,
          captions: captionsLayerOn,
          music: musicLayerOn,
        },
        musicTimelineClips,
        musicSnapshot: music,
        limiter,
        ui: {
          mediaVolume,
          outroVolume,
        },
        renderFingerprint,
      });
      const initialProgress = Math.round(((created.nextFrame ?? 0) / timing.total) * 100);
      setProjectStatus({ kind: 'progress', message: 'Rendering export frames', detail: created.folder, progress: initialProgress });
      updateToast(
        toastId,
        created.resumed
          ? `Resuming ${created.folder} at frame ${(created.nextFrame ?? 0) + 1}`
          : `Exporting to ${created.folder}`,
        'progress',
      );
      await renderExportFrames({
        refs,
        state,
        callbacks,
        signal,
        onProgress,
        projectId,
        created,
        exportBaseName,
        params,
        range,
        width,
        height,
        preserveAlpha,
        renderFrame,
        timing,
        video,
        audio,
        resources: {
          canvas,
          ctx,
          invertCanvas,
          invertCtx,
          bgRenderer,
          videoRenderer,
          visualizerRenderer,
          capRenderer,
          capOffscreen,
        },
      });

      updateToast(toastId, 'Frame render complete. Stitching video…', 'progress');
      const finished = await finishRenderedExport(projectId, created.exportId);
      if (finished.error) {
        updateToast(toastId, finished.error, 'error');
        setProjectStatus({ kind: 'error', message: finished.error, detail: finished.folder });
        return finished.folder;
      }
      setProjectStatus({ kind: 'success', message: 'Video export complete', detail: finished.videoFile ? `${finished.folder}/${finished.videoFile}` : finished.folder });
      updateToast(toastId, finished.videoFile ? `Export complete: ${finished.videoFile}` : `Export complete: ${finished.folder}`, 'success');
      return finished.videoFile ? `${finished.folder}/${finished.videoFile}` : finished.folder;
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal.aborted) {
        updateToast(toastId, 'Export cancelled', 'info');
        setProjectStatus({ kind: 'idle', message: 'Export cancelled', detail: `Folder: projects/${projectId}` });
      } else {
        updateToast(toastId, `Export failed: ${error?.message ?? error}`, 'error');
        setProjectStatus({ kind: 'error', message: `Export failed: ${error?.message ?? error}` });
      }
      throw error;
    } finally {
      bgRenderer?.dispose();
      videoRenderer?.dispose();
      capRenderer?.dispose();
      fitPreviewBack();
      startRef.current = performance.now();
      exportingRef.current = false;
    }
  };
}
