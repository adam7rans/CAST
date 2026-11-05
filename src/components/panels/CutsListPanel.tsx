import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../../lib/designTokens';
import { buildCutRows, removedSeconds, type CutGap, type CutRow } from '../../lib/cutRows';
import { SKIP_TYPE_META, type SkipType } from '../../lib/skipTypes';
import { fmt } from '../timeline/timelineUtils';
import { Icon } from '../ui/Icon';

interface Props {
  gaps: CutGap[];
  disabled: Record<string, true>;
  mediaDuration: number;
  cutsEnabled: boolean;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onSeekMs: (ms: number) => void;
  onRemove: (key: string) => void;
  onToggleDisabled: (key: string) => void;
}

const TYPE_ORDER: SkipType[] = ['manual', 'filler', 'mouth', 'silence'];
const TYPE_NAME: Record<SkipType, string> = { manual: 'Manual', filler: 'Filler', mouth: 'Mouth', silence: 'Silence' };

/** Every cut in the project, filterable by type: jump to, turn off, or delete each one. */
export const CutsListPanel: React.FC<Props> = (p) => {
  const rows = useMemo(
    () => buildCutRows(p.gaps, p.disabled, { start: 0, end: Math.max(p.mediaDuration, 0) || Infinity }, true),
    [p.gaps, p.disabled, p.mediaDuration],
  );
  const counts = useMemo(() => {
    const c: Partial<Record<SkipType, number>> = {};
    for (const row of rows) c[row.type] = (c[row.type] ?? 0) + 1;
    return c;
  }, [rows]);
  const [filter, setFilter] = useState<SkipType | 'all'>('all');
  const shown = filter === 'all' ? rows : rows.filter((r) => r.type === filter);
  const removed = removedSeconds(shown);

  const selectedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { selectedRef.current?.scrollIntoView({ block: 'nearest' }); }, [p.selectedKey]);

  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: C.faint, padding: '16px 4px' }}>No cuts yet. Cuts you add on the timeline or with the Edits tools show up here.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: C.dim }}>
        {shown.length} cut{shown.length === 1 ? '' : 's'} · <span style={{ color: C.orange }}>−{fmt(removed)}</span> removed
        {!p.cutsEnabled && <div style={{ color: C.orange, fontSize: 11, marginTop: 4 }}>Cuts are switched off, so none are applied right now.</div>}
      </div>

      <div role="group" aria-label="Filter cuts" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All ${rows.length}`} />
        {TYPE_ORDER.filter((t) => counts[t]).map((t) => (
          <FilterChip key={t} active={filter === t} color={SKIP_TYPE_META[t].hex} onClick={() => setFilter(t)} label={`${TYPE_NAME[t]} ${counts[t]}`} />
        ))}
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden' }}>
        {shown.map((row) => (
          <CutListRow
            key={row.key}
            row={row}
            selected={row.key === p.selectedKey}
            rowRef={row.key === p.selectedKey ? selectedRef : undefined}
            onOpen={() => { p.onSeekMs(row.startSec * 1000); p.onSelect(row.key); }}
            onRemove={() => p.onRemove(row.key)}
            onToggle={() => p.onToggleDisabled(row.key)}
          />
        ))}
      </div>
    </div>
  );
};

const FilterChip: React.FC<{ active: boolean; label: string; color?: string; onClick: () => void }> = ({ active, label, color, onClick }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 8px', borderRadius: 4,
      border: `1px solid ${active ? C.line3 : C.line2}`, background: active ? '#262626' : C.chip,
      color: active ? C.text : C.faint, cursor: 'pointer', fontFamily: 'inherit',
    }}
  >
    {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />}
    {label}
  </button>
);

const CutListRow: React.FC<{
  row: CutRow; selected: boolean; rowRef?: React.Ref<HTMLDivElement>;
  onOpen: () => void; onRemove: () => void; onToggle: () => void;
}> = ({ row, selected, rowRef, onOpen, onRemove, onToggle }) => (
  <div
    ref={rowRef}
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
    title={`Jump to ${fmt(row.startSec)}`}
    style={{
      display: 'grid', gridTemplateColumns: '10px 64px 58px 1fr auto', alignItems: 'center', gap: 8,
      padding: '6px 8px', borderBottom: `1px solid ${C.line}`, cursor: 'pointer', fontSize: 11,
      background: selected ? '#1b2a44' : 'transparent', opacity: row.disabled ? 0.45 : 1,
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: SKIP_TYPE_META[row.type].hex }} />
    <span style={{ color: C.text }}>{fmt(row.startSec)}</span>
    <span style={{ color: C.orange, textDecoration: row.disabled ? 'line-through' : 'none' }}>−{fmt(row.durSec)}</span>
    <span style={{ color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {row.label}{row.disabled ? ' (off)' : ''}
    </span>
    <span style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
      {(row.disabled || !row.removable) && (
        <RowAction label={row.disabled ? 'Turn this cut back on' : 'Turn this cut off'} onClick={onToggle}>
          <Icon name={row.disabled ? 'eye' : 'eyeOff'} size={13} />
        </RowAction>
      )}
      {row.removable && (
        <RowAction label="Delete this cut" onClick={onRemove}><Icon name="trash" size={13} /></RowAction>
      )}
    </span>
  </div>
);

const RowAction: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    style={{ width: 24, height: 22, display: 'grid', placeItems: 'center', border: 0, borderRadius: 4, background: 'transparent', color: C.faint, cursor: 'pointer' }}
  >
    {children}
  </button>
);
