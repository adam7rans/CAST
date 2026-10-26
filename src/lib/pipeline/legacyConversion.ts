import type { AnimationRange, VideoShaderParams } from '../types.models';
import { DEFAULT_VIDEO } from '../types.defaults';
import { createStage } from './registry';
import { PIPELINE_VERSION, legacyGradientStage } from './gradientMigration';
import type { PipelineStage } from './types';

const DEG = 180 / Math.PI;

function degRange(range: AnimationRange): AnimationRange {
  return { ...range, from: range.from * DEG, to: range.to * DEG };
}

/**
 * Builds the pipeline that reproduces a legacy single-pass setup. Order matches what the
 * legacy shader does internally: gradient -> distort -> image -> rez -> dither (position lives in the fixed source pass).
 */
export function legacyToPipeline(v: VideoShaderParams): PipelineStage[] {
  const d = v.distortionAnimation;
  return [
    legacyGradientStage(v),
    // Legacy always applied rotate/scale, but only rippled the wave while dither was on.
    createStage('distort', {
      params: {
        rotation: v.rotation * DEG, scale: v.scale, waveFreq: v.distortionFrequency, waveAmp: v.ditherEnabled ? v.distortionAmplitude : 0,
        waveSpeed: v.distortionSpeed, waveAngle: v.distortionAngle * DEG,
      },
      animation: {
        rotation: degRange(d.rotation), scale: d.scale, waveFreq: d.frequency, waveAmp: v.ditherEnabled ? d.amplitude : { ...d.amplitude, enabled: false },
        waveSpeed: d.speed, waveAngle: degRange(d.angle),
      },
    }),
    createStage('image', {
      params: {
        blackPoint: v.blackPoint, whitePoint: v.whitePoint, brightness: v.brightness, contrast: v.contrast,
        shadows: v.shadows, midtones: v.midtones, highlights: v.highlights, exposure: v.exposure, gamma: v.gamma,
        saturation: v.saturation, clarity: v.clarity,
      },
    }),
    createStage('rez', {
      enabled: v.rezEnabled,
      params: { cellWidth: v.rezCellWidth, cellHeight: v.rezCellHeight, colorLevels: v.rezColorLevels, mix: v.rezMix, jitter: v.rezJitter },
    }),
    createStage('dither', {
      enabled: v.ditherEnabled,
      params: {
        type: v.ditherType, scale: v.ditherScale, threshold: v.threshold, alphaThreshold: v.alphaThreshold,
        gradient: v.ditherGradient, color: v.ditherColor, colorA: v.ditherGradientColorA, colorB: v.ditherGradientColorB,
        angle: v.ditherGradientAngle * DEG, spread: v.ditherGradientScale, offsetX: v.ditherGradientOffsetX, offsetY: v.ditherGradientOffsetY,
      },
    }),
  ];
}

/** Pipeline used by "Restore all": the stock look, in the stock order. */
export function defaultPipeline(): PipelineStage[] {
  return legacyToPipeline(DEFAULT_VIDEO);
}

/** Switch a legacy video config over to the pipeline engine, keeping its current look. */
export function convertToPipeline(v: VideoShaderParams): VideoShaderParams {
  return { ...v, pipeline: legacyToPipeline(v), pipelineVersion: PIPELINE_VERSION };
}

/** Applying a legacy-format preset to a pipeline project converts it instead of dropping the project back to legacy. */
export function keepPipeline(current: VideoShaderParams, incoming: VideoShaderParams): VideoShaderParams {
  return current.pipeline && !incoming.pipeline ? convertToPipeline(incoming) : incoming;
}
