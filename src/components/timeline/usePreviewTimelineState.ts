import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { MIN_VIEW_SEC, OUTRO_DUR, clamp, type DragKind, type PreviewTimelineProps } from './timelineUtils';

function clipEnd(clip: { startSecond: number; durationSecond: number }) {
  return clip.startSecond + clip.durationSecond;
}

export function usePreviewTimelineState({
  duration,
  playhead,
  onPlayheadChange,
  outroEnabled,
  microTimelines,
  clipEditingEnabled = true,
  musicTimelineClips = [],
  musicDuration,
  musicPlayhead,
  selectedId,
  pendingClipStart,
  onSelectMusicClip,
  onMusicPlayheadChange,
  onClipRangeChange,
  onMoveMusicClip,
  onAdjustMusicClipFade,
  skipGapsEnabled = false,
  skipGaps = [],
  skipGapsEffective = [],
  onAdjustSkipGap,
  onSelectGap,
}: PreviewTimelineProps) {
  const [hoverGapKey, setHoverGapKey] = useState<string | null>(null);
  const [view, setView] = useState({ s: 0, e: Math.max(0.01, duration + (outroEnabled ? OUTRO_DUR : 0), musicDuration ?? 0) });
  const [followPlayhead, setFollowPlayhead] = useState(false);
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const totalDuration = Math.max(0.01, duration);
  const projectDuration = totalDuration + (outroEnabled ? OUTRO_DUR : 0);
  const effectiveMusicDuration = Math.max(0.01, musicDuration ?? projectDuration);
  const effectiveMusicPlayhead = musicPlayhead ?? playhead;
  const timelineDuration = Math.max(projectDuration, effectiveMusicDuration);

  useEffect(() => {
    if (timelineDuration > MIN_VIEW_SEC * 1.5) setView({ s: 0, e: timelineDuration });
  }, [timelineDuration]);

  const viewStart = view.s;
  const viewEnd = Math.max(view.s + MIN_VIEW_SEC, Math.min(view.e, timelineDuration));
  const viewSpan = Math.max(MIN_VIEW_SEC, viewEnd - viewStart);

  useEffect(() => {
    if (!followPlayhead || viewSpan >= timelineDuration * 0.99) return;
    const margin = viewSpan * 0.25;
    if (playhead < viewStart + margin * 0.3 || playhead > viewStart + viewSpan - margin * 0.3) {
      const nextStart = clamp(playhead - margin, 0, Math.max(0, timelineDuration - viewSpan));
      setView({ s: nextStart, e: nextStart + viewSpan });
    }
  }, [followPlayhead, playhead, timelineDuration, viewSpan, viewStart]);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const musicTrackRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef(0);
  const selectedClip = microTimelines.find((clip) => clip.id === selectedId) ?? null;

  const secToPct = (time: number) => ((time - viewStart) / viewSpan) * 100;
  const musicSecToPct = (time: number) => ((time - viewStart) / viewSpan) * 100;
  const timeAtClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(viewStart + (clamp(clientX - rect.left, 0, rect.width) / rect.width) * viewSpan, 0, projectDuration);
  };
  const musicTimeAtClientX = (clientX: number) => {
    const rect = musicTrackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(viewStart + (clamp(clientX - rect.left, 0, rect.width) / rect.width) * viewSpan, 0, effectiveMusicDuration);
  };

  const skippedSec = skipGapsEnabled
    ? skipGapsEffective.reduce((total, gap) => {
        const overlapStart = Math.max(selectedClip ? selectedClip.startSecond : 0, gap.startMs / 1000);
        const overlapEnd = Math.min(selectedClip ? selectedClip.endSecond : projectDuration, gap.endMs / 1000);
        return overlapEnd > overlapStart ? total + overlapEnd - overlapStart : total;
      }, 0)
    : 0;
  const baseDur = selectedClip ? selectedClip.endSecond - selectedClip.startSecond : projectDuration;
  const finalDur = baseDur - skippedSec;

  useEffect(() => {
    if (!dragKind) return;
    const onMove = (event: PointerEvent) => {
      if (dragKind === 'play') return void onPlayheadChange(timeAtClientX(event.clientX));
      if (dragKind === 'scroll') {
        const rect = scrollRef.current?.getBoundingClientRect();
        if (!rect) return;
        const thumbWidth = (viewSpan / timelineDuration) * rect.width;
        const newThumbStart = clamp(event.clientX - rect.left - dragOffsetRef.current, 0, Math.max(0, rect.width - thumbWidth));
        const nextStart = clamp((newThumbStart / rect.width) * timelineDuration, 0, Math.max(0, timelineDuration - viewSpan));
        return void setView({ s: nextStart, e: nextStart + viewSpan });
      }
      if (!dragKind || typeof dragKind !== 'object') return;
      const timeMs = timeAtClientX(event.clientX) * 1000;
      const time = timeMs / 1000;
      if ((dragKind.kind === 'gap-start' || dragKind.kind === 'gap-end') && onAdjustSkipGap) {
        const gap = skipGaps.find((item) => item.key === dragKind.key);
        if (!gap) return;
        return void (dragKind.kind === 'gap-start'
          ? onAdjustSkipGap(dragKind.key, clamp(timeMs, 0, gap.endMs - 20), gap.endMs)
          : onAdjustSkipGap(dragKind.key, gap.startMs, clamp(timeMs, gap.startMs + 20, projectDuration * 1000)));
      }
      if ((dragKind.kind === 'clip-start' || dragKind.kind === 'clip-end') && clipEditingEnabled && onClipRangeChange) {
        const clip = microTimelines.find((item) => item.id === dragKind.id);
        if (!clip) return;
        return void (dragKind.kind === 'clip-start'
          ? onClipRangeChange(dragKind.id, clamp(time, 0, clip.endSecond - 0.01), clip.endSecond)
          : onClipRangeChange(dragKind.id, clip.startSecond, clamp(time, clip.startSecond + 0.01, totalDuration)));
      }
      if (dragKind.kind === 'music-move' && onMoveMusicClip) {
        const musicTime = musicTimeAtClientX(event.clientX);
        const trackRect = musicTrackRef.current?.getBoundingClientRect();
        const nextTrackIndex = trackRect
          ? (clamp(Math.floor((event.clientY - trackRect.top) / Math.max(1, trackRect.height / 2)), 0, 1) as 0 | 1)
          : undefined;
        return void onMoveMusicClip(dragKind.id, Math.max(0, musicTime - dragKind.offset), nextTrackIndex);
      }
      if ((dragKind.kind === 'music-fade-in' || dragKind.kind === 'music-fade-out') && onAdjustMusicClipFade) {
        const clip = musicTimelineClips.find((item) => item.id === dragKind.id);
        if (!clip) return;
        const musicTime = musicTimeAtClientX(event.clientX);
        return void onAdjustMusicClipFade(
          dragKind.id,
          dragKind.kind === 'music-fade-in' ? 'fadeInSecond' : 'fadeOutSecond',
          dragKind.kind === 'music-fade-in' ? clamp(musicTime - clip.startSecond, 0, clip.durationSecond) : clamp(clipEnd(clip) - musicTime, 0, clip.durationSecond),
        );
      }
    };
    const stopDragging = () => setDragKind(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [clipEditingEnabled, dragKind, effectiveMusicDuration, microTimelines, musicTimelineClips, onAdjustMusicClipFade, onAdjustSkipGap, onClipRangeChange, onMoveMusicClip, onPlayheadChange, projectDuration, skipGaps, timelineDuration, totalDuration, viewSpan, viewStart]);

  const startDrag = (kind: Exclude<DragKind, null | 'scroll'>) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    setDragKind(kind);
  };

  const setViewClamped = (start: number, end: number) => {
    const span = Math.max(MIN_VIEW_SEC, Math.min(timelineDuration, end - start));
    const nextEnd = clamp(start + span, span, timelineDuration);
    const nextStart = clamp(nextEnd - span, 0, Math.max(0, timelineDuration - span));
    setView({ s: nextStart, e: nextEnd });
  };

  const zoomIn = () => setViewClamped(playhead - Math.max(MIN_VIEW_SEC, viewSpan / 2) / 2, playhead + Math.max(MIN_VIEW_SEC, viewSpan / 2) / 2);
  const zoomOut = () => setViewClamped(playhead - Math.min(timelineDuration, viewSpan * 2) / 2, playhead + Math.min(timelineDuration, viewSpan * 2) / 2);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.tagName === 'SELECT' || active?.isContentEditable) return;
      if (event.key === '=') return void (event.preventDefault(), zoomIn());
      if (event.key === '-') return void (event.preventDefault(), zoomOut());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playhead, timelineDuration, viewSpan]);

  return {
    hoverGapKey,
    setHoverGapKey,
    viewStart,
    viewEnd,
    viewSpan,
    musicViewStart: viewStart,
    musicViewSpan: viewSpan,
    trackRef,
    musicTrackRef,
    scrollRef,
    dragKind,
    setDragKind,
    startDrag,
    secToPct,
    musicSecToPct,
    timeAtClientX,
    musicTimeAtClientX,
    selectedClip,
    skippedSec,
    finalDur,
    focusClip: () => selectedClip && setViewClamped((selectedClip.startSecond + selectedClip.endSecond) / 2 - Math.min(timelineDuration, Math.max(MIN_VIEW_SEC, selectedClip.endSecond - selectedClip.startSecond) / 0.9) / 2, (selectedClip.startSecond + selectedClip.endSecond) / 2 + Math.min(timelineDuration, Math.max(MIN_VIEW_SEC, selectedClip.endSecond - selectedClip.startSecond) / 0.9) / 2),
    zoomIn,
    zoomOut,
    resetView: () => setView({ s: 0, e: timelineDuration }),
    followPlayhead,
    setFollowPlayhead,
    scrollThumbPct: (viewSpan / timelineDuration) * 100,
    scrollThumbLeftPct: (viewStart / timelineDuration) * 100,
    musicVisPlay: musicSecToPct(effectiveMusicPlayhead),
    musicPlayheadVisible: musicSecToPct(effectiveMusicPlayhead) >= 0 && musicSecToPct(effectiveMusicPlayhead) <= 100,
    visPlay: secToPct(playhead),
    playheadVisible: secToPct(playhead) >= 0 && secToPct(playhead) <= 100,
    onScrollDown: (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = scrollRef.current?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      setFollowPlayhead(false);
      const x = event.clientX - rect.left;
      const thumbWidth = (viewSpan / timelineDuration) * rect.width;
      const thumbX = (viewStart / timelineDuration) * rect.width;
      dragOffsetRef.current = x >= thumbX && x <= thumbX + thumbWidth ? x - thumbX : thumbWidth / 2;
      if (x < thumbX || x > thumbX + thumbWidth) {
        const nextThumbStart = clamp(x - thumbWidth / 2, 0, Math.max(0, rect.width - thumbWidth));
        const nextStart = clamp((nextThumbStart / rect.width) * timelineDuration, 0, Math.max(0, timelineDuration - viewSpan));
        setView({ s: nextStart, e: nextStart + viewSpan });
      }
      setDragKind('scroll');
    },
    onTrackDown: (event: React.PointerEvent<HTMLDivElement>) => {
      onSelectGap?.(null);
      onSelectMusicClip?.(null);
      onPlayheadChange(timeAtClientX(event.clientX));
      startDrag('play')(event);
    },
    onPlayheadHandleDown: (event: React.PointerEvent<HTMLDivElement>) => {
      onSelectGap?.(null);
      onSelectMusicClip?.(null);
      onPlayheadChange(timeAtClientX(event.clientX));
      startDrag('play')(event);
    },
    pendingClipStart: clipEditingEnabled ? pendingClipStart : null,
    effectiveMusicPlayhead,
  };
}
