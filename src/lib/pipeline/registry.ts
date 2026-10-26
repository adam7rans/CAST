import type { PipelineStage, ShaderDefinition, StageParams } from './types';
import { imageStage } from './stages/image';
import { rezStage } from './stages/rez';
import { distortStage } from './stages/distort';
import { ditherStage } from './stages/dither';
import { posterizeStage } from './stages/posterize';
import { gradientStage } from './stages/gradient';

/** Every shader the pipeline can run. To add a new shader: create stages/<name>.ts and list it here. */
export const SHADER_DEFINITIONS: ShaderDefinition[] = [
  imageStage, rezStage, distortStage, ditherStage, posterizeStage, gradientStage,
];

export function getShaderDefinition(type: string): ShaderDefinition | undefined {
  return SHADER_DEFINITIONS.find((d) => d.type === type);
}

let idCounter = 0;
export function newStageId(type: string): string {
  idCounter += 1;
  return `${type}-${Date.now().toString(36)}${idCounter}`;
}

export function createStage(type: string, overrides: Partial<PipelineStage> & { params?: StageParams } = {}): PipelineStage {
  const def = getShaderDefinition(type);
  const params = { ...(def?.defaults ?? {}), ...(overrides.params ?? {}) };
  return {
    id: overrides.id ?? newStageId(type),
    type,
    enabled: overrides.enabled ?? true,
    params: def?.normalize ? def.normalize(params) : params,
    ...(overrides.animation ? { animation: overrides.animation } : {}),
  };
}

/** Drops unknown shader types and fills in missing params so older saves keep loading as shaders evolve. */
export function normalizePipeline(input: unknown): PipelineStage[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const stages: PipelineStage[] = [];
  for (const raw of input as Partial<PipelineStage>[]) {
    if (!raw || typeof raw.type !== 'string' || !getShaderDefinition(raw.type)) continue;
    stages.push(createStage(raw.type, {
      id: typeof raw.id === 'string' ? raw.id : undefined,
      enabled: raw.enabled !== false,
      params: raw.params,
      animation: raw.animation,
    }));
  }
  return stages;
}
