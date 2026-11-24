import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { splitSentences, type CaptionSentence, type TranscriptData } from '../lib/transcript';
import type { CaptionStyle } from '../lib/types';
import { fmt } from './timeline/timelineUtils';

interface Props {
  transcript: TranscriptData;
  captionStyle: CaptionStyle;
  playheadSecond: number;
  /** Effective cut ranges; words inside an applied cut are struck through. */
  cuts: Array<{ startMs: number; endMs: number; key: string }>;
  cutDisabled: Record<string, true>;
  cutsEnabled: boolean;
  onSeekMs: (ms: number) => void;
}

type Range = { startMs: number; endMs: number };
const inCut = (startMs: number, endMs: number, cuts: Range[]) => {
  const mid = (startMs + endMs) / 2;
  return cuts.some((c) => mid >= c.startMs && mid < c.endMs);
};

/**
 * The captions as lines: one line per on-screen caption, built with the same
 * chunking rules as the video (Caption › Type settings). Click a line to jump
 * there; the line on screen now is highlighted and kept in view.
 */
export const CaptionLinesView: React.FC<Props> = (p) => {
  const lines = useMemo<CaptionSentence[]>(() => splitSentences(p.transcript, {
    mode: p.captionStyle.lineSplitMode ?? 'sentence',
    maxWords: p.captionStyle.lineMaxWords,
    maxChars: p.captionStyle.lineMaxChars,
    maxSeconds: p.captionStyle.lineMaxSeconds,
    targetWords: p.captionStyle.lineTargetWords,
  }), [p.transcript, p.captionStyle.lineSplitMode, p.captionStyle.lineMaxWords, p.captionStyle.lineMaxChars, p.captionStyle.lineMaxSeconds, p.captionStyle.lineTargetWords]);

  const activeCuts = useMemo(
    () => (p.cutsEnabled ? p.cuts.filter((c) => !p.cutDisabled[c.key]) : []),
    [p.cuts, p.cutDisabled, p.cutsEnabled],
  );

  // Last line that has started by the playhead.
  const nowMs = p.playheadSecond * 1000;
  let lo = 0;
  let hi = lines.length - 1;
  let active = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= nowMs) { active = mid; lo = mid + 1; } else hi = mid - 1;
  }

  // Only the lines near the visible part of the list are in the page (each line
  // has a fixed height), so a long transcript stays cheap while video plays.
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Keep the current line in the vertical center: padding above and below lets
  // even the first and last lines reach the middle. Moving on to the next line
  // scrolls smoothly; a big jump (e.g. clicking far away) moves instantly.
  const pad = Math.max(0, viewportH / 2 - ROW_H / 2);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const target = Math.max(0, active) * ROW_H; // row i sits at pad + i*ROW_H, so this centers it
    const far = Math.abs(target - el.scrollTop) > ROW_H * 12;
    el.scrollTo({ top: target, behavior: far ? 'auto' : 'smooth' });
  }, [active, pad]);

  const seekRef = useRef(p.onSeekMs);
  seekRef.current = p.onSeekMs;
  const seek = useCallback((ms: number) => seekRef.current(ms), []);
  const first = Math.max(0, Math.floor((scrollTop - pad) / ROW_H) - OVERSCAN);
  const last = Math.min(lines.length, Math.ceil((scrollTop - pad + viewportH) / ROW_H) + OVERSCAN);
  // Same elements between playhead ticks unless the window, current line or cuts change.
  const rows = useMemo(() => lines.slice(first, last).map((line, k) => {
    const i = first + k;
    return <LineRow key={`${line.start}-${i}`} line={line} top={pad + i * ROW_H} active={i === active} cuts={activeCuts} onSeekMs={seek} />;
  }), [lines, first, last, active, activeCuts, seek, pad]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, color: '#777' }}>{lines.length.toLocaleString()} caption lines · click a line to jump to it</div>
      <div
        ref={listRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ height: 'calc(100vh - 300px)', minHeight: 200, overflowY: 'auto', border: '1px solid #222', borderRadius: 6, position: 'relative' }}
      >
        <div style={{ height: lines.length * ROW_H + pad * 2, position: 'relative' }}>{rows}</div>
      </div>
    </div>
  );
};

/** Fixed line height (two text rows): an 8–9 word caption fits in the sidebar. */
const ROW_H = 46;
const OVERSCAN = 8;

const LineRow = memo(function LineRow({ line, top, active, cuts, onSeekMs }: {
  line: CaptionSentence; top: number; active: boolean; cuts: Range[]; onSeekMs: (ms: number) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSeekMs(line.start)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeekMs(line.start); } }}
      style={{
        position: 'absolute', top, left: 0, right: 0, height: ROW_H, boxSizing: 'border-box', overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '58px 1fr', gap: 8, padding: '5px 8px', cursor: 'pointer',
        borderBottom: '1px solid #1c1c1c', background: active ? '#1b2a44' : 'transparent', fontSize: 12, lineHeight: 1.5,
      }}
    >
      <span style={{ color: active ? '#9bc1ff' : '#666', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{fmt(line.start / 1000)}</span>
      <span style={{ color: active ? '#fff' : '#cfcfcf', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {line.words.length === 0 ? line.text : line.words.map((w, j) => {
          const cut = inCut(w.start, w.end, cuts);
          return (
            <span key={j} style={cut ? { color: '#ff6b61', textDecoration: 'line-through', textDecorationColor: '#ff453a', textDecorationThickness: 2 } : undefined}>
              {j > 0 ? ' ' : ''}{w.text}
            </span>
          );
        })}
      </span>
    </div>
  );
});
