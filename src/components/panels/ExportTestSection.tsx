import React, { useEffect, useState } from 'react';
import {
  listQualityTestSources, openExportFolder, runQualityTests,
  type QualityTestResult, type QualityTestSource,
} from '../../lib/projectApi';
import { Section } from '../Controls';
import type { Toast } from '../StatusToast';

interface Props {
  projectId: string | null;
  initialOffsetSec: number;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const ExportTestSection: React.FC<Props> = ({ projectId, initialOffsetSec, addToast }) => {
  const [sources, setSources] = useState<QualityTestSource[]>([]);
  const [sourceName, setSourceName] = useState<string>('');
  const [offsetSec, setOffsetSec] = useState<number>(() => Math.max(0, Math.round(initialOffsetSec)));
  const [lengthSec, setLengthSec] = useState<number>(5);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<QualityTestResult[] | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const [testedSource, setTestedSource] = useState<string>('');

  useEffect(() => {
    if (!projectId) {
      setSources([]);
      return;
    }
    listQualityTestSources(projectId)
      .then((r) => {
        setSources(r.sources);
        setSourceName((prev) => (r.sources.some((s) => s.name === prev) ? prev : (r.sources[0]?.name ?? '')));
      })
      .catch(() => {});
  }, [projectId]);

  const run = async () => {
    if (!projectId || running) return;
    setRunning(true);
    setResults(null);
    setFolder(null);
    try {
      const r = await runQualityTests(projectId, { name: sourceName || undefined, offsetSec, lengthSec });
      setResults(r.results);
      setFolder(r.folder);
      setExportId(r.exportId);
      setTestedSource(`${r.source.name} @ ${r.source.offsetSec.toFixed(0)}s`);
      addToast(`Quality test done: ${r.results.length} variants from ${r.source.name}`, 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Quality test failed', 'error');
    } finally {
      setRunning(false);
    }
  };

  const best = results?.reduce<QualityTestResult | null>(
    (top, r) => (!top || (r.ssim ?? 0) > (top.ssim ?? 0) ? r : top),
    null,
  );

  return (
    <Section title="Export tests">
      {sources.length === 0 ? (
        <div style={{ color: '#777', fontSize: 12, lineHeight: 1.5 }}>
          Export a clip first — tests run on finished videos.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              disabled={running}
              style={{ flex: 2, minWidth: 140, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ddd', padding: '4px 8px', fontSize: 12, fontFamily: 'inherit' }}
            >
              {sources.map((s) => (
                <option key={`${s.exportId}/${s.name}`} value={s.name}>{s.name}</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#888', fontSize: 11 }}>
              @
              <input
                type="number"
                min={0}
                step={1}
                value={offsetSec}
                onChange={(e) => setOffsetSec(Math.max(0, Number(e.target.value) || 0))}
                disabled={running}
                style={{ width: 56, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ddd', padding: '4px 6px', fontSize: 12, fontFamily: 'inherit' }}
              />
              s
            </label>
            <select
              value={lengthSec}
              onChange={(e) => setLengthSec(Number(e.target.value))}
              disabled={running}
              style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ddd', padding: '4px 8px', fontSize: 12, fontFamily: 'inherit' }}
            >
              <option value={5}>5s</option>
              <option value={10}>10s</option>
            </select>
            <button
              onClick={run}
              disabled={running || !sourceName}
              style={{
                background: '#1f6feb22', border: '1px solid #1f6feb', color: '#fff',
                borderRadius: 4, padding: '4px 12px', fontSize: 12, fontFamily: 'inherit',
                cursor: running || !sourceName ? 'default' : 'pointer',
                opacity: running || !sourceName ? 0.5 : 1,
              }}
            >
              {running ? '◌ Testing…' : '▶ Test quality'}
            </button>
          </div>
          {running && (
            <div style={{ color: '#888', fontSize: 12 }}>
              Cutting segment + encoding 4 variants + scoring… takes a few minutes.
            </div>
          )}
          {results && (
            <>
              <div style={{ color: '#777', fontSize: 11 }}>
                {testedSource} · GB/hour = extrapolated file size for one hour · SSIM closer to 1 = cleaner
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#666', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    <th style={{ padding: '4px 6px' }}>Profile</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Size</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>GB/hr</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>SSIM</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={r.key}
                      title={r.detail}
                      style={{
                        borderTop: '1px solid #1f1f1f',
                        background: best?.key === r.key ? '#22c55e11' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '5px 6px', color: best?.key === r.key ? '#86efac' : '#ddd' }}>
                        {r.label}{best?.key === r.key ? ' ★' : ''}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMB(r.sizeBytes)}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>
                        {r.gbPerHour.toFixed(1)}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>
                        {r.ssim === null ? '—' : r.ssim.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {folder && exportId && projectId && (
                <button
                  onClick={() => openExportFolder(projectId, exportId).catch(() => addToast('Could not open folder', 'error'))}
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#ddd', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'flex-start' }}
                >
                  Open test files
                </button>
              )}
            </>
          )}
        </>
      )}
    </Section>
  );
};
