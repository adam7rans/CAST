import type { VideoShaderParams } from '../types.models';
import { legacyGradientParams } from './gradientStage';
import { createStage } from './registry';
import type { PipelineStage } from './types';

export const PIPELINE_VERSION = 2;

export function legacyGradientStage(v: VideoShaderParams): PipelineStage {
  return createStage('gradient', { enabled: v.gradientEnabled, params: legacyGradientParams(v) });
}

/** v1 pipelines drew the gradient inside the source pass; v2 makes it a stage. Add it once, at the top, with the old settings. */
export function migratePipeline(pipeline: PipelineStage[], v: VideoShaderParams, version: number | undefined): PipelineStage[] {
  return (version ?? 1) >= PIPELINE_VERSION ? pipeline : [legacyGradientStage(v), ...pipeline];
}
