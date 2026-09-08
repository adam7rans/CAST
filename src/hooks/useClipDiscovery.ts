import { useEffect, useRef, useState } from 'react';
import type { ClipDraft } from '../lib/clipCandidates';
import type { TranscriptData } from '../lib/transcript';
import { ClipClientError } from '../lib/clipCandidates';
import { discoverProjectClips, fetchClipFinderConfig } from '../lib/projectApi.clips';

export function useClipDiscovery(projectId: string | null, transcript: TranscriptData | null) {
  const [candidates, setCandidates] = useState<ClipDraft[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [missingKey, setMissingKey] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClipFinderConfig()
      .then((config) => { if (!cancelled) setMissingKey(!config.hasKey); })
      .catch(() => {});
    requestRef.current?.abort();
    requestRef.current = null;
    setCandidates([]);
    setStatus('idle');
    setMessage('');
    setProgress({ completed: 0, total: 0 });
    return () => { cancelled = true; requestRef.current?.abort(); };
  }, [projectId, transcript]);

  const discover = async () => {
    if (!projectId || !transcript || requestRef.current) return;
    const request = new AbortController();
    requestRef.current = request;
    setStatus('loading');
    setMessage('Preparing the complete transcript…');
    setProgress({ completed: 0, total: 0 });
    try {
      await discoverProjectClips(projectId, transcript, request.signal, (event) => {
        if (request.signal.aborted || requestRef.current !== request) return;
        if (event.type === 'progress') {
          setProgress({ completed: event.completed, total: event.total });
          setMessage(`Analyzing all transcript sections: ${event.completed} of ${event.total} complete…`);
        } else if (event.type === 'complete') {
          setCandidates(event.candidates.map((candidate) => ({ ...candidate, selected: false, added: false })));
          setStatus('success');
          setMessage(event.candidates.length
            ? `${event.candidates.length} candidates from all ${event.total} sections. Review before adding.`
            : 'The complete transcript was analyzed, but no strong standalone clips were found. Try again or create clips manually.');
        }
      });
    } catch (error) {
      if (request.signal.aborted || requestRef.current !== request) return;
      setStatus('error');
      const text = error instanceof Error ? error.message : 'Clip discovery failed. Please retry.';
      setMissingKey(error instanceof ClipClientError && error.code === 'missing_key');
      setMessage(text);
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  };

  const cancel = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setStatus('idle');
    setMessage('Discovery cancelled. Saved clips and previous candidates are unchanged.');
  };

  const update = (id: string, patch: Partial<ClipDraft>) => {
    setCandidates((previous) => previous.map((candidate) => candidate.id === id && !candidate.added
      ? { ...candidate, ...patch } : candidate));
  };
  const markAdded = (ids: string[]) => {
    setCandidates((previous) => previous.map((candidate) => ids.includes(candidate.id)
      ? { ...candidate, added: true, selected: false } : candidate));
    setMessage(`Added ${ids.length} ${ids.length === 1 ? 'clip' : 'clips'}. Existing clips are preserved; changes autosave with the project.`);
  };
  const selectAll = (selected: boolean) => {
    setCandidates((previous) => previous.map((candidate) => candidate.added ? candidate : { ...candidate, selected }));
  };
  return { candidates, status, message, progress, missingKey, discover, cancel, update, markAdded, selectAll };
}

export type ClipDiscovery = ReturnType<typeof useClipDiscovery>;
