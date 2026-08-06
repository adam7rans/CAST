import React from 'react';
import type { AnimationRange, VideoDistortionAnimationParams, VideoShaderParams } from '../lib/types';
import { Section } from './Controls';
import { AnimationRangeControl } from './AnimationRangeControl';

const RAD_PER_DEG = Math.PI / 180;

export const VideoDistortionAnimationSection: React.FC<{
  value: VideoShaderParams;
  onChange: (value: VideoShaderParams) => void;
  onReset?: () => void;
}> = ({ value, onChange, onReset }) => {
  const animation = value.distortionAnimation;
  const setRange = (key: keyof VideoDistortionAnimationParams, range: AnimationRange) => {
    onChange({ ...value, distortionAnimation: { ...animation, [key]: range } });
  };

  return (
    <Section title="Animation" onReset={onReset}>
      <AnimationRangeControl label="rotation" value={animation.rotation} min={-180} max={180} step={0.5} displayScale={RAD_PER_DEG} onChange={(range) => setRange('rotation', range)} />
      <AnimationRangeControl label="scale" value={animation.scale} min={0.1} max={3} step={0.01} onChange={(range) => setRange('scale', range)} />
      <AnimationRangeControl label="wave freq" value={animation.frequency} min={0} max={200} step={0.5} onChange={(range) => setRange('frequency', range)} />
      <AnimationRangeControl label="wave amp" value={animation.amplitude} min={0} max={0.1} step={0.001} onChange={(range) => setRange('amplitude', range)} />
      <AnimationRangeControl label="wave speed" value={animation.speed} min={-5} max={5} step={0.05} onChange={(range) => setRange('speed', range)} />
      <AnimationRangeControl label="wave angle" value={animation.angle} min={0} max={Math.PI * 2} step={0.01} onChange={(range) => setRange('angle', range)} />
    </Section>
  );
};
