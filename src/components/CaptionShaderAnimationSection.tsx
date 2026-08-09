import React from 'react';
import type { AnimationRange, CaptionShaderAnimationParams, CaptionShaderParams } from '../lib/types';
import { Section } from './Controls';
import { AnimationRangeControl } from './AnimationRangeControl';

export const CaptionShaderAnimationSection: React.FC<{
  value: CaptionShaderParams;
  onChange: (value: CaptionShaderParams) => void;
  onReset?: () => void;
}> = ({ value, onChange, onReset }) => {
  const animation = value.animation;
  const setRange = (key: keyof CaptionShaderAnimationParams, range: AnimationRange) => {
    onChange({ ...value, animation: { ...animation, [key]: range } });
  };

  return (
    <Section title="Animation" onReset={onReset}>
      <AnimationRangeControl label="speed" value={animation.speed} min={0} max={20} step={0.1} onChange={(range) => setRange('speed', range)} />
      <AnimationRangeControl label={value.waveType === 'noise' ? 'scale' : 'frequency'} value={animation.frequency} min={0} max={240} step={0.5} onChange={(range) => setRange('frequency', range)} />
      <AnimationRangeControl label="amplitude" value={animation.amplitude} min={0} max={0.01} step={0.00005} onChange={(range) => setRange('amplitude', range)} />
      {value.waveType !== 'noise' && (
        <AnimationRangeControl label="angle°" value={animation.angle} min={0} max={360} step={1} onChange={(range) => setRange('angle', range)} />
      )}
      {value.waveType === 'pulse' && (
        <AnimationRangeControl label="pulse width" value={animation.pulseWidth} min={0.05} max={0.95} step={0.01} onChange={(range) => setRange('pulseWidth', range)} />
      )}
    </Section>
  );
};
