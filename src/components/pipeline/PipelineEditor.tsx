import React, { useState } from 'react';
import { Section } from '../Controls';
import { VideoPositionSection } from '../ParamControls';
import { VideoPositionAnimationSection } from '../VideoPositionAnimationSection';
import { C } from '../../lib/designTokens';
import { DEFAULT_VIDEO_POSITION, DEFAULT_VIDEO_POSITION_ANIMATION, type VideoShaderParams } from '../../lib/types';
import { SHADER_DEFINITIONS, createStage, getShaderDefinition } from '../../lib/pipeline/registry';
import type { PipelineStage } from '../../lib/pipeline/types';
import { StageControls } from './StageControls';

const SOURCE = 'source';

const iconButton: React.CSSProperties = {
  width: 20, height: 20, padding: 0, background: 'transparent', color: C.faint, border: 'none',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, lineHeight: 1,
};

interface Props {
  vid: VideoShaderParams;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  playheadSecond: number;
}

export const PipelineEditor: React.FC<Props> = ({ vid, setVid, playheadSecond }) => {
  const stages = vid.pipeline ?? [];
  const [selected, setSelected] = useState<string>(stages[0]?.id ?? SOURCE);
  const [dragId, setDragId] = useState<string | null>(null);
  const setStages = (next: PipelineStage[]) => setVid((v) => ({ ...v, pipeline: next }));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stages.length || from === to) return;
    const next = stages.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    setStages(next);
  };
  const add = (type: string) => {
    const stage = createStage(type);
    setStages([...stages, stage]);
    setSelected(stage.id);
  };
  const remove = (id: string) => {
    setStages(stages.filter((s) => s.id !== id));
    if (selected === id) setSelected(SOURCE);
  };
  const update = (stage: PipelineStage) => setStages(stages.map((s) => (s.id === stage.id ? stage : s)));

  const rowStyle = (active: boolean, dragging: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
    border: `1px solid ${active ? C.blue : C.line2}`, background: active ? 'rgba(31,111,235,0.10)' : C.field,
    opacity: dragging ? 0.4 : 1, marginBottom: 4,
  });

  const selectedStage = stages.find((s) => s.id === selected);
  const selectedDef = selectedStage ? getShaderDefinition(selectedStage.type) : undefined;
  const instanceCount = (type: string, id: string) => {
    const same = stages.filter((s) => s.type === type);
    return same.length > 1 ? ` ${same.findIndex((s) => s.id === id) + 1}` : '';
  };

  return (
    <>
      <Section title="Pipeline">
        <div style={{ color: C.faint, fontSize: 11, marginBottom: 6 }}>
          Runs top to bottom. Drag rows or use the arrows to reorder.
        </div>
        <div onClick={() => setSelected(SOURCE)} style={rowStyle(selected === SOURCE, false)}>
          <span style={{ width: 20, textAlign: 'center', color: C.faint }}>▸</span>
          <span style={{ flex: 1, color: C.text, fontSize: 12 }}>Source · position</span>
        </div>
        {stages.map((stage, i) => (
          <div
            key={stage.id}
            draggable
            onDragStart={() => setDragId(stage.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) move(stages.findIndex((s) => s.id === dragId), i); setDragId(null); }}
            onClick={() => setSelected(stage.id)}
            style={rowStyle(selected === stage.id, dragId === stage.id)}
          >
            <span title="Drag to reorder" style={{ color: C.fainter, cursor: 'grab', width: 14 }}>⠿</span>
            <button
              title={stage.enabled ? 'On — click to bypass' : 'Off — click to enable'}
              onClick={(e) => { e.stopPropagation(); update({ ...stage, enabled: !stage.enabled }); }}
              style={{ ...iconButton, color: stage.enabled ? C.green : C.fainter, fontSize: 14 }}
            >●</button>
            <span style={{ flex: 1, color: stage.enabled ? C.text : C.faint, fontSize: 12 }}>
              {(getShaderDefinition(stage.type)?.label ?? stage.type) + instanceCount(stage.type, stage.id)}
            </span>
            <button title="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(i, i - 1); }} style={{ ...iconButton, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
            <button title="Move down" disabled={i === stages.length - 1} onClick={(e) => { e.stopPropagation(); move(i, i + 1); }} style={{ ...iconButton, opacity: i === stages.length - 1 ? 0.3 : 1 }}>▼</button>
            <button title="Remove" onClick={(e) => { e.stopPropagation(); remove(stage.id); }} style={iconButton}>✕</button>
          </div>
        ))}
        <select
          value=""
          onChange={(e) => { if (e.target.value) add(e.target.value); }}
          style={{
            marginTop: 4, width: '100%', background: C.field, color: C.dim, border: `1px dashed ${C.line3}`, borderRadius: 5,
            padding: '6px 8px', fontFamily: 'inherit', fontSize: 11.5, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.8,
          }}
        >
          <option value="">+ Add shader…</option>
          {SHADER_DEFINITIONS.map((d) => <option key={d.type} value={d.type}>{d.label} — {d.description}</option>)}
        </select>
      </Section>

      {selected === SOURCE && (
        <>
          <VideoPositionSection value={vid} onChange={setVid} animationTime={playheadSecond} onReset={() => setVid((v) => ({ ...v, ...DEFAULT_VIDEO_POSITION }))} />
          <VideoPositionAnimationSection value={vid} onChange={setVid} onReset={() => setVid((v) => ({ ...v, ...DEFAULT_VIDEO_POSITION_ANIMATION }))} />
        </>
      )}
      {selectedStage && selectedDef && (
        <StageControls stage={selectedStage} def={selectedDef} animationTime={playheadSecond} onChange={update} />
      )}
    </>
  );
};
