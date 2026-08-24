import React from 'react';
import type { AudioVisualizerParams } from '../../lib/types';
import { DEFAULT_AUDIO_VISUALIZER } from '../../lib/types';
import { ColorInput, Section, Select, Slider, Toggle } from '../Controls';

interface Props {
  value: AudioVisualizerParams;
  onChange: React.Dispatch<React.SetStateAction<AudioVisualizerParams>>;
}

export const VisualizerPanel: React.FC<Props> = ({ value, onChange }) => {
  const set = (patch: Partial<AudioVisualizerParams>) => onChange((current) => ({ ...current, ...patch }));
  return (
    <Section title="Audio visualizer" onReset={() => onChange(DEFAULT_AUDIO_VISUALIZER)}>
      <Toggle label="enabled" value={value.enabled} onChange={(enabled) => set({ enabled })} />
      <Select
        label="display"
        value={value.style}
        options={[
          { label: 'Spectrum', value: 'spectrum' },
          { label: 'MEL history', value: 'mel' },
        ]}
        onChange={(style) => set({ style: style as AudioVisualizerParams['style'] })}
      />
      <Select
        label="position"
        value={value.placement}
        options={[
          { label: 'Bottom edge', value: 'bottom' },
          { label: 'Top edge', value: 'top' },
          { label: 'Full frame', value: 'frame' },
        ]}
        onChange={(placement) => set({ placement: placement as AudioVisualizerParams['placement'] })}
      />
      <Slider label="sensitivity" value={value.sensitivity} min={0.25} max={4} step={0.05} onChange={(sensitivity) => set({ sensitivity })} />
      <Slider label="depth" value={value.height} min={5} max={100} step={1} onChange={(height) => set({ height })} />
      <Slider label="line width" value={value.thickness} min={1} max={12} step={1} onChange={(thickness) => set({ thickness })} />
      <Slider label="opacity" value={value.opacity} min={0.05} max={1} step={0.01} onChange={(opacity) => set({ opacity })} />
      <ColorInput label="bass color" value={value.colorLow} onChange={(colorLow) => set({ colorLow })} />
      <ColorInput label="treble color" value={value.colorHigh} onChange={(colorHigh) => set({ colorHigh })} />
      <div style={{ color: '#666', fontSize: 10, lineHeight: 1.5, marginTop: 8 }}>
        Spectrum shows bass at left and treble at right. MEL history scrolls recent frequency energy away from the selected edge.
      </div>
    </Section>
  );
};
