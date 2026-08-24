import React from 'react';
import type { MainTab } from '../lib/constants';
import type { SidebarPanelProps } from './panels/SidebarPanel.types';
import { C, LAYER_COLORS } from '../lib/designTokens';
import { Icon } from './ui/Icon';
import { Popover } from './ui/Popover';
import { PillToggle } from './LayerToggle';
import { ProjectBar } from './ProjectBar';

type TopBarProps = Pick<
  SidebarPanelProps,
  | 'projects' | 'activeProjectId' | 'onSelectProject' | 'onCreateProject'
  | 'videoInfo' | 'audioInfo' | 'audioMode' | 'compositionMode' | 'setCompositionMode'
  | 'bgLayerOn' | 'setBgLayerOn' | 'videoLayerOn' | 'setVideoLayerOn'
  | 'captionsLayerOn' | 'setCaptionsLayerOn' | 'musicLayerOn' | 'setMusicLayerOn'
  | 'activeGuide' | 'setActiveGuide' | 'cropToGuide' | 'setCropToGuide' | 'availableGuides'
  | 'mainTab' | 'setMainTab'
>;

interface LayerDef { label: string; on: boolean; toggle: () => void; color: string; hidden?: boolean }

const TABS: { value: MainTab; label: string }[] = [
  { value: 'background', label: 'Background' },
  { value: 'video', label: 'Video' },
  { value: 'metal', label: 'Metal' },
  { value: 'captions', label: 'Captions' },
  { value: 'audio', label: 'Audio' },
  { value: 'editor', label: 'Editor' },
  { value: 'export', label: 'Export' },
];

const LayerEye: React.FC<{ layer: LayerDef }> = ({ layer }) => (
  <button
    onClick={layer.toggle}
    title={`${layer.label} layer — click to ${layer.on ? 'hide' : 'show'}`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 3px', fontFamily: 'inherit' }}
  >
    <Icon name={layer.on ? 'eye' : 'eyeOff'} size={14} color={layer.on ? layer.color : C.fainter} />
    <span style={{ fontSize: 10.5, color: layer.on ? C.dim : C.fainter }}>{layer.label}</span>
  </button>
);

export const TopBar: React.FC<TopBarProps> = (p) => {
  const layers: LayerDef[] = [
    { label: 'Background', on: p.bgLayerOn, toggle: () => p.setBgLayerOn((v) => !v), color: LAYER_COLORS.background },
    { label: 'Video', on: p.videoLayerOn, toggle: () => p.setVideoLayerOn((v) => !v), color: LAYER_COLORS.video, hidden: p.audioMode },
    { label: 'Captions', on: p.captionsLayerOn, toggle: () => p.setCaptionsLayerOn((v) => !v), color: LAYER_COLORS.captions },
    { label: 'Music', on: p.musicLayerOn, toggle: () => p.setMusicLayerOn((v) => !v), color: LAYER_COLORS.music },
  ];
  const fileLabel = p.videoInfo
    ? `${p.videoInfo.name} · ${p.videoInfo.w}×${p.videoInfo.h}`
    : p.audioInfo ? `${p.audioInfo.name} · audio` : '';
  const guideActive = p.cropToGuide || p.activeGuide !== null;

  return (
    <div style={{ flexShrink: 0, background: C.bar, borderBottom: `1px solid ${C.line}` }}>
      {/* Row A — topline: project select + badges + New */}
      <ProjectBar projects={p.projects} activeId={p.activeProjectId} onSelect={p.onSelectProject} onCreate={p.onCreateProject} />

      {/* Row B — layers + mode/guide popovers + filename */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {layers.filter((l) => !l.hidden).map((l) => <LayerEye key={l.label} layer={l} />)}
        </div>

        <span style={{ width: 1, height: 16, background: C.line }} />

        <Popover
          title="Composition mode"
          trigger={() => <><Icon name="sliders" size={12} />{p.compositionMode === 'audio' ? 'Audio' : 'Video'}</>}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <PillToggle label="Video" on={p.compositionMode === 'video'} disabled={!p.videoInfo} onClick={() => p.setCompositionMode('video')} />
            <PillToggle label="Audio only" on={p.compositionMode === 'audio'} disabled={!p.audioMode} onClick={() => p.setCompositionMode('audio')} activeColor="#bf5af2" />
          </div>
        </Popover>

        <Popover
          title="Frame / crop guides"
          trigger={() => <><Icon name="crop" size={12} color={guideActive ? C.orange : undefined} />Guides</>}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {p.availableGuides.map((g) => (
              <PillToggle
                key={g.key}
                label={g.label}
                on={p.activeGuide === g.key}
                onClick={() => p.setActiveGuide((cur) => (cur === g.key ? null : g.key))}
              />
            ))}
          </div>
          <PillToggle label="Crop to guide" on={p.cropToGuide} onClick={() => p.setCropToGuide((v) => !v)} activeColor={C.orange} />
        </Popover>

        {fileLabel && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>
            {fileLabel}
          </span>
        )}
      </div>

      {/* Row C — underlined panel tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '0 8px', borderBottom: `1px solid ${C.line}` }}>
        {TABS.map((t) => {
          const label = t.value === 'video' && p.audioMode ? 'Vis' : t.label;
          const active = p.mainTab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => p.setMainTab(t.value)}
              style={{
                padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, letterSpacing: 0.2,
                color: active ? C.text : C.faint,
                borderBottom: `2px solid ${active ? C.text : 'transparent'}`,
                marginBottom: -1, transition: 'color .12s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
