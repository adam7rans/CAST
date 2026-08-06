import React from 'react';
import type { AnimationRange } from '../lib/types';
import { Slider, Toggle } from './Controls';

export const AnimationRangeControl: React.FC<{
  label: string;
  value: AnimationRange;
  min: number;
  max: number;
  step: number;
  displayScale?: number;
  onChange: (value: AnimationRange) => void;
}> = ({ label, value, min, max, step, displayScale = 1, onChange }) => (
  <>
    <Toggle label={label} value={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />
    {value.enabled && (
      <>
        <Slider label={`${label} from`} value={value.from / displayScale} min={min} max={max} step={step} onChange={(from) => onChange({ ...value, from: from * displayScale })} />
        <Slider label={`${label} to`} value={value.to / displayScale} min={min} max={max} step={step} onChange={(to) => onChange({ ...value, to: to * displayScale })} />
        <Slider label="loop" value={value.loop} min={0.25} max={360} step={0.25} onChange={(loop) => onChange({ ...value, loop })} />
      </>
    )}
  </>
);
