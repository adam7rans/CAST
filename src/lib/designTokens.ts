/* Shared design tokens for the redesigned control system (Direction D handoff).
   Near-black surfaces, Source Code Pro, filled sliders + pill toggles. These
   are the exact hex/spacing values from the handoff README "Design Tokens". */

export const C = {
  bg: '#0c0c0c', // panel base
  bar: '#0a0a0a', // bars / header strips
  raise: '#111', // slight raise
  field: '#161616', // inputs, selects, raised chips
  chip: '#1a1a1a', // inactive chips/buttons
  line: '#1f1f1f', // hairline dividers
  line2: '#2a2a2a', // control borders
  line3: '#333', // stronger dividers
  text: '#e6e6e6',
  dim: '#9a9a9a',
  faint: '#6b6b6b',
  fainter: '#555',
  blue: '#1f6feb',
  blueDim: '#9bc1ff',
  green: '#22c55e',
  orange: '#eb6f1f',
  red: '#ff453a',
  purple: '#8b5cf6',
  yellow: '#ffd60a',
  cyan: '#5ac8fa',
  font: '"Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;

/** Default control accent — white/off-white per the handoff's final direction. */
export const ACCENT = '#e8e8e8';

/** Per-layer colors (Background/Video/Captions/Music). */
export const LAYER_COLORS = {
  background: C.blue,
  video: C.green,
  captions: C.orange,
  music: C.purple,
} as const;

/** Convert a #hex color to an rgba() string at the given alpha. */
export function ALPHA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
