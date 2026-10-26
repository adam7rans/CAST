import type { AnimationRange, VideoGradientStop } from '../types.models';

export type StageParamValue = number | boolean | string | VideoGradientStop[];
export type StageParams = Record<string, StageParamValue>;

/** One shader in the pipeline. Stages run top-to-bottom, each reading the previous output. */
export interface PipelineStage {
  id: string;
  type: string;
  enabled: boolean;
  params: StageParams;
  /** Optional loop animation per numeric param (keyed by param name). */
  animation?: Record<string, AnimationRange>;
}

interface ControlBase {
  key: string;
  label: string;
  /** Only show this control when the predicate holds for the stage's params. */
  showIf?: (p: StageParams) => boolean;
}

export type StageControl =
  | (ControlBase & { kind: 'slider'; min: number; max: number; step: number; animatable?: boolean })
  | (ControlBase & { kind: 'toggle' })
  | (ControlBase & { kind: 'color' })
  | (ControlBase & { kind: 'select'; options: { label: string; value: number }[] })
  | (ControlBase & { kind: 'segment'; options: { label: string; value: boolean }[] });

/** A registered shader type. Add a file under stages/ and list it in registry.ts to make a new shader. */
export interface ShaderDefinition {
  type: string;
  label: string;
  description: string;
  defaults: StageParams;
  controls: StageControl[];
  /** Renders a hand-built panel instead of `controls` (used by gradient). */
  customPanel?: 'gradient';
  /** Optional cleanup applied whenever a stage of this type is created or loaded. */
  normalize?: (params: StageParams) => StageParams;
  /**
   * GLSL fragment source. Receives `tInput` (previous stage output), `uResolution`,
   * `uTime`, `vUv`, and one `u_<paramKey>` uniform per entry in `defaults`
   * (boolean→bool, number→float, string(hex color)→vec3).
   */
  fragment: string;
}
