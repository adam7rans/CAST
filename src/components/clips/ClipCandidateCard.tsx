import React from 'react';
import { candidateError, type ClipDraft } from '../../lib/clipCandidates';
import { MICRO_TIMELINE_COLORS } from '../../lib/types';
import { clipButtonStyle, clipFieldStyle, formatClipTime } from './styles';

interface Props {
  candidate: ClipDraft;
  index: number;
  duration: number;
  canSeek: boolean;
  disabled: boolean;
  onUpdate: (id: string, patch: Partial<ClipDraft>) => void;
  onSeek: (second: number) => void;
}

export const ClipCandidateCard: React.FC<Props> = ({ candidate, index, duration, canSeek, disabled, onUpdate, onSeek }) => {
  const error = candidateError(candidate, duration);
  const locked = candidate.added || disabled;
  const durationSecond = candidate.endSecond - candidate.startSecond;
  return (
    <article aria-label={`Candidate ${index + 1}`} style={{
      border: `1px solid ${error ? '#ff453a' : candidate.selected ? '#1f6feb' : '#333'}`,
      borderLeft: `3px solid ${MICRO_TIMELINE_COLORS[index % MICRO_TIMELINE_COLORS.length]}`,
      borderRadius: 6, padding: 10, display: 'grid', gap: 9, background: '#121212',
    }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={candidate.selected} disabled={locked}
          onChange={(event) => onUpdate(candidate.id, { selected: event.target.checked })} />
        {candidate.added ? 'Added to timeline' : `Select candidate ${index + 1}`}
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        Title
        <input value={candidate.title} maxLength={120} disabled={locked} style={clipFieldStyle}
          onChange={(event) => onUpdate(candidate.id, { title: event.target.value })} />
      </label>
      <div style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
        {formatClipTime(candidate.startSecond)} → {formatClipTime(candidate.endSecond)}
        {' · '}{Number.isFinite(durationSecond) && durationSecond > 0 ? `${durationSecond.toFixed(2)}s` : 'Invalid duration'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['startSecond', 'endSecond'] as const).map((boundary) => (
          <label key={boundary} style={{ display: 'grid', gap: 4 }}>
            {boundary === 'startSecond' ? 'Start seconds' : 'End seconds'}
            <input type="number" step="0.001" min={0} max={duration} disabled={locked}
              value={Number.isFinite(candidate[boundary]) ? candidate[boundary] : ''} style={clipFieldStyle}
              aria-invalid={!!error}
              onChange={(event) => onUpdate(candidate.id, { [boundary]: event.target.valueAsNumber })} />
          </label>
        ))}
      </div>
      <p style={{ margin: 0, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{candidate.reason}</p>
      {error && <div role="alert" style={{ color: '#ff8b84' }}>{error}</div>}
      <button style={clipButtonStyle} disabled={!canSeek || !!error || disabled}
        onClick={() => onSeek(candidate.startSecond)}>Seek to start</button>
    </article>
  );
};
