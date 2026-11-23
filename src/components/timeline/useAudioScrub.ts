import { useCallback, useEffect, useRef } from 'react';
import { AudioScrubber } from '../../lib/audioScrubber';

/**
 * Audio scrubbing while the playhead is dragged. Returns a function to call
 * with each new playhead time; it only makes sound during a drag, and only
 * when `enabled` (paused and not muted: while playing you already hear audio).
 */
export function useAudioScrub(
  projectId: string | null | undefined,
  mediaKey: string,
  dragging: boolean,
  enabled: boolean,
  playhead: number,
) {
  const scrubber = useRef<AudioScrubber | null>(null);
  const active = useRef(false);
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;

  useEffect(() => {
    scrubber.current = projectId && mediaKey ? new AudioScrubber(projectId) : null;
    return () => { scrubber.current?.dispose(); scrubber.current = null; };
  }, [projectId, mediaKey]);

  useEffect(() => {
    if (dragging && enabled) {
      scrubber.current?.begin(playheadRef.current);
      active.current = true;
    } else if (active.current) {
      scrubber.current?.end();
      active.current = false;
    }
  }, [dragging, enabled]);

  return useCallback((time: number) => {
    if (active.current) scrubber.current?.move(time);
  }, []);
}
