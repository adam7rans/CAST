import React from 'react';
import { Section, Slider, Toggle, ColorInput, Select } from '../Controls';
import { AnimationRangeControl } from '../AnimationRangeControl';
import { C } from '../../lib/designTokens';
import { resolveAnimationValue } from '../../lib/videoPositionAnimation';
import { GradientStagePanel } from './GradientStagePanel';
import type { AnimationRange } from '../../lib/types';
import type { PipelineStage, ShaderDefinition, StageControl, StageParamValue } from '../../lib/pipeline/types';

const segmentStyle = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '4px 0', border: `1px solid ${C.line3}`, borderRadius: 3, cursor: 'pointer',
  background: active ? C.blue : 'transparent', color: active ? '#fff' : '#888',
  fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
});

type SliderControl = Extract<StageControl, { kind: 'slider' }>;

const defaultRange = (c: SliderControl, value: number): AnimationRange => ({
  enabled: false, from: value, to: Math.min(c.max, value + (c.max - c.min) * 0.25), loop: 4,
});

interface Props {
  stage: PipelineStage;
  def: ShaderDefinition;
  animationTime: number;
  onChange: (stage: PipelineStage) => void;
}

/** Renders the control panel for one pipeline stage straight from its ShaderDefinition. */
export const StageControls: React.FC<Props> = ({ stage, def, animationTime, onChange }) => {
  if (def.customPanel === 'gradient') return <GradientStagePanel stage={stage} onChange={onChange} />;
  const setParam = (key: string, value: StageParamValue) => onChange({ ...stage, params: { ...stage.params, [key]: value } });
  const setRange = (key: string, range: AnimationRange) => onChange({ ...stage, animation: { ...stage.animation, [key]: range } });
  const visible = def.controls.filter((c) => !c.showIf || c.showIf(stage.params));
  const animatable = def.controls.filter((c): c is SliderControl => c.kind === 'slider' && !!c.animatable);

  const renderControl = (c: StageControl) => {
    const value = stage.params[c.key];
    switch (c.kind) {
      case 'slider': {
        const range = stage.animation?.[c.key];
        const live = resolveAnimationValue(range ?? { enabled: false, from: 0, to: 0, loop: 1 }, Number(value), animationTime);
        return <Slider key={c.key} label={c.label} value={live} min={c.min} max={c.max} step={c.step} readOnly={!!range?.enabled} onChange={(v) => setParam(c.key, v)} />;
      }
      case 'toggle':
        return <Toggle key={c.key} label={c.label} value={!!value} onChange={(v) => setParam(c.key, v)} />;
      case 'color':
        return <ColorInput key={c.key} label={c.label} value={String(value)} onChange={(v) => setParam(c.key, v)} />;
      case 'select':
        return <Select key={c.key} label={c.label} value={Number(value)} options={c.options} onChange={(v) => setParam(c.key, parseInt(v, 10))} />;
      case 'segment':
        return (
          <div key={c.key} style={{ display: 'flex', gap: 4, margin: '8px 0 6px' }}>
            {c.options.map((o) => (
              <button key={o.label} onClick={() => setParam(c.key, o.value)} style={segmentStyle(!!value === o.value)}>{o.label}</button>
            ))}
          </div>
        );
    }
  };

  return (
    <>
      <Section
        title={def.label}
        enabled={stage.enabled}
        onToggle={(enabled) => onChange({ ...stage, enabled })}
        onReset={() => onChange({ ...stage, params: { ...def.defaults }, animation: undefined })}
      >
        <div style={{ color: C.faint, fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{def.description}</div>
        {visible.map(renderControl)}
      </Section>
      {animatable.length > 0 && (
        <Section title="Animation" onReset={() => onChange({ ...stage, animation: undefined })}>
          {animatable.map((c) => (
            <AnimationRangeControl
              key={c.key} label={c.label} min={c.min} max={c.max} step={c.step}
              value={stage.animation?.[c.key] ?? defaultRange(c, Number(stage.params[c.key]))}
              onChange={(range) => setRange(c.key, range)}
            />
          ))}
        </Section>
      )}
    </>
  );
};
