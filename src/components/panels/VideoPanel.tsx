import React, { useState } from 'react';
import {
  DEFAULT_VIDEO, DEFAULT_VIDEO_GRADIENT, DEFAULT_VIDEO_LEVELS, DEFAULT_VIDEO_TONE,
  DEFAULT_VIDEO_COLOR, DEFAULT_VIDEO_DISTORTION, DEFAULT_VIDEO_DISTORTION_ANIMATION, DEFAULT_VIDEO_DITHER, DEFAULT_VIDEO_REZ,
  DEFAULT_VIDEO_POSITION, DEFAULT_VIDEO_POSITION_ANIMATION, normalizeVideoShaderParams, type VideoShaderParams,
} from '../../lib/types';
import { VIDEO_PRESETS } from '../../lib/presets';
import { Section, Select } from '../Controls';
import {
  VideoGradientSection, VideoImageSection, VideoRezSection,
  VideoPositionSection, VideoDistortionSection, VideoDitherSection,
} from '../ParamControls';
import { VideoPositionAnimationSection } from '../VideoPositionAnimationSection';
import { VideoDistortionAnimationSection } from '../VideoDistortionAnimationSection';
import { TabBar } from '../Tabs';
import { PipelineEditor } from '../pipeline/PipelineEditor';
import { convertToPipeline, defaultPipeline, keepPipeline } from '../../lib/pipeline/legacyConversion';
import type { VideoShaderSubTab, VideoSubTab } from '../../lib/constants';
import type { ProjectMeta } from '../../lib/projectApi';

const MediaDropZone: React.FC<{
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onPickFile: React.ChangeEventHandler<HTMLInputElement>;
}> = ({ onDrop, onPickFile }) => {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); onDrop(e as any); }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '28px 16px',
        border: `2px dashed ${over ? '#1f6feb' : '#444'}`,
        borderRadius: 6,
        background: over ? 'rgba(31,111,235,0.08)' : 'transparent',
        color: over ? '#6ab0ff' : '#666',
        cursor: 'pointer',
        transition: 'border-color 150ms, background 150ms, color 150ms',
        fontFamily: 'inherit',
        fontSize: 13,
        textAlign: 'center',
      }}
    >
      Drop video or audio here
      <input type="file" accept="video/*,audio/*" onChange={onPickFile} style={{ display: 'none' }} />
    </label>
  );
};

interface Props {
  vid: VideoShaderParams;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  videoSubTab: VideoSubTab;
  setVideoSubTab: React.Dispatch<React.SetStateAction<VideoSubTab>>;
  videoShaderSubTab: VideoShaderSubTab;
  setVideoShaderSubTab: React.Dispatch<React.SetStateAction<VideoShaderSubTab>>;
  invertFinalOutput: boolean;
  setInvertFinalOutput: (value: boolean) => void;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  audioMode: boolean;
  playheadSecond: number;
  onPickFile: React.ChangeEventHandler<HTMLInputElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onImportNativeMedia: () => void;
  videoOptimizationResult?: ProjectMeta['videoOptimizationResult'];
}

