import type { CaptionShaderParams } from './types';
import { resolveAnimationValue } from './videoPositionAnimation';

export function resolveCaptionShaderParams(params: CaptionShaderParams, timeSeconds: number): CaptionShaderParams {
  const animation = params.animation;
  return {
    ...params,
    speed: resolveAnimationValue(animation.speed, params.speed, timeSeconds),
    frequency: resolveAnimationValue(animation.frequency, params.frequency, timeSeconds),
    amplitude: resolveAnimationValue(animation.amplitude, params.amplitude, timeSeconds),
    angleDeg: resolveAnimationValue(animation.angle, params.angleDeg, timeSeconds),
    pulseWidth: resolveAnimationValue(animation.pulseWidth, params.pulseWidth, timeSeconds),
  };
}
