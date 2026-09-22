import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import type { TranscriptData } from '../lib/transcript';
import type { CustomCut } from '../lib/fillerDetector';
import {
  MOUTH_SOUND_CLASSES, isCustomKey, isFillerCutKey, isManualCutKey, isMouthCutKey, mergeCutsByKey,
} from '../lib/skipTypes';

export type JumpCutGap = { startMs: number; endMs: number; key: string; kind?: 'silence' | 'custom'; label?: string };

export { isCustomKey, isFillerCutKey, isManualCutKey, isMouthCutKey };

export function useJumpCuts(transcript: TranscriptData | null) {
  const [jumpCutGapMs, setJumpCutGapMs] = useState(300);
  const [jumpCutPaddingMs, setJumpCutPaddingMs] = useState(0);
  // Tighten knob for custom/filler cuts — EXPANDS each cut by N ms per side
  // (inverse of jumpCutPaddingMs, which shrinks silence gaps).
  const [customCutPaddingMs, setCustomCutPaddingMs] = useState(0);
  // user-edited overrides for individual gaps, keyed by gap key
  const [jumpCutGapOverrides, setJumpCutGapOverrides] = useState<Record<string, { startMs: number; endMs: number }>>({});
  // disabled gaps — kept visible but not skipped during playback
  const [jumpCutGapDisabled, setJumpCutGapDisabled] = useState<Record<string, true>>({});
  const [selectedGapKey, setSelectedGapKey] = useState<string | null>(null);
  // manually added cuts — filler words, weak sentences, editorial trims
  const [customCuts, setCustomCuts] = useState<CustomCut[]>([]);
  // Timestamp of the last explicit clear-all, persisted so the server can
  // tell a deliberate clear apart from a stale/empty autosave.
  const [customCutsClearedAt, setCustomCutsClearedAt] = useState<number | null>(null);
  const [pendingCustomCutStartMs, setPendingCustomCutStartMs] = useState<number | null>(null);
  // category toggles (affect both timeline rendering and playback/export)
  const [showSilenceGaps, setShowSilenceGaps] = useState(false);
  const [showFillerCuts, setShowFillerCuts] = useState(false);
  const [showManualCuts, setShowManualCuts] = useState(false);
  const [showMouthCuts, setShowMouthCuts] = useState(false);
  // Which YAMNet types the Detect button looks for (persisted per project).
  const [mouthDetectClasses, setMouthDetectClasses] = useState<string[]>([...MOUTH_SOUND_CLASSES]);

  const jumpCutsEnabledRef = useRef(false);
  const jumpCutGapListRef = useRef<JumpCutGap[]>([]);
  const jumpCutsEnabled = showSilenceGaps || showFillerCuts || showManualCuts || showMouthCuts;
  const setJumpCutsEnabled = useCallback((value: SetStateAction<boolean>) => {
    const nextValue = typeof value === 'function'
      ? (value as (prevState: boolean) => boolean)(showSilenceGaps || showFillerCuts || showManualCuts || showMouthCuts)
      : value;
    if (!nextValue) {
      setShowSilenceGaps(false);
      setShowFillerCuts(false);
      setShowManualCuts(false);
      setShowMouthCuts(false);
      return;
    }
    if (transcript) setShowSilenceGaps(true);
    if (customCuts.some((cut) => isFillerCutKey(cut.key))) setShowFillerCuts(true);
    if (customCuts.some((cut) => isManualCutKey(cut.key))) setShowManualCuts(true);
    if (customCuts.some((cut) => isMouthCutKey(cut.key))) setShowMouthCuts(true);
  }, [customCuts, showFillerCuts, showManualCuts, showMouthCuts, showSilenceGaps, transcript]);

  useEffect(() => { jumpCutsEnabledRef.current = jumpCutsEnabled; }, [jumpCutsEnabled]);
  useEffect(() => { setPendingCustomCutStartMs(null); }, [transcript]);

  const jumpCutGapsBase = useMemo(() => {
    if (!transcript) return [] as JumpCutGap[];
    const words: Array<{ start: number; end: number }> = [];
    for (const u of transcript.utterances) {
      if (u.words) for (const w of u.words) words.push(w);
    }
    words.sort((a, b) => a.start - b.start);
    const gaps: JumpCutGap[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      const gapStart = words[i].end;
      const gapEnd = words[i + 1].start;
      if (gapEnd - gapStart >= jumpCutGapMs) {
        gaps.push({ startMs: gapStart, endMs: gapEnd, key: `${gapStart}|${gapEnd}`, kind: 'silence' });
      }
    }
    return gaps;
  }, [transcript, jumpCutGapMs]);

  // User-added custom cuts flow through the same
  // overrides/disabled/timeline pipeline as auto-detected gaps.
  const customCutGaps = useMemo<JumpCutGap[]>(() => {
    return customCuts.map(c => ({
      startMs: c.startMs,
      endMs: c.endMs,
      key: isCustomKey(c.key) ? c.key : `custom:${c.key}`,
      kind: 'custom',
      label: c.label,
    }));
  }, [customCuts]);

  const jumpCutGapsAll = useMemo(() => {
    const all = [...jumpCutGapsBase, ...customCutGaps];
    all.sort((a, b) => a.startMs - b.startMs);
    return all.map(g => {
      const o = jumpCutGapOverrides[g.key];
      return o ? { ...g, startMs: o.startMs, endMs: o.endMs } : g;
    });
  }, [jumpCutGapsBase, customCutGaps, jumpCutGapOverrides]);

  // Filtered view respecting visibility toggles — drives timeline + effective gaps
  const jumpCutGaps = useMemo(() => {
    return jumpCutGapsAll.filter(g => {
      if (g.kind === 'custom') {
        if (isMouthCutKey(g.key)) return showMouthCuts;
        return isFillerCutKey(g.key) ? showFillerCuts : showManualCuts;
      }
      return showSilenceGaps;
    });
  }, [jumpCutGapsAll, showSilenceGaps, showFillerCuts, showManualCuts, showMouthCuts]);

  // Effective gaps = silence gaps get symmetrical padding; custom cuts pass
  // through as-is (they're already word-precise). These are the actual skip
  // zones used for playback and export.
  const jumpCutGapsEffective = useMemo(() => {
    return jumpCutGaps
      .map(g => g.kind === 'custom'
        // Custom/filler cuts: SHRINK by customCutPaddingMs on each side
        // (loosens the cut so more surrounding context survives)
        ? { ...g, startMs: g.startMs + customCutPaddingMs, endMs: g.endMs - customCutPaddingMs }
        // Silence gaps: SHRINK by jumpCutPaddingMs on each side
        : { ...g, startMs: g.startMs + jumpCutPaddingMs, endMs: g.endMs - jumpCutPaddingMs })
      .filter(g => g.endMs - g.startMs > 20); // drop gaps that padding has consumed entirely
  }, [jumpCutGaps, jumpCutPaddingMs, customCutPaddingMs]);

  // RAF loop should never see disabled gaps
  useEffect(() => {
    jumpCutGapListRef.current = jumpCutGapsEffective.filter(g => !jumpCutGapDisabled[g.key]);
  }, [jumpCutGapsEffective, jumpCutGapDisabled]);

  const handleAdjustGap = useCallback((key: string, startMs: number, endMs: number) => {
    setJumpCutGapOverrides(prev => ({
      ...prev,
      [key]: { startMs: Math.round(startMs), endMs: Math.round(endMs) },
    }));
  }, []);

  const handleResetGap = useCallback((key: string) => {
    setJumpCutGapOverrides(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleResetAllGaps = useCallback(() => {
    setJumpCutGapOverrides({});
    setJumpCutGapDisabled({});
  }, []);

  const handleAddCustomCuts = useCallback((cuts: CustomCut[]) => {
    if (!cuts.length) return;
    setCustomCuts(prev => mergeCutsByKey(prev, cuts));
    // Auto-enable skip so the user immediately hears the result.
    setShowFillerCuts(true);
  }, []);

  const handleAddMouthCuts = useCallback((cuts: CustomCut[]) => {
    if (!cuts.length) return;
    setCustomCuts(prev => mergeCutsByKey(prev, cuts));
    // Auto-enable skip so the user immediately hears the result.
    setShowMouthCuts(true);
  }, []);

  const handleClearCustomCuts = useCallback(() => {
    // Clears filler + manual skips but spares YAMNet mouth sounds, which have
    // their own section and clear button.
    setCustomCuts(prev => prev.filter(c => isMouthCutKey(c.key)));
    setCustomCutsClearedAt(Date.now());
    setPendingCustomCutStartMs(null);
    // Drop disabled/override state that was anchored to cleared custom-cut keys.
    setJumpCutGapDisabled(prev => {
      const next: Record<string, true> = {};
      for (const k of Object.keys(prev)) if (!isCustomKey(k) || isMouthCutKey(k)) next[k] = true;
      return next;
    });
    setJumpCutGapOverrides(prev => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) if (!isCustomKey(k) || isMouthCutKey(k)) next[k] = prev[k];
      return next;
    });
  }, []);

  const handleClearMouthCuts = useCallback(() => {
    setCustomCuts(prev => prev.filter(c => !isMouthCutKey(c.key)));
    setCustomCutsClearedAt(Date.now());
    setJumpCutGapDisabled(prev => {
      const next: Record<string, true> = {};
      for (const k of Object.keys(prev)) if (!isMouthCutKey(k)) next[k] = true;
      return next;
    });
    setJumpCutGapOverrides(prev => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) if (!isMouthCutKey(k)) next[k] = prev[k];
      return next;
    });
  }, []);

  const handleToggleGapDisabled = useCallback((key: string) => {
    setJumpCutGapDisabled(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, []);

  const handleSelectGap = useCallback((key: string | null) => {
    setSelectedGapKey(key);
  }, []);

  const handleStartCustomCut = useCallback((playheadMs: number) => {
    setPendingCustomCutStartMs(Math.max(0, Math.round(playheadMs)));
  }, []);

  const handleCancelPendingCustomCut = useCallback(() => {
    setPendingCustomCutStartMs(null);
  }, []);

  const handleFinishCustomCut = useCallback((playheadMs: number) => {
    setPendingCustomCutStartMs((startMs) => {
      if (startMs === null) return null;
      const rawEndMs = Math.max(0, Math.round(playheadMs));
      const cutStartMs = Math.min(startMs, rawEndMs);
      const cutEndMs = Math.max(startMs, rawEndMs);
      if (cutEndMs - cutStartMs < 20) return null;
      const key = `editorial:${cutStartMs}-${cutEndMs}-${Date.now().toString(36)}`;
      setCustomCuts(prev => [...prev, { key, startMs: cutStartMs, endMs: cutEndMs, label: 'manual skip' }]
        .sort((a, b) => a.startMs - b.startMs));
      setSelectedGapKey(key);
      setShowManualCuts(true);
      return null;
    });
  }, []);

  const handleRemoveCustomCut = useCallback((key: string) => {
    setCustomCuts(prev => prev.filter(c => (isCustomKey(c.key) ? c.key : `custom:${c.key}`) !== key));
    setJumpCutGapDisabled(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setJumpCutGapOverrides(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSelectedGapKey(prev => prev === key ? null : prev);
  }, []);

  // Delete/Backspace to disable (or re-enable) the selected silence block
  useEffect(() => {
    if (!jumpCutsEnabled || !selectedGapKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      handleToggleGapDisabled(selectedGapKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jumpCutsEnabled, selectedGapKey, handleToggleGapDisabled]);

  return {
    jumpCutsEnabled, setJumpCutsEnabled,
    jumpCutGapMs, setJumpCutGapMs,
    jumpCutPaddingMs, setJumpCutPaddingMs,
    customCutPaddingMs, setCustomCutPaddingMs,
    showSilenceGaps, setShowSilenceGaps,
    showFillerCuts, setShowFillerCuts,
    showManualCuts, setShowManualCuts,
    showMouthCuts, setShowMouthCuts,
    mouthDetectClasses, setMouthDetectClasses,
    jumpCutGapOverrides,
    setJumpCutGapOverrides,
    jumpCutGapDisabled,
    setJumpCutGapDisabled,
    selectedGapKey,
    setSelectedGapKey,
    jumpCutGaps,
    jumpCutGapsEffective,
    jumpCutsEnabledRef,
    jumpCutGapListRef,
    customCuts, setCustomCuts,
    customCutsClearedAt, setCustomCutsClearedAt,
    pendingCustomCutStartMs,
    handleAdjustGap,
    handleResetGap,
    handleResetAllGaps,
    handleAddCustomCuts,
    handleClearCustomCuts,
    handleAddMouthCuts,
    handleClearMouthCuts,
    handleStartCustomCut,
    handleCancelPendingCustomCut,
    handleFinishCustomCut,
    handleRemoveCustomCut,
    handleToggleGapDisabled,
    handleSelectGap,
  };
}
