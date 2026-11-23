import React from 'react';
import { fmt } from './timelineUtils';

interface Props {
  playhead: number;
  playheadVisible: boolean;
  /** Playhead position as a percentage of the visible range. */
  visPlay: number;
  onTrackDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPlayheadHandleDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}

/** Thin bar above the tracks with the draggable playhead knob. */
export const TimelineScrubBar: React.FC<Props> = ({ playhead, playheadVisible, visPlay, onTrackDown, onPlayheadHandleDown }) => (
  <div
    onPointerDown={onTrackDown}
    style={{
      position: 'relative', height: 18, background: '#0f0f0f', border: '1px solid #202020',
      borderRadius: 4, userSelect: 'none', cursor: 'ew-resize',
    }}
  >
    {playheadVisible && (
      <div
        onPointerDown={onPlayheadHandleDown}
        title={`Playhead ${fmt(playhead)} — drag to scrub`}
        style={{
          position: 'absolute', left: `calc(${visPlay}% - 8px)`, top: 1, width: 16, height: 14,
          borderRadius: 999, background: '#ffffff', boxShadow: '0 0 8px rgba(255,255,255,0.45)',
          cursor: 'grab', zIndex: 8,
        }}
      />
    )}
  </div>
);
