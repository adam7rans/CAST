import type React from 'react';
import { useEffect, useRef } from 'react';
import { clamp } from './timelineUtils';

interface Options {
  viewStart: number;
  viewEnd: number;
  /** Set the visible range (seconds); the timeline clamps it to the media. */
  setView: (start: number, end: number) => void;
  /** The element whose width maps to the visible range (the tracks). */
  trackRef: React.RefObject<HTMLElement | null>;
  /** Called when the user moves the view themselves (turns off follow-playhead). */
  onUserMove: () => void;
}

/** Wheel deltas arrive in pixels, lines or pages depending on the device. */
const pixels = (delta: number, mode: number, pageWidth: number) =>
  mode === 1 ? delta * 16 : mode === 2 ? delta * pageWidth : delta;

const ZOOM_SPEED = 0.006;

/**
 * Trackpad and mouse navigation over the timeline:
 * - two-finger swipe, mouse wheel, Shift+wheel or tilt wheel: pan;
 * - pinch (Chrome reports it as Ctrl+wheel) or Ctrl/Cmd+wheel: zoom around the cursor.
 * The listener is non-passive so a pinch over the timeline zooms the timeline,
 * not the whole page; outside the timeline nothing changes.
 */
export function useTimelineGestures(rootRef: React.RefObject<HTMLElement | null>, options: Options) {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      const { viewStart, viewEnd, setView, trackRef, onUserMove } = latest.current;
      const rect = (trackRef.current ?? root).getBoundingClientRect();
      if (rect.width <= 0) return;
      const span = viewEnd - viewStart;
      const dx = pixels(e.deltaX, e.deltaMode, rect.width);
      const dy = pixels(e.deltaY, e.deltaMode, rect.width);

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = clamp(Math.exp(dy * ZOOM_SPEED), 0.5, 2); // >1 zooms out
        const at = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        const anchor = viewStart + at * span;
        const next = span * factor;
        setView(anchor - at * next, anchor + (1 - at) * next);
        onUserMove();
        return;
      }

      // Pan along whichever axis moved most (a mouse wheel only has the vertical one).
      const move = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      if (move === 0) return;
      e.preventDefault();
      const shift = (move / rect.width) * span;
      setView(viewStart + shift, viewEnd + shift);
      onUserMove();
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [rootRef]);
}
