import React from 'react';
import { C, ACCENT, ALPHA } from '../../lib/designTokens';
import { Icon } from '../ui/Icon';
import { fmt } from './timelineUtils';

const SPEEDS = [0.5, 1, 2] as const;
const speedLabel = (r: number) => (Number.isInteger(r) ? `${r}×` : `${r}×`);

interface Props {
  playing?: boolean;
  onTogglePlay?: () => void;
  playhead: number;
  viewStart: number;
  viewEnd: number;
  viewSpan: number;
  playbackRate?: number;
  onSetPlaybackRate?: (rate: number) => void;
  muted?: boolean;
  onToggleMuted?: () => void;
  showAudioTracks: boolean;
  onToggleAudioTracks?: () => void;
}

/* Timeline transport row (Row 1 of the redesign): circular play/pause,
   timecode, view-range, speed segmented control, mute, and a right-aligned
   "View" toggle for music-track-strip visibility. */
export const TimelineTransport: React.FC<Props> = ({
  playing, onTogglePlay, playhead, viewStart, viewEnd, viewSpan,
  playbackRate = 1, onSetPlaybackRate, muted, onToggleMuted,
  showAudioTracks, onToggleAudioTracks,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 30 }}>
    {onTogglePlay && (
      <button
        onClick={onTogglePlay}
        title={playing ? 'Pause' : 'Play'}
        style={{
          width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: ACCENT, color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 2px 10px ${ALPHA(ACCENT, 0.3)}`, flexShrink: 0,
        }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={14} color="#111" />
      </button>
    )}

    <span style={{ fontSize: 12.5, color: C.text, fontVariantNumeric: 'tabular-nums', minWidth: 62 }}>{fmt(playhead)}</span>

    <span style={{ fontSize: 10, color: C.faint }}>
      view {fmt(viewStart)} – {fmt(viewEnd)} ({fmt(viewSpan)})
    </span>

    {onSetPlaybackRate && (
      <div style={{ display: 'inline-flex', background: C.bar, border: `1px solid ${C.line2}`, borderRadius: 7, padding: 2, gap: 2 }}>
        {SPEEDS.map((sp) => {
          const active = Math.abs(playbackRate - sp) < 0.001;
          return (
            <button
              key={sp}
              onClick={() => onSetPlaybackRate(sp)}
              style={{
                padding: '3px 8px', fontSize: 10, letterSpacing: 0.5, borderRadius: 5, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? ALPHA(ACCENT, 0.18) : 'transparent',
                color: active ? C.text : C.faint,
                boxShadow: active ? `inset 0 0 0 1px ${ALPHA(ACCENT, 0.55)}` : 'none',
              }}
            >
              {speedLabel(sp)}
            </button>
          );
        })}
      </div>
    )}

    {onToggleMuted && (
      <button
        onClick={onToggleMuted}
        title={muted ? 'Unmute' : 'Mute'}
        style={{ background: 'transparent', border: 'none', color: muted ? C.fainter : C.dim, cursor: 'pointer', padding: 4, display: 'flex' }}
      >
        <Icon name={muted ? 'mute' : 'vol'} size={15} />
      </button>
    )}

    {onToggleAudioTracks && (
      <button
        onClick={onToggleAudioTracks}
        title="Toggle music-track visibility"
        style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, padding: '4px 10px',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5,
          background: showAudioTracks ? ALPHA(ACCENT, 0.16) : 'transparent',
          border: `1px solid ${showAudioTracks ? ACCENT : C.line2}`,
          color: showAudioTracks ? C.text : C.faint,
        }}
      >
        <Icon name="music" size={12} />View
      </button>
    )}
  </div>
);
