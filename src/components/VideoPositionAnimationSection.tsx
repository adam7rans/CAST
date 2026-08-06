import React from 'react';
import type { AnimationRange, VideoPositionAnimationParams, VideoShaderParams } from '../lib/types';
import { Section } from './Controls';
import { AnimationRangeControl } from './AnimationRangeControl';

const RAD_PER_DEG = Math.PI / 180;

export const VideoPositionAnimationSection: React.FC<{
  value: VideoShaderParams;
  onChange: (value: VideoShaderParams) => void;
  onReset?: () => void;
}> = ({ value, onChange, onReset }) => {
  const animation = value.positionAnimation;
  const setAnimation = (patch: Partial<VideoPositionAnimationParams>) => {
    onChange({ ...value, positionAnimation: { ...animation, ...patch } });
  };
  const setRange = (key: keyof VideoPositionAnimationParams, range: AnimationRange) => {
    setAnimation({ [key]: range });
  };

  return (
    <Section title="Animation" onReset={onReset}>
      <AnimationRangeControl label="horizontal" value={animation.horizontal} min={-1} max={1} step={0.005} onChange={(range) => setRange('horizontal', range)} />
      <AnimationRangeControl label="vertical" value={animation.vertical} min={-1} max={1} step={0.005} onChange={(range) => setRange('vertical', range)} />
      <AnimationRangeControl label="rotation" value={animation.rotation} min={0} max={360} step={0.5} displayScale={RAD_PER_DEG} onChange={(range) => setRange('rotation', range)} />
      <AnimationRangeControl label="scale" value={animation.scale} min={0.1} max={3} step={0.01} onChange={(range) => setRange('scale', range)} />
    </Section>
  );
};
