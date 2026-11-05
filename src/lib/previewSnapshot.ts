/**
 * Capture what the preview currently shows — background shader, processed
 * video, visualizer and shader captions — as a small JPEG for the project
 * dashboard. Every visible <canvas> inside the preview is drawn in DOM order at
 * its on-screen position relative to the output frame, so the image matches
 * the preview rather than the raw video. The WebGL renderers keep their
 * drawing buffers (preserveDrawingBuffer), so this can run at any time.
 */
const SNAPSHOT_WIDTH = 640;

export interface SnapshotOptions {
  /** Fill behind transparent layers (the preview's background colour). */
  backdrop: string;
  invert: boolean;
}

function visibleCanvases(root: HTMLElement): HTMLCanvasElement[] {
  return Array.from(root.querySelectorAll('canvas')).filter((c) => {
    if (c.width === 0 || c.height === 0) return false;
    const style = getComputedStyle(c);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = c.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  });
}

/** Near-uniform frames (nothing rendered yet, black lead-in) make useless thumbnails. */
function looksBlank(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas');
  probe.width = 24;
  probe.height = 14;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  let sum = 0;
  let sumSq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += luma;
    sumSq += luma * luma;
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean)) < 4;
}

/** Returns a JPEG of the current preview, or null if nothing worth keeping is on screen. */
export async function capturePreviewSnapshot(root: HTMLElement, options: SnapshotOptions): Promise<Blob | null> {
  const layers = visibleCanvases(root);
  if (layers.length === 0) return null;
  // The output frame is the first full-frame layer (background, else video).
  const frame = layers[0].getBoundingClientRect();
  const scale = SNAPSHOT_WIDTH / frame.width;
  const out = document.createElement('canvas');
  out.width = SNAPSHOT_WIDTH;
  out.height = Math.max(1, Math.round(frame.height * scale));
  const ctx = out.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = options.backdrop;
  ctx.fillRect(0, 0, out.width, out.height);
  for (const layer of layers) {
    const rect = layer.getBoundingClientRect();
    try {
      ctx.drawImage(layer, (rect.left - frame.left) * scale, (rect.top - frame.top) * scale, rect.width * scale, rect.height * scale);
    } catch {
      // A tainted or lost-context canvas: skip that layer rather than fail.
    }
  }
  if (options.invert) {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (looksBlank(out)) return null;
  return new Promise((resolve) => out.toBlob((blob) => resolve(blob), 'image/jpeg', 0.84));
}