export const VideoPanel: React.FC<Props> = ({
  vid, setVid, videoSubTab, setVideoSubTab, videoShaderSubTab, setVideoShaderSubTab, invertFinalOutput, setInvertFinalOutput, videoInfo, audioInfo, audioMode, playheadSecond, onPickFile, onDrop, onImportNativeMedia, videoOptimizationResult,
}) => (
  <>
    {!videoInfo && !audioInfo ? (
      <Section title="Import media">
        <MediaDropZone onDrop={onDrop} onPickFile={onPickFile} />
        <button
          onClick={onImportNativeMedia}
          style={{
            display: 'block', width: '100%', padding: '10px 14px', background: '#1f6feb',
            color: '#fff', borderRadius: 3, cursor: 'pointer', border: 'none',
            fontFamily: 'inherit', marginTop: 8,
          }}
        >
          Add video or audio…
        </button>
      </Section>
    ) : (
      <>
        {videoOptimizationResult && (
          <div role="status" style={{ margin: '0 0 12px', padding: '12px 14px', border: '1px solid #39734c', borderRadius: 6, background: '#132419', color: '#d5ffdc', fontSize: 13, lineHeight: 1.6 }}>
            <strong>✓ Compression complete</strong><br />
            {(videoOptimizationResult.originalBytes / 1e9).toFixed(2)} GB original → {(videoOptimizationResult.optimizedBytes / 1e6).toFixed(1)} MB black-and-white MP4
            <div style={{ color: '#a6cbb0', fontSize: 11 }}>
              {((1 - videoOptimizationResult.optimizedBytes / videoOptimizationResult.originalBytes) * 100).toFixed(1)}% smaller · CAST now uses the optimized file
            </div>
          </div>
        )}
        <TabBar<VideoSubTab>
          tabs={[
            { value: 'shader', label: 'Shader', disabled: audioMode },
            ...(vid.pipeline ? [] : [{ value: 'gradient' as const, label: 'Gradient', disabled: audioMode }]),
            { value: 'settings', label: 'Settings' },
          ]}
          value={audioMode && videoSubTab !== 'settings' ? 'settings' : (vid.pipeline && videoSubTab === 'gradient' ? 'shader' : videoSubTab)}
          onChange={setVideoSubTab}
          variant="sub"
        />
        {!audioMode && (
          <>
            {videoSubTab === 'gradient' && !vid.pipeline && (
              <VideoGradientSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_GRADIENT }))} />
            )}
            {(videoSubTab === 'shader' || (videoSubTab === 'gradient' && !!vid.pipeline)) && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Shader
                    </div>
                    <button
                      onClick={() => setVid(v => ({ ...v, shaderEnabled: !v.shaderEnabled }))}
                      style={{
                        width: 32, height: 16, borderRadius: 8, border: 'none', padding: 0, cursor: 'pointer',
                        background: vid.shaderEnabled ? '#1f6feb' : '#333', position: 'relative', transition: 'background 150ms',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, left: vid.shaderEnabled ? 16 : 2,
                        width: 12, height: 12, borderRadius: 6, background: '#fff',
                        transition: 'left 150ms',
                      }} />
                    </button>
                    <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Invert colors
                    </div>
                    <button
                      onClick={() => setInvertFinalOutput(!invertFinalOutput)}
                      style={{
                        width: 32, height: 16, borderRadius: 8, border: 'none', padding: 0, cursor: 'pointer',
                        background: invertFinalOutput ? '#1f6feb' : '#333', position: 'relative', transition: 'background 150ms',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, left: invertFinalOutput ? 16 : 2,
                        width: 12, height: 12, borderRadius: 6, background: '#fff',
                        transition: 'left 150ms',
                      }} />
                    </button>
                  </div>
                  <button
                    onClick={() => setVid(vid.pipeline ? { ...DEFAULT_VIDEO, pipeline: defaultPipeline() } : DEFAULT_VIDEO)}
                    style={{
                      padding: '2px 8px',
                      background: 'transparent',
                      color: '#666',
                      border: '1px solid #333',
                      borderRadius: 3,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#555'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#333'; }}
                  >
                    Restore all
                  </button>
                </div>
                {vid.pipeline ? (
                  <PipelineEditor vid={vid} setVid={setVid} playheadSecond={playheadSecond} />
                ) : (
                <>
                <TabBar<VideoShaderSubTab>
                  tabs={[
                    { value: 'image', label: 'Image' },
                    { value: 'rez', label: 'Rez' },
                    { value: 'distortion', label: 'Distort' },
                    { value: 'dither', label: 'Dither' },
                    { value: 'position', label: 'Position', divider: true },
                  ]}
                  value={videoShaderSubTab}
                  onChange={setVideoShaderSubTab}
                  variant="sub"
                />
                {videoShaderSubTab === 'image' && <VideoImageSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_LEVELS, ...DEFAULT_VIDEO_TONE, ...DEFAULT_VIDEO_COLOR }))} />}
                {videoShaderSubTab === 'rez' && <VideoRezSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_REZ }))} />}
                {videoShaderSubTab === 'distortion' && (
                  <>
                    <VideoDistortionSection value={vid} onChange={setVid} animationTime={playheadSecond} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_DISTORTION }))} />
                    <VideoDistortionAnimationSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_DISTORTION_ANIMATION }))} />
                  </>
                )}
                {videoShaderSubTab === 'dither' && <VideoDitherSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_DITHER }))} />}
                {videoShaderSubTab === 'position' && (
                  <>
                    <VideoPositionSection value={vid} onChange={setVid} animationTime={playheadSecond} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_POSITION }))} />
                    <VideoPositionAnimationSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_POSITION_ANIMATION }))} />
                  </>
                )}
                </>
                )}
              </>
            )}
          </>
        )}
        {videoSubTab === 'settings' && (
          <>
            <Section title="Source">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ color: '#aaa', minWidth: 0 }}>
                  {videoInfo
                    ? <>{videoInfo.name}<br />{videoInfo.w}×{videoInfo.h} · {videoInfo.duration.toFixed(2)}s</>
                    : <>{audioInfo!.name}<br />audio-only · {audioInfo!.duration.toFixed(2)}s</>}
                </div>
                <button
                  onClick={onImportNativeMedia}
                  style={{
                    flexShrink: 0,
                    display: 'inline-block',
                    padding: '6px 12px',
                    background: '#222',
                    color: '#ddd',
                    borderRadius: 3,
                    cursor: 'pointer',
                    border: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  Replace by moving file…
                </button>
              </div>
            </Section>
            {!audioMode && (
              <Section title="Shader engine">
                <div style={{ color: '#888', lineHeight: 1.5, marginBottom: 8 }}>
                  {vid.pipeline
                    ? 'Pipeline: shaders run in the order you set and you can add more. Only this project uses it.'
                    : 'Legacy: one fixed shader (image → rez → distort → dither). Pipeline lets you reorder shaders and add new ones.'}
                </div>
                {!vid.pipeline && (
                  <button
                    onClick={() => {
                      if (window.confirm('Switch THIS project to the shader pipeline? The look stays the same; other projects are not affected. Undo (Cmd+Z) reverts it.')) setVid(convertToPipeline(vid));
                    }}
                    style={{ padding: '6px 12px', background: '#222', color: '#ddd', borderRadius: 3, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
                  >
                    Convert this project to pipeline…
                  </button>
                )}
              </Section>
            )}
            {!audioMode && (
              <Section title="Preset">
                <Select
                  label="load"
                  value={''}
                  options={[
                    { label: '— pick a preset —', value: '' },
                    ...VIDEO_PRESETS.map((p) => ({ label: p.name, value: p.name })),
                  ]}
                  onChange={(name) => {
                    const p = VIDEO_PRESETS.find((x) => x.name === name);
                    if (p) setVid((cur) => keepPipeline(cur, normalizeVideoShaderParams(p.params)));
                  }}
                />
              </Section>
            )}
          </>
        )}
      </>
    )}
  </>
);
