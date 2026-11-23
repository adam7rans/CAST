import type { WaveformPeaks } from './useWaveformPeaks';

const PEAK_COLOR = 'rgba(106, 169, 255, 0.28)';
const WAVE_COLOR = 'rgba(106, 169, 255, 0.85)';
const CUT_PEAK = 'rgba(255, 69, 58, 0.25)';
const CUT_COLOR = 'rgba(255, 69, 58, 0.7)';

/**
 * Draw the top half of the waveform for [viewStart, viewEnd] seconds onto
 * `canvas`, bars growing up from the bottom edge: each column's peak faintly,
 * its average loudness solid (so speech and pauses stay readable when zoomed
 * out). Columns inside an active cut are drawn red.
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  data: WaveformPeaks,
  viewStart: number,
  viewEnd: number,
  cuts: Array<{ startMs: number; endMs: number }>,
) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const span = Math.max(0.001, viewEnd - viewStart);
  const { peaks, rate, reference } = data;
  const sorted = [...cuts].sort((a, b) => a.startMs - b.startMs);
  let cutIdx = 0;
  for (let x = 0; x < cssW; x++) {
    const t0 = viewStart + (x / cssW) * span;
    const t1 = viewStart + ((x + 1) / cssW) * span;
    const i0 = Math.max(0, Math.floor(t0 * rate));
    const i1 = Math.min(peaks.length, Math.max(i0 + 1, Math.ceil(t1 * rate)));
    let v = 0;
    let sum = 0;
    for (let i = i0; i < i1; i++) { if (peaks[i] > v) v = peaks[i]; sum += peaks[i]; }
    if (v === 0) continue;
    const scale = (level: number) => Math.sqrt(Math.min(1, level / reference)) * (cssH - 1);
    const h = scale(v);
    const avgH = scale(sum / (i1 - i0));
    const midMs = ((t0 + t1) / 2) * 1000;
    while (cutIdx < sorted.length && sorted[cutIdx].endMs <= midMs) cutIdx++;
    const inCut = cutIdx < sorted.length && sorted[cutIdx].startMs <= midMs;
    ctx.fillStyle = inCut ? CUT_PEAK : PEAK_COLOR;
    ctx.fillRect(x, cssH - h, 1, h);
    ctx.fillStyle = inCut ? CUT_COLOR : WAVE_COLOR;
    ctx.fillRect(x, cssH - avgH, 1, avgH);
  }
}
