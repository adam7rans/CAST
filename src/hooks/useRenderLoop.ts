import type React from 'react';
import { useEffect } from 'react';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import { AudioVisualizerRenderer } from '../lib/AudioVisualizerRenderer';
import type { AudioSource, AudioBands } from '../lib/AudioSource';
import { advanceSidechainDuckGain, computeSidechainTargetDuckGain, type MusicPlayer, type MusicParams } from '../lib/MusicPlayer';
import type { AudioVisualizerParams, BackgroundParams, CompositionMode, DitherParams, VideoShaderParams, ExportParams, AudioReactivityParams } from '../lib/types';
import { resolveExportRange } from '../lib/layoutUtils';

export interface RenderLoopRefs {
  previewWrapRef: React.MutableRefObject<HTMLDivElement | null>;
  bgCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  videoCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  visualizerCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  bgRendererRef: React.MutableRefObject<BackgroundRenderer | null>;
  videoRendererRef: React.MutableRefObject<VideoRenderer | null>;
  visualizerRendererRef: React.MutableRefObject<AudioVisualizerRenderer | null>;
  audioSourceRef: React.MutableRefObject<AudioSource | null>;
  musicPlayerRef: React.MutableRefObject<MusicPlayer | null>;
  videoBlobUrlRef: React.MutableRefObject<string | null>;
  audioBlobUrlRef: React.MutableRefObject<string | null>;
  rafRef: React.MutableRefObject<number | null>;
  startRef: React.MutableRefObject<number>;
  exportingRef: React.MutableRefObject<boolean>;
  lastBandsRef: React.MutableRefObject<AudioBands>;
  speechRmsRef: React.MutableRefObject<number>;
  musicDuckGainRef: React.MutableRefObject<number>;
  limiterReductionRef: React.MutableRefObject<number>;
  bgLayerOnRef: React.MutableRefObject<boolean>;
  videoLayerOnRef: React.MutableRefObject<boolean>;
  audioReactivityRef: React.MutableRefObject<AudioReactivityParams>;
  visualizerRef: React.MutableRefObject<AudioVisualizerParams>;
  compositionModeRef: React.MutableRefObject<CompositionMode>;
  musicRef: React.MutableRefObject<MusicParams>;
  playheadRef: React.MutableRefObject<number>;
  activeExportParamsRef: React.MutableRefObject<ExportParams>;
  timelineDurationRef: React.MutableRefObject<number>;
}

/**
 * Initializes the BackgroundRenderer and VideoRenderer, sets up a ResizeObserver
 * on the preview wrapper, and runs the main animation frame loop.
 */
export function useRenderLoop(
  refs: RenderLoopRefs,
  bg: BackgroundParams,
  bgDither: DitherParams,
  vid: VideoShaderParams,
  setPreviewSize: React.Dispatch<React.SetStateAction<{ w: number; h: number }>>,
) {
  useEffect(() => {
    const {
      previewWrapRef, bgCanvasRef, videoCanvasRef, visualizerCanvasRef,
      bgRendererRef, videoRendererRef, visualizerRendererRef,
      audioSourceRef, musicPlayerRef,
      videoBlobUrlRef, audioBlobUrlRef,
      rafRef, startRef, exportingRef,
      lastBandsRef, speechRmsRef, musicDuckGainRef, limiterReductionRef,
      bgLayerOnRef, videoLayerOnRef, audioReactivityRef, visualizerRef, compositionModeRef, musicRef,
      playheadRef, activeExportParamsRef, timelineDurationRef,
    } = refs;

    bgRendererRef.current = new BackgroundRenderer(bgCanvasRef.current!, bg, bgDither);
    videoRendererRef.current = new VideoRenderer(videoCanvasRef.current!, vid);
    visualizerRendererRef.current = new AudioVisualizerRenderer();

    const fit = () => {
      const el = previewWrapRef.current;
      if (!el) return;
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      setPreviewSize({ w, h });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(previewWrapRef.current!);
    let lastDuckMs = performance.now();
    let visualizerAudio: AudioSource | null = null;

    const loop = () => {
      if (!exportingRef.current) {
        const t = (performance.now() - startRef.current) / 1000;
        const nowMs = performance.now();
        const duckDt = Math.max(0.001, (nowMs - lastDuckMs) / 1000);
        lastDuckMs = nowMs;

        const audio = audioSourceRef.current;
        const ar = audioReactivityRef.current;
        const bands: AudioBands = audio
          ? audio.getBands(ar.attack, ar.release)
          : { rms: 0, low: 0, mid: 0, high: 0 };
        lastBandsRef.current = bands;
        const g = ar.gain;

        const visualizerCanvas = visualizerCanvasRef.current;
        if (visualizerCanvas && visualizerRendererRef.current && compositionModeRef.current === 'audio') {
          if (audio !== visualizerAudio) {
            visualizerRendererRef.current.reset();
            visualizerAudio = audio;
          }
          const width = Math.max(1, Math.round(visualizerCanvas.clientWidth));
          const height = Math.max(1, Math.round(visualizerCanvas.clientHeight));
          if (visualizerCanvas.width !== width || visualizerCanvas.height !== height) {
            visualizerCanvas.width = width;
            visualizerCanvas.height = height;
            visualizerRendererRef.current.reset();
          }
          const ctx = visualizerCanvas.getContext('2d');
          if (ctx) visualizerRendererRef.current.render(ctx, width, height, audio?.getSpectrum(64) ?? new Float32Array(64), visualizerRef.current, true, playheadRef.current);
        }

        const voiceIntensity = Math.min(1, Math.max(
          bands.rms * 4,
          bands.mid,
          bands.low * 0.7,
          bands.high * 0.7,
        ));

        if (bgLayerOnRef.current && bgRendererRef.current) {
          if (audio && ar.enabled) {
            bgRendererRef.current.setModulation({
              speed: bands.rms * g * ar.modSpeed * 1.5,
              brightness: voiceIntensity * g * ar.modBrightness,
            });
          } else {
            bgRendererRef.current.setModulation({ speed: 0, brightness: 0 });
          }
          bgRendererRef.current.renderFrame(t);
        }
        if (videoLayerOnRef.current && videoRendererRef.current) {
          const { end, outroDuration } = resolveExportRange(activeExportParamsRef.current, timelineDurationRef.current);
          const frozenVideoTime = (outroDuration > 0 && playheadRef.current > end) ? end : undefined;
          // Lock shader animation to the timeline/playhead instead of wall-clock
          // time so paused previews, scrubbing, and exports all show the same
          // distortion phase for the same source moment.
          const visualTime = frozenVideoTime ?? playheadRef.current;
          videoRendererRef.current.renderFrame(visualTime, frozenVideoTime);
        }

        const player = musicPlayerRef.current;
        const m = musicRef.current;
        const targetDuck = computeSidechainTargetDuckGain(voiceIntensity, m.sidechain);
        if (player) {
          speechRmsRef.current = voiceIntensity;
          musicDuckGainRef.current = player.applySidechain(voiceIntensity, m.sidechain);
        } else {
          speechRmsRef.current = voiceIntensity;
          musicDuckGainRef.current = advanceSidechainDuckGain(musicDuckGainRef.current, targetDuck, m.sidechain, duckDt);
        }

        if (audio) limiterReductionRef.current = audio.getLimiterReductionDb();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
      audioSourceRef.current?.dispose();
      bgRendererRef.current?.dispose();
      videoRendererRef.current?.dispose();
      visualizerRendererRef.current = null;
      bgRendererRef.current = null;
      videoRendererRef.current = null;
      audioSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
