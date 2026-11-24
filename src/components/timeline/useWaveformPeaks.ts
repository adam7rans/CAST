import { useEffect, useState } from 'react';

export interface WaveformPeaks {
  /** Loudest sample per bin, 0–255. */
  peaks: Uint8Array;
  /** Bins per second. */
  rate: number;
  /** Level treated as full height: the 98th percentile, so one loud cough doesn't flatten the rest. */
  reference: number;
  /** Background noise level (30th percentile), drawn as nothing so silence looks silent. */
  floor: number;
}

function percentile(values: Uint8Array, p: number): number {
  const counts = new Uint32Array(256);
  for (const v of values) counts[v]++;
  const target = values.length * p;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += counts[v];
    if (seen >= target) return Math.max(1, v);
  }
  return 255;
}

/** Fetch the project's waveform peaks; refetches when `mediaKey` changes (e.g. after compression). */
export function useWaveformPeaks(projectId: string | null | undefined, mediaKey: string): WaveformPeaks | null {
  const [data, setData] = useState<WaveformPeaks | null>(null);
  useEffect(() => {
    setData(null);
    if (!projectId || !mediaKey) return;
    const controller = new AbortController();
    fetch(`/api/projects/${encodeURIComponent(projectId)}/peaks`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`peaks ${res.status}`);
        const rate = Number(res.headers.get('X-Peaks-Rate')) || 100;
        const peaks = new Uint8Array(await res.arrayBuffer());
        setData({ peaks, rate, reference: percentile(peaks, 0.98), floor: percentile(peaks, 0.3) });
      })
      .catch(() => { /* no waveform: the words track still works */ });
    return () => controller.abort();
  }, [projectId, mediaKey]);
  return data;
}
