import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptWord } from '../../lib/transcript';

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Word selection for the words track: press on a word to select it, drag or
 * shift-click to extend, S skips the selection, Esc clears it.
 */
export function useWordSelection(
  words: TranscriptWord[],
  onSkip: (startMs: number, endMs: number, label: string) => void,
) {
  const [range, setRange] = useState<{ anchor: number; focus: number } | null>(null);
  const dragging = useRef(false);
  const lo = range ? Math.min(range.anchor, range.focus) : -1;
  const hi = range ? Math.max(range.anchor, range.focus) : -1;

  // A new transcript invalidates indexes.
  useEffect(() => { setRange(null); }, [words]);

  useEffect(() => {
    const stop = () => { dragging.current = false; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const press = useCallback((index: number, extend: boolean) => {
    dragging.current = true;
    setRange((prev) => (extend && prev ? { anchor: prev.anchor, focus: index } : { anchor: index, focus: index }));
  }, []);

  const enter = useCallback((index: number) => {
    if (dragging.current) setRange((prev) => (prev ? { anchor: prev.anchor, focus: index } : prev));
  }, []);

  const clear = useCallback(() => setRange(null), []);

  const skip = useCallback(() => {
    if (lo < 0 || !words[lo] || !words[hi]) return;
    const text = words.slice(lo, hi + 1).map((w) => w.text).join(' ');
    const label = text.length > 40 ? `“${text.slice(0, 38)}…”` : `“${text}”`;
    onSkip(words[lo].start, words[hi].end, label);
    setRange(null);
  }, [lo, hi, words, onSkip]);

  useEffect(() => {
    if (lo < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); skip(); }
      else if (e.key === 'Escape') clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lo, skip, clear]);

  const isSelected = useCallback((index: number) => index >= lo && index <= hi, [lo, hi]);
  return { count: lo < 0 ? 0 : hi - lo + 1, isSelected, press, enter, clear, skip };
}
