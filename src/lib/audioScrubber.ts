/**
 * Tape-style audio scrubbing for the timeline playhead.
 *
 * While the playhead is dragged, every ~35 ms the stretch of audio it just
 * passed over is played: forwards when dragging right, reversed when dragging
 * left, sped up or slowed down to match the drag speed. Audio comes from the
 * server in 4-second mono 16 kHz pieces, fetched around the playhead and kept.
 */
const RATE = 16000;
const CHUNK_SEC = 4;
const MIN_STEP_MS = 35;
const MAX_SEGMENT_SEC = 0.35; // a big jump plays only its last moment
const FADE_SAMPLES = 48; // 3 ms ramps so pieces don't click
const MAX_QUEUE_SEC = 0.12; // never fall more than this behind the hand

export class AudioScrubber {
  private ctx: AudioContext | null = null;
  private chunks = new Map<number, Float32Array>();
  private pending = new Set<number>();
  private lastT = 0;
  private lastWall = 0;
  private nextStart = 0;
  private sources: AudioBufferSourceNode[] = [];

  constructor(private projectId: string) {}

  private load(index: number) {
    if (index < 0 || this.chunks.has(index) || this.pending.has(index)) return;
    this.pending.add(index);
    const start = index * CHUNK_SEC;
    fetch(`/api/projects/${encodeURIComponent(this.projectId)}/scrub-audio?start=${start}&dur=${CHUNK_SEC}`)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
      .then((buf) => {
        const pcm = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
        const out = new Float32Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
        this.chunks.set(index, out);
      })
      .catch(() => { /* silent: scrubbing just skips this stretch */ })
      .finally(() => this.pending.delete(index));
  }

  /** Fetch the pieces around `t` so they're ready before the hand gets there. */
  prefetch(t: number) {
    const i = Math.floor(t / CHUNK_SEC);
    for (const j of [i, i + 1, i - 1, i + 2]) this.load(j);
  }

  /** Samples for [a, b) seconds, or null if any piece isn't loaded yet. */
  private samples(a: number, b: number): Float32Array | null {
    const n = Math.max(0, Math.round((b - a) * RATE));
    if (n < 2) return null;
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const t = a + k / RATE;
      const chunk = this.chunks.get(Math.floor(t / CHUNK_SEC));
      if (!chunk) return null;
      const idx = Math.floor((t - Math.floor(t / CHUNK_SEC) * CHUNK_SEC) * RATE);
      out[k] = chunk[Math.min(idx, chunk.length - 1)] ?? 0;
    }
    return out;
  }

  begin(t: number) {
    if (!this.ctx) this.ctx = new AudioContext();
    void this.ctx.resume();
    this.lastT = t;
    this.lastWall = performance.now();
    this.nextStart = 0;
    this.prefetch(t);
  }

  move(t: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.prefetch(t);
    const now = performance.now();
    const wall = now - this.lastWall;
    if (wall < MIN_STEP_MS) return;
    const delta = t - this.lastT;
    this.lastT = t;
    this.lastWall = now;
    if (Math.abs(delta) < 0.004) return; // holding still: silence

    const forward = delta > 0;
    const span = Math.min(Math.abs(delta), MAX_SEGMENT_SEC);
    const from = forward ? t - span : t;
    const data = this.samples(Math.max(0, from), Math.max(0, from) + span);
    if (!data) return;
    if (!forward) data.reverse();
    for (let k = 0; k < FADE_SAMPLES && k < data.length / 2; k++) {
      const g = k / FADE_SAMPLES;
      data[k] *= g;
      data[data.length - 1 - k] *= g;
    }

    const rate = Math.min(3, Math.max(0.5, Math.abs(delta) / (wall / 1000)));
    const startAt = Math.max(ctx.currentTime, this.nextStart);
    if (startAt - ctx.currentTime > MAX_QUEUE_SEC) return; // behind: drop rather than lag
    const buffer = ctx.createBuffer(1, data.length, RATE);
    buffer.getChannelData(0).set(data);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(ctx.destination);
    src.start(startAt);
    this.nextStart = startAt + data.length / RATE / rate;
    this.sources.push(src);
    src.onended = () => { this.sources = this.sources.filter((s) => s !== src); };
  }

  end() {
    for (const src of this.sources) { try { src.stop(); } catch {} }
    this.sources = [];
  }

  dispose() {
    this.end();
    void this.ctx?.close();
    this.ctx = null;
    this.chunks.clear();
  }
}
