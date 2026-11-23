import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptData, TranscriptWord } from '../../lib/transcript';
import { useWaveformPeaks } from './useWaveformPeaks';
import { drawWaveform } from './waveformCanvas';
import { insideCut, layoutWords, wordAtX, WORD_FONT_PX } from './wordLayout';
import { useWordSelection } from './useWordSelection';

interface Props {
  projectId: string | null | undefined;
  /** Changes when the project's media changes, so the waveform reloads. */
  mediaKey: string;
  transcript: TranscriptData | null | undefined;
  viewStart: number;
  viewEnd: number;
  playhead: number;
  /** Effective cut ranges and which are switched off; cuts apply only when `cutsEnabled`. */
  cuts: Array<{ startMs: number; endMs: number; key: string }>;
  cutDisabled: Record<string, true>;
  cutsEnabled: boolean;
  onSeek: (sec: number) => void;
  onSkipWords?: (startMs: number, endMs: number, label: string) => void;
}

const WAVE_H = 30;
const ROW_H = 16;
/** Below this many pixels per word on average, boxes become noise: show the waveform only. */
const MIN_PX_PER_WORD = 4;

/** Timeline track: top half of the waveform, with each spoken word as a time-sized box below it. */
export const WordWaveTrack: React.FC<Props> = (p) => {
  const words = useMemo<TranscriptWord[]>(
    () => (p.transcript?.utterances ?? []).flatMap((u) => u.words ?? []).filter((w) => w.end > w.start),
    [p.transcript],
  );
  const peaks = useWaveformPeaks(p.projectId, p.mediaKey);
  const activeCuts = useMemo(
    () => (p.cutsEnabled ? p.cuts.filter((c) => !p.cutDisabled[c.key]) : []),
    [p.cuts, p.cutDisabled, p.cutsEnabled],
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // Callbacks through refs: the playhead updates ~60×/s and must not rebuild the word layer.
  const handlers = useRef({ onSeek: p.onSeek, onSkipWords: p.onSkipWords });
  handlers.current = { onSeek: p.onSeek, onSkipWords: p.onSkipWords };
  const skipWords = useCallback((s: number, e: number, label: string) => handlers.current.onSkipWords?.(s, e, label), []);
  const selection = useWordSelection(words, skipWords);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (canvasRef.current && peaks && width > 0) drawWaveform(canvasRef.current, peaks, p.viewStart, p.viewEnd, activeCuts);
  }, [peaks, width, p.viewStart, p.viewEnd, activeCuts]);

  const placed = useMemo(() => layoutWords(words, p.viewStart, p.viewEnd, width), [words, p.viewStart, p.viewEnd, width]);
  const dense = width > 0 && placed.length > width / MIN_PX_PER_WORD;
  const span = Math.max(0.001, p.viewEnd - p.viewStart);
  const playPct = ((p.playhead - p.viewStart) / span) * 100;

  const seekAt = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) p.onSeek(p.viewStart + ((clientX - rect.left) / rect.width) * span);
  };

  // Rebuilt only when the words, zoom, cuts or selection change — not on playhead ticks.
  const { isSelected, press } = selection;
  const wordLayer = useMemo(() => (dense ? (
    <div style={{ position: 'absolute', left: 8, top: WAVE_H + 6, fontSize: 10, color: '#666' }}>
      {placed.length.toLocaleString()} words in view. Zoom in to see and select words.
    </div>
  ) : placed.map(({ index, word, leftPx, widthPx, slotPx, textRow }) => {
    const cut = insideCut(word.start, word.end, activeCuts);
    const selected = isSelected(index);
    const textStyle: React.CSSProperties = {
      fontSize: WORD_FONT_PX, lineHeight: `${ROW_H}px`, whiteSpace: 'nowrap', paddingLeft: 3,
      color: cut ? '#ff6b61' : selected ? '#fff' : '#c8c8c8',
      textDecoration: cut ? 'line-through' : 'none', textDecorationColor: '#ff453a', textDecorationThickness: 2,
    };
    return (
      <div
        key={index}
        title={`${word.text} · ${(word.start / 1000).toFixed(2)}s`}
        onPointerDown={(e) => { e.preventDefault(); press(index, e.shiftKey); if (!e.shiftKey) handlers.current.onSeek(word.start / 1000); }}
        style={{ position: 'absolute', left: leftPx, top: WAVE_H + 2, width: slotPx, height: ROW_H * 2, cursor: 'text' }}
      >
        {/* the box is as long as the word is spoken; the slot behind it runs to the next word */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: widthPx, height: ROW_H, borderLeft: '1px solid #3a3a3a',
          background: selected ? 'rgba(31,111,235,0.5)' : cut ? 'rgba(255,69,58,0.14)' : 'rgba(255,255,255,0.05)',
        }} />
        {textRow === 0 && <div style={{ position: 'relative', height: ROW_H, overflow: 'hidden' }}><span style={textStyle}>{word.text}</span></div>}
        {textRow === 1 && <div style={{ ...textStyle, position: 'absolute', top: ROW_H, color: selected ? '#9bc1ff' : cut ? '#ff6b61' : '#8a8a8a' }}>{word.text}</div>}
      </div>
    );
  })), [dense, placed, activeCuts, isSelected, press]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        ref={wrapRef}
        onPointerMove={(e) => {
          const rect = wrapRef.current?.getBoundingClientRect();
          const hit = rect ? wordAtX(placed, e.clientX - rect.left) : null;
          if (hit) selection.enter(hit.index);
        }}
        style={{ position: 'relative', height: WAVE_H + ROW_H * 2 + 4, background: '#101010', border: '1px solid #222', borderRadius: 4, overflow: 'hidden', userSelect: 'none' }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => { selection.clear(); seekAt(e.clientX); }}
          style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: WAVE_H, cursor: 'pointer' }}
        />
        {wordLayer}
        {playPct >= 0 && playPct <= 100 && (
          <div style={{ position: 'absolute', left: `calc(${playPct}% - 1px)`, top: 0, bottom: 0, width: 2, background: '#fff', opacity: 0.8, pointerEvents: 'none' }} />
        )}
      </div>
      {selection.count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#aaa' }}>
          <span>{selection.count} word{selection.count === 1 ? '' : 's'} selected</span>
          <button onClick={selection.skip} title="Skip the selected words (S)" style={btn('#ff453a')}>Skip (S)</button>
          <button onClick={selection.clear} title="Clear the selection (Esc)" style={btn('#777777')}>Clear</button>
        </div>
      )}
    </div>
  );
};

const btn = (color: string): React.CSSProperties => ({
  background: `${color}22`, border: `1px solid ${color}88`, color: '#eee', borderRadius: 4,
  padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
});
