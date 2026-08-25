import React, { useEffect, useState } from 'react';
import { Section, Slider, Toggle, Select } from '../Controls';
import { useObsShaderSocket } from '../../hooks/useObsShaderSocket';
import type { ObsSettings } from '../../hooks/useObsShaderSocket';

const DITHER_OPTIONS = [
  { value: 0, label: '0 — Random' },
  { value: 1, label: '1 — Bayer 2×2' },
  { value: 2, label: '2 — Bayer 4×4' },
  { value: 3, label: '3 — Bayer 8×8' },
  { value: 4, label: '4 — Blue noise' },
  { value: 5, label: '5 — Halftone' },
];

const num = (v: unknown, dflt: number) => (typeof v === 'number' ? v : dflt);
const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt);

/**
 * Controls the cast-v2 shader filter in OBS live over obs-websocket.
 * Same control-room experience as the old Metal tab, now driving OBS.
 */
export const MetalCameraPanel: React.FC = () => {
  const { connected, connecting, settings, virtualCamActive, setParams, startVirtualCam, stopVirtualCam } =
    useObsShaderSocket();

  const [local, setLocal] = useState<ObsSettings | null>(null);

  // adopt remote settings when they first arrive; after that we drive
  useEffect(() => {
    if (settings && !local) setLocal(settings);
  }, [settings, local]);

  if (!connected || !local) {
    return (
      <div style={{ padding: 10, fontSize: 11.5, color: 'var(--muted-foreground, #999)', lineHeight: 1.6 }}>
        <div>{connecting ? 'Connecting to OBS…' : 'OBS not reachable.'}</div>
        {!connecting && (
          <div style={{ marginTop: 8 }}>
            Open OBS Studio — this panel connects automatically once it's running
            (WebSocket on port 4455).
          </div>
        )}
      </div>
    );
  }

  const s = local;
  const set = (patch: ObsSettings) => {
    setLocal((prev) => ({ ...(prev ?? {}), ...patch }));
    setParams(patch);
  };

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* status strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
        color: 'var(--muted-foreground, #999)', padding: '2px 0 6px',
        borderBottom: '1px solid #1f1f1f', marginBottom: 4,
      }}>
        <span style={{ color: '#4ade80' }}>●</span>
        <span>OBS live</span>
        <span style={{
          marginLeft: 'auto', padding: '1px 7px', borderRadius: 4,
          background: virtualCamActive ? '#14532d' : '#27272a',
          color: virtualCamActive ? '#4ade80' : '#a1a1aa',
          cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 10.5,
        }}
          onClick={() => (virtualCamActive ? stopVirtualCam() : startVirtualCam())}
        >
          {virtualCamActive ? '● virtual cam ON' : 'start virtual cam'}
        </span>
      </div>

      {/* dither */}
      <Section title="dither">
        <Select
          label="type"
          value={num(s.dither_type, 2)}
          options={DITHER_OPTIONS}
          onChange={(v) => set({ dither_type: Number(v) })}
        />
        <Slider label="alpha threshold" value={num(s.alpha_threshold, 0.5)} min={0} max={1} step={0.01}
          onChange={(v) => set({ alpha_threshold: v })} />
      </Section>

      {/* distortion */}
      <Section title="distortion">
        <Slider label="frequency" value={num(s.distortion_frequency, 20)} min={0} max={150} step={0.5}
          onChange={(v) => set({ distortion_frequency: v })} />
        <Slider label="amplitude" value={num(s.distortion_amplitude, 0.02)} min={0} max={0.15} step={0.001}
          onChange={(v) => set({ distortion_amplitude: v })} />
        <Slider label="speed" value={num(s.distortion_speed, 2)} min={0} max={10} step={0.05}
          onChange={(v) => set({ distortion_speed: v })} />
        <Slider label="angle" value={num(s.distortion_angle, 0)} min={0} max={6.28} step={0.01}
          onChange={(v) => set({ distortion_angle: v })} />
        <Slider label="anim speed" value={num(s.time_scale, 1)} min={0} max={4} step={0.05}
          onChange={(v) => set({ time_scale: v })} />
      </Section>

      {/* tone */}
      <Section title="tone">
        <Slider label="contrast" value={num(s.contrast_amt, 1.5)} min={0} max={4} step={0.01}
          onChange={(v) => set({ contrast_amt: v })} />
        <Slider label="brightness" value={num(s.brightness_amt, 1)} min={0} max={2} step={0.01}
          onChange={(v) => set({ brightness_amt: v })} />
        <Slider label="black point" value={num(s.black_point, 0)} min={0} max={1} step={0.01}
          onChange={(v) => set({ black_point: v })} />
        <Slider label="white point" value={num(s.white_point, 1)} min={0} max={1} step={0.01}
          onChange={(v) => set({ white_point: v })} />
        <Slider label="gamma" value={num(s.gamma_amt, 1)} min={0.1} max={3} step={0.01}
          onChange={(v) => set({ gamma_amt: v })} />
        <Slider label="saturation" value={num(s.saturation_amt, 1)} min={0} max={2} step={0.01}
          onChange={(v) => set({ saturation_amt: v })} />
        <Slider label="exposure" value={num(s.exposure_amt, 0)} min={-3} max={3} step={0.01}
          onChange={(v) => set({ exposure_amt: v })} />
        <Slider label="shadows" value={num(s.shadows_amt, 0)} min={-1} max={1} step={0.01}
          onChange={(v) => set({ shadows_amt: v })} />
        <Slider label="midtones" value={num(s.midtones_amt, 0)} min={-1} max={1} step={0.01}
          onChange={(v) => set({ midtones_amt: v })} />
        <Slider label="highlights" value={num(s.highlights_amt, 0)} min={-1} max={1} step={0.01}
          onChange={(v) => set({ highlights_amt: v })} />
      </Section>

      {/* transform */}
      <Section title="position">
        <Slider label="offset x" value={num(s.position_x, 0)} min={-0.5} max={0.5} step={0.005}
          onChange={(v) => set({ position_x: v })} />
        <Slider label="offset y" value={num(s.position_y, 0)} min={-0.5} max={0.5} step={0.005}
          onChange={(v) => set({ position_y: v })} />
        <Slider label="rotation" value={num(s.position_rotation, 0)} min={-3.14} max={3.14} step={0.01}
          onChange={(v) => set({ position_rotation: v })} />
        <Slider label="zoom" value={num(s.zoom_amt, 1)} min={0.2} max={3} step={0.01}
          onChange={(v) => set({ zoom_amt: v })} />
      </Section>

      <p style={{ fontSize: 10, color: 'var(--muted-foreground, #666)', margin: '8px 0 0', lineHeight: 1.5 }}>
        Drives the cast-v2 shader filter inside OBS. Colors (gradient A/B, background)
        are edited in OBS's filter dialog.
      </p>
    </div>
  );
};
