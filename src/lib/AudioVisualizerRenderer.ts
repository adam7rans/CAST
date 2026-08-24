import type { AudioBands } from './AudioSource';
import type { AudioVisualizerParams } from './types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function colorWithAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

export function spectrumFromBands(bands: AudioBands, size = 64): Float32Array {
  const result = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const x = i / Math.max(1, size - 1);
    const low = bands.low * Math.exp(-Math.pow((x - 0.12) / 0.2, 2));
    const mid = bands.mid * Math.exp(-Math.pow((x - 0.46) / 0.27, 2));
    const high = bands.high * Math.exp(-Math.pow((x - 0.82) / 0.3, 2));
    result[i] = clamp01(Math.max(low, mid, high) + bands.rms * 0.15);
  }
  return result;
}

export class AudioVisualizerRenderer {
  private history: Float32Array[] = [];
  private historyTime: number | null = null;

  reset() { this.history = []; this.historyTime = null; }

  seedHistory(rows: Float32Array[]) {
    this.history = rows.slice(0, 42);
    this.historyTime = null;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number, spectrum: Float32Array, params: AudioVisualizerParams, clear = true, sourceTime?: number) {
    if (clear) ctx.clearRect(0, 0, width, height);
    if (!params.enabled || width < 2 || height < 2) return;
    const values = Float32Array.from(spectrum, (v) => clamp01(v * params.sensitivity));
    ctx.save();
    ctx.globalAlpha = params.opacity;
    if (params.placement === 'frame') this.drawFrame(ctx, width, height, values, params);
    else if (params.style === 'mel') {
      const delta = sourceTime === undefined || this.historyTime === null ? null : sourceTime - this.historyTime;
      if (delta !== null && (delta < -0.01 || delta > 0.25)) this.history = [];
      const advance = sourceTime === undefined || this.historyTime === null || Math.abs(sourceTime - this.historyTime) >= 1 / 60;
      if (advance) {
        this.history.unshift(values);
        if (this.history.length > 42) this.history.length = 42;
        if (sourceTime !== undefined) this.historyTime = sourceTime;
      }
      this.drawMel(ctx, width, height, params);
    }
    else this.drawSpectrum(ctx, width, height, values, params);
    ctx.restore();
  }

  private drawSpectrum(ctx: CanvasRenderingContext2D, width: number, height: number, values: Float32Array, p: AudioVisualizerParams) {
    const panelH = height * p.height / 100;
    const baseY = p.placement === 'top' ? 0 : height;
    const direction = p.placement === 'top' ? 1 : -1;
    const gradient = ctx.createLinearGradient(0, baseY, 0, baseY + direction * panelH);
    gradient.addColorStop(0, p.colorLow);
    gradient.addColorStop(1, p.colorHigh);
    ctx.fillStyle = gradient;
    const gap = Math.max(1, width / values.length * 0.18);
    const barW = width / values.length;
    values.forEach((value, i) => {
      const h = Math.max(p.thickness, value * panelH);
      ctx.fillRect(i * barW + gap / 2, baseY, Math.max(1, barW - gap), direction * h);
    });
  }

  private drawMel(ctx: CanvasRenderingContext2D, width: number, height: number, p: AudioVisualizerParams) {
    const rows = 42;
    const panelH = height * p.height / 100;
    const top = p.placement === 'top' ? 0 : height - panelH;
    const rowH = panelH / rows;
    this.history.forEach((row, age) => {
      const alpha = 1 - age / rows;
      const y = p.placement === 'top' ? top + age * rowH : top + panelH - (age + 1) * rowH;
      const cellW = width / row.length;
      row.forEach((value, i) => {
        const hot = clamp01(value * 1.35);
        ctx.fillStyle = hot > 0.55 ? colorWithAlpha(p.colorHigh, alpha * hot) : colorWithAlpha(p.colorLow, alpha * Math.max(0.08, hot));
        ctx.fillRect(i * cellW, y, Math.ceil(cellW), Math.ceil(rowH + 0.5));
      });
    });
  }

  private drawFrame(ctx: CanvasRenderingContext2D, width: number, height: number, values: Float32Array, p: AudioVisualizerParams) {
    const depth = Math.min(width, height) * p.height / 200;
    const count = Math.floor(values.length / 4);
    ctx.lineWidth = Math.max(1, p.thickness);
    values.forEach((value, i) => {
      const side = Math.min(3, Math.floor(i / count));
      const local = (i % count) / Math.max(1, count - 1);
      ctx.strokeStyle = colorWithAlpha(i / values.length > 0.55 ? p.colorHigh : p.colorLow, 0.4 + value * 0.6);
      ctx.beginPath();
      if (side === 0) { const x = local * width; ctx.moveTo(x, 0); ctx.lineTo(x, value * depth); }
      if (side === 1) { const y = local * height; ctx.moveTo(width, y); ctx.lineTo(width - value * depth, y); }
      if (side === 2) { const x = width - local * width; ctx.moveTo(x, height); ctx.lineTo(x, height - value * depth); }
      if (side === 3) { const y = height - local * height; ctx.moveTo(0, y); ctx.lineTo(value * depth, y); }
      ctx.stroke();
    });
  }
}
