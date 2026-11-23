import React, { useState } from 'react';
import { C } from '../../lib/designTokens';
import { projectThumbnailUrl, type ProjectSummary } from '../../lib/projectApi.dashboard';
import { Icon } from '../ui/Icon';
import { formatBytes, formatDuration, formatRelative, projectFacts, type Fact } from './dashboardFormat';

interface TileProps {
  project: ProjectSummary;
  active: boolean;
  onOpen: (id: string) => void;
  onDelete: (project: ProjectSummary) => void;
}

const FACT_COLORS: Record<NonNullable<Fact['tone']> | 'default', string> = {
  default: C.dim, muted: C.fainter, good: C.green, warn: C.orange,
};

/** Card and row are divs with role=button so the delete button isn't nested in another button. */
function activate(e: React.KeyboardEvent, run: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); }
}

export const FactChips: React.FC<{ project: ProjectSummary }> = ({ project }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
    {projectFacts(project).map((fact) => {
      const color = FACT_COLORS[fact.tone ?? 'default'];
      return (
        <span key={fact.label} style={{
          fontSize: 10, lineHeight: '16px', padding: '0 6px', borderRadius: 4, whiteSpace: 'nowrap',
          color, background: `${color}14`, border: `1px solid ${color}33`,
        }}>{fact.label}</span>
      );
    })}
  </div>
);

const Thumb: React.FC<{ project: ProjectSummary; height?: number; showDuration?: boolean }> = ({ project, height, showDuration }) => {
  const [failed, setFailed] = useState(false);
  const url = projectThumbnailUrl(project);
  const duration = formatDuration(project.durationSec);
  const placeholder: 'wave' | 'film' | 'plus' = project.mediaType === 'audio' ? 'wave' : project.mediaType ? 'film' : 'plus';
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: height ? undefined : '16 / 9', height,
      background: 'linear-gradient(135deg, #151515, #0d0d0d)', overflow: 'hidden', borderRadius: height ? 6 : 0,
      display: 'grid', placeItems: 'center', flexShrink: 0,
    }}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Icon name={placeholder} size={height ? 18 : 30} color={C.fainter} />
      )}
      {showDuration && duration && (
        <span style={{
          position: 'absolute', right: 8, bottom: 8, fontSize: 11, padding: '1px 6px', borderRadius: 4,
          background: '#000000c0', color: '#eee', fontVariantNumeric: 'tabular-nums',
        }}>{duration}</span>
      )}
    </div>
  );
};

const DeleteButton: React.FC<{ project: ProjectSummary; onDelete: TileProps['onDelete'] }> = ({ project, onDelete }) => (
  <button
    type="button"
    className="cdash-del"
    title={`Delete ${project.name}`}
    aria-label={`Delete ${project.name}`}
    onClick={(e) => { e.stopPropagation(); onDelete(project); }}
  >
    <Icon name="trash" size={15} />
  </button>
);

export const ProjectCard: React.FC<TileProps> = ({ project, active, onOpen, onDelete }) => (
  <div
    role="button"
    tabIndex={0}
    className={`cdash-card${active ? ' active' : ''}`}
    onClick={() => onOpen(project.id)}
    onKeyDown={(e) => activate(e, () => onOpen(project.id))}
    aria-label={`Open ${project.name}`}
  >
    <Thumb project={project} showDuration />
    <DeleteButton project={project} onDelete={onDelete} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 13px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.name}
        </span>
        {active && <span style={{ fontSize: 10, color: C.blueDim, flexShrink: 0 }}>OPEN</span>}
      </div>
      <div style={{ fontSize: 11, color: C.faint, display: 'flex', gap: 6, minWidth: 0 }}>
        <span style={{ flexShrink: 0 }}>Edited {formatRelative(project.updatedAt || project.createdAt)}</span>
        <span>·</span>
        <span style={{ flexShrink: 0 }}>{formatBytes(project.sizeBytes)}</span>
      </div>
      <FactChips project={project} />
    </div>
  </div>
);

export const ProjectRowHeader: React.FC = () => (
  <div className="cdash-row head" role="presentation">
    <span />
    <span>Name</span>
    <span className="cdash-wide">Length</span>
    <span className="cdash-wide">Contents</span>
    <span className="cdash-wide">Size</span>
    <span className="cdash-wide">Edited</span>
    <span />
  </div>
);

export const ProjectRow: React.FC<TileProps> = ({ project, active, onOpen, onDelete }) => (
  <div
    role="button"
    tabIndex={0}
    className={`cdash-row${active ? ' active' : ''}`}
    onClick={() => onOpen(project.id)}
    onKeyDown={(e) => activate(e, () => onOpen(project.id))}
    aria-label={`Open ${project.name}`}
  >
    <Thumb project={project} height={63} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {project.name}{active && <span style={{ fontSize: 10, color: C.blueDim, marginLeft: 8 }}>OPEN</span>}
      </span>
      <span style={{ fontSize: 11, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {project.mediaName ?? 'No media yet'}
      </span>
    </div>
    <span className="cdash-wide" style={{ fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
      {formatDuration(project.durationSec) ?? '—'}
    </span>
    <div className="cdash-wide"><FactChips project={project} /></div>
    <span className="cdash-wide" style={{ fontSize: 12, color: C.dim }}>{formatBytes(project.sizeBytes)}</span>
    <span className="cdash-wide" style={{ fontSize: 12, color: C.faint }}>{formatRelative(project.updatedAt || project.createdAt)}</span>
    <DeleteButton project={project} onDelete={onDelete} />
  </div>
);
