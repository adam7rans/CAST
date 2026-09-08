import React, { useMemo, useState } from 'react';
import type { ClipDiscovery } from '../../hooks/useClipDiscovery';
import { candidateError, type ClipCandidate } from '../../lib/clipCandidates';
import type { TranscriptData } from '../../lib/transcript';
import { Section } from '../Controls';
import { ApiKeyEntry } from './ApiKeyEntry';
import { ClipCandidateCard } from './ClipCandidateCard';
import { clipButtonStyle } from './styles';

export interface ClipsWorkspaceProps {
  discovery: ClipDiscovery;
  projectId: string | null;
  transcript: TranscriptData | null;
  mediaDuration: number;
  onAppend: (candidates: ClipCandidate[], duration: number) => void;
  onSeek: (second: number) => void;
}

export const ClipsWorkspace: React.FC<ClipsWorkspaceProps> = ({
  discovery, projectId, transcript, mediaDuration, onAppend, onSeek,
}) => {
  const [keySaved, setKeySaved] = useState(false);
  const loading = discovery.status === 'loading';
  const ready = !!projectId && !!transcript?.utterances.length;
  const transcriptEnd = useMemo(() => transcript?.utterances.reduce((latest, utterance) =>
    (utterance.words ?? []).reduce((wordEnd, word) => Math.max(wordEnd,
      Number.isFinite(word.end) ? word.end / 1000 : 0),
    Math.max(latest, Number.isFinite(utterance.end) ? utterance.end / 1000 : 0)), 0) ?? 0, [transcript]);
  const duration = mediaDuration > 0 ? mediaDuration : transcriptEnd;
  const selected = discovery.candidates.filter((candidate) => candidate.selected && !candidate.added);
  const invalidSelected = selected.some((candidate) => candidateError(candidate, duration));
  const addSelected = () => {
    if (!selected.length || invalidSelected || loading) return;
    onAppend(selected, duration);
    discovery.markAdded(selected.map((candidate) => candidate.id));
  };
  return (
    <div style={{ color: '#aaa', fontSize: 12 }}>
      <Section title="AI clip finder">
        <p style={{ margin: '0 0 10px', lineHeight: 1.5 }}>
          Find complete, standalone highlights across the full transcript. Review candidates before adding them to your timeline.
        </p>
        <p style={{ color: '#888', lineHeight: 1.5, margin: '0 0 10px' }}>
          Sends the timed transcript to OpenAI using your API account. Response storage is off.
        </p>
        <ApiKeyEntry onSaved={() => {
          setKeySaved(true);
          if (discovery.missingKey) void discovery.discover();
        }} />
        {keySaved && <p role="status" style={{ color: '#7ee787', margin: '10px 0 0', lineHeight: 1.5 }}>
          Key saved on this machine.{discovery.missingKey ? ' Starting discovery…' : ''}
        </p>}
        {!ready && <p role="status">{!projectId ? 'Create or select a project first.' : 'Load a timed transcript to find clips.'}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={!ready || loading} onClick={() => void discovery.discover()}
            style={{ ...clipButtonStyle, borderColor: '#1f6feb', color: '#fff' }}>
            {loading ? 'Finding clips…' : discovery.candidates.length ? 'Find new candidates' : 'Find clips'}
          </button>
          {loading && <button onClick={discovery.cancel} style={clipButtonStyle}>Cancel</button>}
        </div>
        {discovery.candidates.length > 0 && <p style={{ color: '#888', margin: '10px 0 0' }}>Candidates are temporary. A new search replaces this list, never saved clips.</p>}
        {loading && discovery.progress.total > 0 && <progress style={{ width: '100%', marginTop: 10 }}
          aria-label="Transcript sections analyzed" max={discovery.progress.total} value={discovery.progress.completed} />}
        <div role={discovery.status === 'error' ? 'alert' : 'status'} aria-live="polite"
          style={{ marginTop: 10, lineHeight: 1.5, color: discovery.status === 'error' ? '#ff8b84' : '#aaa' }}>
          {discovery.message}
        </div>
      </Section>
      {discovery.candidates.length > 0 && <Section title="Review candidates">
        <p>Source timestamps · strongest first. Seek, then use the player to review the source.</p>
        {mediaDuration <= 0 && <p>Load source media to preview. Ranges are checked against the transcript until then.</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button disabled={loading} style={clipButtonStyle} onClick={() => discovery.selectAll(true)}>Select all</button>
          <button disabled={loading} style={clipButtonStyle} onClick={() => discovery.selectAll(false)}>Clear selection</button>
          <button disabled={loading || !selected.length || invalidSelected} onClick={addSelected}
            style={{ ...clipButtonStyle, borderColor: '#1f6feb' }}>Add selected ({selected.length})</button>
        </div>
        {invalidSelected && <p role="alert" style={{ color: '#ff8b84' }}>Fix the selected invalid ranges or titles before adding.</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {discovery.candidates.map((candidate, index) => <ClipCandidateCard key={candidate.id}
            candidate={candidate} index={index} duration={duration} canSeek={mediaDuration > 0}
            disabled={loading} onUpdate={discovery.update} onSeek={onSeek} />)}
        </div>
      </Section>}
    </div>
  );
};
