import React from 'react';
import { Section } from '../Controls';
import type { FinalizeStatus } from '../../lib/projectApi.finalize';
import { formatSize, formatTime, muted } from './finalizeUi';

export function ReadinessSection({ status }: { status: FinalizeStatus | null }) {
  return <Section title="1 · Chunk readiness">
    {!status ? <span style={muted}>Checking exports…</span> : <>
      <div style={{ color: status.coverage.complete ? '#85d8a0' : '#ffba7a', fontSize: 12 }}>
        {status.coverage.found}/{status.coverage.expected} chunks · {status.coverage.complete ? 'continuous coverage' : 'coverage incomplete'}{' '}
        {formatTime(status.coverage.totalSpan[0])} → {formatTime(status.coverage.totalSpan[1])}
      </div>
      {status.coverage.gaps.map((gap, index) => <div key={index} style={{ color: '#ffba7a', fontSize: 11 }}>
        Gap {gap.seconds.toFixed(1)}s between {formatTime(gap.start)} and {formatTime(gap.end)}
      </div>)}
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        {status.chunks.map((chunk, index) => <div key={chunk.exportId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8,
          borderTop: '1px solid #222', padding: '4px 0', fontSize: 11, color: '#aaa' }}>
          <span>{index + 1}. {formatTime(chunk.start)} → {formatTime(chunk.end)}</span><span>{formatSize(chunk.size)}</span>
        </div>)}
      </div>
    </>}
  </Section>;
}
