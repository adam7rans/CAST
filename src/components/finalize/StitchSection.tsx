import React from 'react';
import { Section } from '../Controls';
import type { FinalizeStatus } from '../../lib/projectApi.finalize';
import { button, formatSize, formatTime, muted } from './finalizeUi';

interface Props { status: FinalizeStatus | null; busy: boolean; onStitch: () => void; onReveal: () => void }
export function StitchSection({ status, busy, onStitch, onReveal }: Props) {
  const stitched = status?.stitched;
  return <Section title="2 · Stitch">
    <div style={muted}>{stitched?.exists
      ? `Saved ${stitched.path} (${formatSize(stitched.size)}, ${formatTime(stitched.duration)})${stitched.stale ? ' · stale' : ''}`
      : 'Stitch completed chunks into one YouTube video.'}</div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button style={button} disabled={!status?.coverage.complete || busy} onClick={onStitch}>
        {busy ? 'Stitching…' : 'Stitch full video'}
      </button>
      {stitched?.exists && <button style={button} onClick={onReveal}>Reveal in Finder</button>}
    </div>
  </Section>;
}
