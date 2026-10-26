import type { VideoGradientStop, VideoShaderParams } from '../types.models';
import { withGradientStops } from '../types.videoGradient';
import type { PipelineStage, StageParams } from './types';

const GRADIENT_KEYS = [
  'gradientType', 'gradientBlendMode', 'gradientOpacity', 'gradientAngle', 'gradientScale',
  'gradientOffsetX', 'gradientOffsetY', 'gradientGuideVisible', 'gradientStops',
] as const;

/** Presents a gradient stage as VideoShaderParams so the existing gradient editor and drag-guide overlay work on it. */
export function gradientView(base: VideoShaderParams, stage: PipelineStage): VideoShaderParams {
  const merged = { ...base, ...(stage.params as Partial<VideoShaderParams>), gradientEnabled: stage.enabled };
  return withGradientStops(merged, stage.params.gradientStops as VideoGradientStop[]);
}

export function stageFromGradientView(stage: PipelineStage, view: VideoShaderParams): PipelineStage {
  const params: StageParams = { ...stage.params };
  for (const key of GRADIENT_KEYS) (params as Record<string, unknown>)[key] = view[key];
  return { ...stage, enabled: view.gradientEnabled, params };
}

/** The gradient stage the preview drag-guide should edit, if any. */
export function guideStage(v: VideoShaderParams): PipelineStage | undefined {
  return v.pipeline?.find((s) => s.type === 'gradient' && s.enabled && s.params.gradientGuideVisible);
}

/** Builds the gradient stage equivalent to a legacy gradient overlay. */
export function legacyGradientParams(v: VideoShaderParams): StageParams {
  const params: StageParams = {};
  for (const key of GRADIENT_KEYS) (params as Record<string, unknown>)[key] = v[key];
  return params;
}
