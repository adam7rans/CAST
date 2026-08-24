import React, { useEffect, useState } from 'react';
import { Section, Slider, Toggle, Select } from '../Controls';
import { useMetalCameraSocket } from '../../hooks/useMetalCameraSocket';
import type { DitherType, MetalParamPatch } from '../../lib/metalCamera.types';

const DITHER_OPTIONS: { value: DitherType; label: string }[] = [
  { value: 'bayer2x2', label: 'Bayer 2×2' },
  { value: 'bayer4x4', label: 'Bayer 4×4' },
  { value: 'bayer8x8', label: 'Bayer 8×8' },
  { value: 'random', label: 'Random' },
  { value: 'blueNoise', label: 'Blue noise' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'floydSteinberg', label: 'Floyd–Steinberg' },
  { value: 'atkinson', label: 'Atkinson' },
];

export const MetalCameraPanel: React.FC = () => {
  const { connected, connecting, params, stats, sendPatch, loadPreset, listPresets } =
    useMetalCameraSocket();
  const [presets, setPresets] = useState<string[]>([]);

  useEffect(() => {
    if (connected) listPresets().then(setPresets).catch(() => setPresets([]));
  }, [connected, listPresets]);

  if (!connected) {
    return (
      <div style={{ padding: 10, fontSize: 11.5, color: 'var(--muted-foreground, #999)' }}>
        {connecting ? 'Connecting to cast-metal…' : 'cast-metal not reachable.'}
        {!connecting && (
          <div style={{ marginTop: 6, color: 'var(--muted-foreground, #777)', lineHeight: 1.5 }}>
            Start it with:
            <br />
            <code style={{ background: '#1a1a1a', padding: '2px 5px', borderRadius: 4 }}>
              cd ~/Documents/CAST/cast-metal &amp;&amp; swift run castmetal
            </code>
          </div>
        )}
      </div>
    );
  }

  if (!params) {
    return (
      <div style={{ padding: 10, fontSize: 11.5, color: 'var(--muted-foreground, #999)' }}>
        Connected — waiting for params…
      </div>
    );
  }

  const set = (patch: MetalParamPatch) => sendPatch(patch);
  const p = params;

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Status strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--muted-foreground, #999)',
          padding: '2px 0 6px',
          borderBottom: '1px solid #1f1f1f',
          marginBottom: 4,
        }}
      >
        <span style={{ color: connected ? '#4ade80' : '#f87171' }}>●</span>
        <span>{connected ? 'cast-metal live' : 'reconnecting…'}</span>
        {stats?.fps ? <span>{Math.round(stats.fps)} fps</span> : null}
        {stats?.camera ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{stats.camera}</span> : null}
      </div>

      {/* Preset loader */}
      {presets.length > 0 && (
        <Section title="preset">
          <Select
            label="load"
            value=""
            options={[{ value: '', label: 'choose preset…' }, ...presets.map((n) => ({ value: n, label: n }))]}
            onChange={async (v) => {
              if (v) await loadPreset(String(v));
            }}
          />
        </Section>
      )}

      {/* Shader master switches */}
      <Section title="shader">
        <Toggle label="shader enabled" value={p.shaderEnabled} onChange={(v) => set({ shaderEnabled: v })} />
        <Toggle label="dither" value={p.ditherEnabled} onChange={(v) => set({ ditherEnabled: v })} />
        <Slider label="alpha threshold" value={p.alphaThreshold} min={0} max={1} step={0.01} onChange={(v) => set({ alphaThreshold: v })} />
      </Section>

      {/* Dither */}
      <Section title="dither">
        <Select
          label="type"
          value={p.ditherType}
          options={DITHER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => set({ ditherType: v as DitherType })}
        />
        <Slider label="scale" value={p.ditherScale} min={0.1} max={8} step={0.05} onChange={(v) => set({ ditherScale: v })} />
        <Toggle label="gradient fill" value={p.ditherGradient} onChange={(v) => set({ ditherGradient: v })} />
        <Slider label="grad angle" value={p.ditherGradientAngle} min={0} max={6.28} step={0.01} onChange={(v) => set({ ditherGradientAngle: v })} />
        <Slider label="grad scale" value={p.ditherGradientScale} min={0.1} max={5} step={0.01} onChange={(v) => set({ ditherGradientScale: v })} />
        <Slider label="grad offset x" value={p.ditherGradientOffsetX} min={-1} max={1} step={0.01} onChange={(v) => set({ ditherGradientOffsetX: v })} />
        <Slider label="grad offset y" value={p.ditherGradientOffsetY} min={-1} max={1} step={0.01} onChange={(v) => set({ ditherGradientOffsetY: v })} />
      </Section>

      {/* Tone */}
      <Section title="tone">
        <Slider label="contrast" value={p.contrast} min={0} max={4} step={0.01} onChange={(v) => set({ contrast: v })} />
        <Slider label="brightness" value={p.brightness} min={0} max={2} step={0.01} onChange={(v) => set({ brightness: v })} />
        <Slider label="black point" value={p.blackPoint} min={0} max={1} step={0.005} onChange={(v) => set({ blackPoint: v })} />
        <Slider label="white point" value={p.whitePoint} min={0} max={1} step={0.005} onChange={(v) => set({ whitePoint: v })} />
        <Slider label="gamma" value={p.gamma} min={0.1} max={3} step={0.01} onChange={(v) => set({ gamma: v })} />
        <Slider label="saturation" value={p.saturation} min={0} max={2} step={0.01} onChange={(v) => set({ saturation: v })} />
        <Slider label="exposure" value={p.exposure} min={-3} max={3} step={0.01} onChange={(v) => set({ exposure: v })} />
        <Slider label="clarity" value={p.clarity} min={-1} max={1} step={0.01} onChange={(v) => set({ clarity: v })} />
        <Slider label="shadows" value={p.shadows} min={-1} max={1} step={0.01} onChange={(v) => set({ shadows: v })} />
        <Slider label="midtones" value={p.midtones} min={-1} max={1} step={0.01} onChange={(v) => set({ midtones: v })} />
        <Slider label="highlights" value={p.highlights} min={-1} max={1} step={0.01} onChange={(v) => set({ highlights: v })} />
      </Section>

      {/* Distortion */}
      <Section title="distortion">
        <Slider label="frequency" value={p.distortionFrequency} min={0} max={150} step={0.5} onChange={(v) => set({ distortionFrequency: v })} />
        <Slider label="amplitude" value={p.distortionAmplitude} min={0} max={0.15} step={0.001} onChange={(v) => set({ distortionAmplitude: v })} />
        <Slider label="speed" value={p.distortionSpeed} min={0} max={10} step={0.05} onChange={(v) => set({ distortionSpeed: v })} />
        <Slider label="angle" value={p.distortionAngle} min={0} max={6.28} step={0.01} onChange={(v) => set({ distortionAngle: v })} />
      </Section>

      {/* Position / transform */}
      <Section title="position">
        <Slider label="offset x" value={p.positionX} min={-0.5} max={0.5} step={0.005} onChange={(v) => set({ positionX: v })} />
        <Slider label="offset y" value={p.positionY} min={-0.5} max={0.5} step={0.005} onChange={(v) => set({ positionY: v })} />
        <Slider label="rotation" value={p.positionRotation} min={-3.14} max={3.14} step={0.01} onChange={(v) => set({ positionRotation: v })} />
        <Slider label="zoom" value={p.positionScale} min={0.2} max={3} step={0.01} onChange={(v) => set({ positionScale: v })} />
        <Slider label="dist rotation" value={p.rotation} min={-3.14} max={3.14} step={0.01} onChange={(v) => set({ rotation: v })} />
        <Slider label="dist scale" value={p.scale} min={0.2} max={3} step={0.01} onChange={(v) => set({ scale: v })} />
      </Section>

      {/* Rez pixelation */}
      <Section title="rez">
        <Toggle label="enabled" value={p.rezEnabled} onChange={(v) => set({ rezEnabled: v })} />
        <Slider label="cell w" value={p.rezCellWidth} min={1} max={64} step={1} onChange={(v) => set({ rezCellWidth: Math.round(v) })} />
        <Slider label="cell h" value={p.rezCellHeight} min={1} max={64} step={1} onChange={(v) => set({ rezCellHeight: Math.round(v) })} />
        <Slider label="levels" value={p.rezColorLevels} min={2} max={32} step={1} onChange={(v) => set({ rezColorLevels: Math.round(v) })} />
        <Slider label="mix" value={p.rezMix} min={0} max={1} step={0.01} onChange={(v) => set({ rezMix: v })} />
        <Slider label="jitter" value={p.rezJitter} min={0} max={1} step={0.01} onChange={(v) => set({ rezJitter: v })} />
      </Section>

      {/* Gradient overlay */}
      <Section title="gradient overlay">
        <Toggle label="enabled" value={p.gradientEnabled} onChange={(v) => set({ gradientEnabled: v })} />
        <Select
          label="blend"
          value={p.gradientBlendMode}
          options={[
            { value: 'normal', label: 'normal' },
            { value: 'multiply', label: 'multiply' },
            { value: 'screen', label: 'screen' },
            { value: 'overlay', label: 'overlay' },
          ]}
          onChange={(v) => set({ gradientBlendMode: v as typeof p.gradientBlendMode })}
        />
        <Slider label="opacity" value={p.gradientOpacity} min={0} max={1} step={0.01} onChange={(v) => set({ gradientOpacity: v })} />
        <Slider label="angle" value={p.gradientAngle} min={0} max={6.28} step={0.01} onChange={(v) => set({ gradientAngle: v })} />
        <Slider label="scale" value={p.gradientScale} min={0.1} max={5} step={0.01} onChange={(v) => set({ gradientScale: v })} />
      </Section>

      <p style={{ fontSize: 10, color: 'var(--muted-foreground, #666)', margin: '8px 0 0', lineHeight: 1.5 }}>
        Output → OBS: add a Window Capture source for the “CAST Metal” window, then Start Virtual Camera.
      </p>
    </div>
  );
};
