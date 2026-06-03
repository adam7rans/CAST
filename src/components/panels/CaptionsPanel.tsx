import React from 'react';
import {
  DEFAULT_CAPTION_STYLE, DEFAULT_CAPTION_SHADER,
  type CaptionStyle, type CaptionShaderParams, type CaptionShaderWaveType,
} from '../../lib/types';
import type { CaptionMode, TranscriptData } from '../../lib/transcript';
import type { CaptionsSubTab } from '../../lib/constants';
import { Section, Select, Slider, Toggle } from '../Controls';
import { TabBar } from '../Tabs';
import { PillToggle } from '../LayerToggle';
import { CaptionFontControls, CaptionTypeControls } from '../CaptionFontControls';
import { CaptionsEditor } from '../CaptionsEditor';

const WAVE_TYPE_OPTIONS: { label: string; value: CaptionShaderWaveType }[] = [
  { label: 'Sine',     value: 'sine' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Sawtooth', value: 'sawtooth' },
  { label: 'Square',   value: 'square' },
  { label: 'Pulse',    value: 'pulse' },
  { label: 'Noise',    value: 'noise' },
];

const WAVE_TYPE_LABEL: Record<CaptionShaderWaveType, string> = {
  sine: 'sine wave',
  triangle: 'triangle wave',
  sawtooth: 'sawtooth wave',
  square: 'square wave',
  pulse: 'pulse wave',
  noise: 'noise',
};

interface Props {
  captionsSubTab: CaptionsSubTab;
  setCaptionsSubTab: React.Dispatch<React.SetStateAction<CaptionsSubTab>>;
  transcript: TranscriptData | null;
  transcriptName: string | null;
  captionMode: CaptionMode;
  setCaptionMode: React.Dispatch<React.SetStateAction<CaptionMode>>;
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  captionShader: CaptionShaderParams;
  setCaptionShader: React.Dispatch<React.SetStateAction<CaptionShaderParams>>;
  onPickTranscript: React.ChangeEventHandler<HTMLInputElement>;
  onEditorUpdate: (data: TranscriptData) => void;
  onSearchMatchNavigate: (startMs: number, endMs: number) => void;
}

export const CaptionsPanel: React.FC<Props> = ({
  captionsSubTab, setCaptionsSubTab,
  transcript, transcriptName,
  captionMode, setCaptionMode,
  captionStyle, setCaptionStyle,
  captionShader, setCaptionShader,
  onPickTranscript, onEditorUpdate, onSearchMatchNavigate,
}) => (
  <>
    <TabBar<CaptionsSubTab>
      tabs={[
        { value: 'editor', label: 'Editor' },
        { value: 'type',   label: 'Type' },
        { value: 'font',   label: 'Font' },
        { value: 'shader', label: 'Shader' },
      ]}
      value={captionsSubTab}
      onChange={setCaptionsSubTab}
      variant="sub"
    />

    {captionsSubTab === 'editor' && (
      <>
        <Section title="Source">
          {transcript ? (
            <>
              <div style={{ color: '#aaa', marginBottom: 6 }}>
                {transcriptName}<br />
                {transcript.utterances.length} utterance{transcript.utterances.length === 1 ? '' : 's'}
              </div>
              <label style={{
                display: 'inline-block', padding: '4px 10px', background: '#222',
                color: '#ddd', borderRadius: 3, cursor: 'pointer', fontSize: 11,
              }}>
                Replace caption JSON…
                <input type="file" accept="application/json,.json" onChange={onPickTranscript} style={{ display: 'none' }} />
              </label>
            </>
          ) : (
            <>
              <div style={{ color: '#aaa', marginBottom: 8 }}>
                Load a caption JSON (word-level timestamps in ms — same format as
                <code> w3rk17/src/content/talk-transcript-trimmed.json</code>).
              </div>
              <label style={{
                display: 'inline-block', padding: '6px 12px', background: '#1f6feb',
                color: '#fff', borderRadius: 3, cursor: 'pointer',
              }}>
                Choose caption JSON…
                <input type="file" accept="application/json,.json" onChange={onPickTranscript} style={{ display: 'none' }} />
              </label>
            </>
          )}
        </Section>
        <Section title="Editor">
          <CaptionsEditor
            transcript={transcript}
            onUpdate={onEditorUpdate}
            onSearchMatchNavigate={onSearchMatchNavigate}
          />
        </Section>
      </>
    )}

    {captionsSubTab === 'type' && (
      <>
        <Section title="Caption type">
          <div style={{ display: 'flex', gap: 6 }}>
            <PillToggle label="Line mode" on={captionMode === 'line'} onClick={() => setCaptionMode('line')} />
            <PillToggle label="Word mode" on={captionMode === 'word'} onClick={() => setCaptionMode('word')} />
          </div>
        </Section>
        <CaptionTypeControls value={captionStyle} onChange={setCaptionStyle} onReset={() => setCaptionStyle(DEFAULT_CAPTION_STYLE)} />
      </>
    )}

    {captionsSubTab === 'font' && (
      <CaptionFontControls value={captionStyle} onChange={setCaptionStyle} onReset={() => setCaptionStyle(DEFAULT_CAPTION_STYLE)} />
    )}

    {captionsSubTab === 'shader' && (
      <Section title={`Shader (${WAVE_TYPE_LABEL[captionShader.waveType]})`} onReset={() => setCaptionShader(DEFAULT_CAPTION_SHADER)}>
        <Toggle
          label="enabled"
          value={captionShader.enabled}
          onChange={(enabled) => setCaptionShader({ ...captionShader, enabled })}
        />
        <Select
          label="wave"
          value={captionShader.waveType}
          options={WAVE_TYPE_OPTIONS}
          onChange={(v) => setCaptionShader({ ...captionShader, waveType: v as CaptionShaderWaveType })}
        />
        <Slider
          label="speed"
          value={captionShader.speed}
          min={0} max={20} step={0.1}
          ticks={[2, 5, 10]}
          onChange={(speed) => setCaptionShader({ ...captionShader, speed })}
        />
        <Slider
          label={captionShader.waveType === 'noise' ? 'scale' : 'frequency'}
          value={captionShader.frequency}
          min={0} max={240} step={0.5}
          ticks={[20, 60, 120, 180]}
          onChange={(frequency) => setCaptionShader({ ...captionShader, frequency })}
        />
        <Slider
          label="amplitude"
          value={Math.max(0, Math.min(0.01, captionShader.amplitude))}
          min={0} max={0.01} step={0.00005}
          ticks={[0.001, 0.003, 0.005, 0.008]}
          onChange={(amplitude) => setCaptionShader({
            ...captionShader,
            amplitude: Math.max(0, Math.min(0.01, amplitude)),
          })}
        />
        {captionShader.waveType !== 'noise' && (
          <Slider
            label="angle°"
            value={captionShader.angleDeg}
            min={0} max={360} step={1}
            ticks={[0, 90, 180, 270]}
            onChange={(angleDeg) => setCaptionShader({ ...captionShader, angleDeg: Math.round(angleDeg) })}
          />
        )}
        {captionShader.waveType === 'pulse' && (
          <Slider
            label="pulse width"
            value={captionShader.pulseWidth}
            min={0.05} max={0.95} step={0.01}
            ticks={[0.25, 0.5, 0.75]}
            onChange={(pulseWidth) => setCaptionShader({ ...captionShader, pulseWidth })}
          />
        )}
      </Section>
    )}
  </>
);
