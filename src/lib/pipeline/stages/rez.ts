import type { ShaderDefinition } from '../types';

const notProgressive = (p: Record<string, unknown>) => !p.progressive;

export const rezStage: ShaderDefinition = {
  type: 'rez',
  label: 'Rez',
  description: 'Pixelate into cells and reduce the number of color steps. Cells can grow or shrink progressively across the frame.',
  defaults: {
    cellWidth: 8, cellHeight: 8, colorLevels: 24, mix: 1, jitter: 0,
    angle: 0, progressive: false, axis: 0, steps: 8, ratio: 6, curve: 0, shape: 0, repeats: 1,
  },
  controls: [
    { kind: 'slider', key: 'cellWidth', label: 'cell width', min: 1, max: 128, step: 1, showIf: (p) => notProgressive(p) || p.axis === 1 },
    { kind: 'slider', key: 'cellHeight', label: 'cell height', min: 1, max: 128, step: 1, showIf: (p) => notProgressive(p) || p.axis === 0 },
    { kind: 'slider', key: 'mix', label: 'mix', min: 0, max: 1, step: 0.01 },
    { kind: 'slider', key: 'colorLevels', label: 'color steps', min: 2, max: 64, step: 1 },
    { kind: 'slider', key: 'jitter', label: 'sample jitter', min: 0, max: 1, step: 0.01 },
    { kind: 'slider', key: 'angle', label: 'angle°', min: -180, max: 180, step: 0.5, animatable: true },
    { kind: 'toggle', key: 'progressive', label: 'progressive cells' },
    { kind: 'select', key: 'axis', label: 'applies to', options: [{ label: 'widths (columns)', value: 0 }, { label: 'heights (rows)', value: 1 }, { label: 'both', value: 2 }], showIf: (p) => !!p.progressive },
    { kind: 'slider', key: 'steps', label: 'iterations', min: 1, max: 64, step: 1, animatable: true, showIf: (p) => !!p.progressive },
    { kind: 'slider', key: 'ratio', label: 'growth ratio', min: 1, max: 40, step: 0.1, animatable: true, showIf: (p) => !!p.progressive },
    {
      kind: 'select', key: 'curve', label: 'growth curve', showIf: (p) => !!p.progressive,
      options: [{ label: 'linear', value: 0 }, { label: 'exponential', value: 1 }, { label: 'quadratic (slow start)', value: 2 }, { label: 'square root (fast start)', value: 3 }, { label: 'smooth ease', value: 4 }],
    },
    {
      kind: 'select', key: 'shape', label: 'direction', showIf: (p) => !!p.progressive,
      options: [{ label: 'grow', value: 0 }, { label: 'shrink', value: 1 }, { label: 'grow then shrink', value: 2 }],
    },
    { kind: 'slider', key: 'repeats', label: 'repeats', min: 1, max: 16, step: 1, showIf: (p) => !!p.progressive },
  ],
  fragment: `
uniform float u_cellWidth, u_cellHeight, u_colorLevels, u_mix, u_jitter;
uniform bool u_progressive;
uniform float u_angle, u_axis, u_steps, u_ratio, u_curve, u_shape, u_repeats;

// Relative width of the i-th cell in a cycle of n cells (first cell = 1, widest = ratio).
float cellWeight(int i, float n) {
  float t = n > 1.0 ? float(i) / (n - 1.0) : 0.0;
  if (u_shape > 1.5) t = 1.0 - abs(2.0 * t - 1.0);
  else if (u_shape > 0.5) t = 1.0 - t;
  float r = max(u_ratio, 1.0);
  if (u_curve > 0.5 && u_curve < 1.5) return pow(r, t);
  float f = t;
  if (u_curve > 1.5 && u_curve < 2.5) f = t * t;
  else if (u_curve > 2.5 && u_curve < 3.5) f = sqrt(t);
  else if (u_curve > 3.5) f = t * t * (3.0 - 2.0 * t);
  return mix(1.0, r, f);
}

// Returns (snapped uv, cell size in uv, cell index) along one axis.
vec3 axisCell(float u, float cellPx, float resPx, bool progressive) {
  if (!progressive) {
    float size = max(1.0, cellPx) / resPx;
    float idx = floor(u / size);
    return vec3((idx + 0.5) * size, size, idx);
  }
  float n = clamp(floor(u_steps + 0.5), 1.0, 64.0);
  float cycles = max(1.0, floor(u_repeats + 0.5));
  float cycle = min(floor(u * cycles), cycles - 1.0);
  float local = u * cycles - cycle;
  float total = 0.0;
  for (int i = 0; i < 64; i++) { if (float(i) >= n) break; total += cellWeight(i, n); }
  float x = local * total;
  float acc = 0.0;
  for (int i = 0; i < 64; i++) {
    if (float(i) >= n) break;
    float w = cellWeight(i, n);
    if (x < acc + w || float(i) == n - 1.0) {
      return vec3((cycle + (acc + w * 0.5) / total) / cycles, w / total / cycles, cycle * 64.0 + float(i));
    }
    acc += w;
  }
  return vec3(u, 1.0 / resPx, 0.0);
}

void main() {
  // Lay the cell grid out in a frame rotated by u_angle, sized to just cover the screen.
  float a = radians(u_angle);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 hs = 0.5 * uResolution;
  vec2 ext = vec2(abs(cos(a)) * hs.x + abs(sin(a)) * hs.y, abs(sin(a)) * hs.x + abs(cos(a)) * hs.y);
  vec2 r = rot * ((vUv - 0.5) * uResolution);            // pixel offset from centre, in the rotated frame
  vec2 g = r / (2.0 * ext) + 0.5;                      // 0..1 across the rotated frame

  bool pu = u_progressive && u_axis != 1.0;
  bool pv = u_progressive && u_axis != 0.0;
  vec3 cx = axisCell(g.x, u_cellWidth, 2.0 * ext.x, pu);
  vec3 cy = axisCell(g.y, u_cellHeight, 2.0 * ext.y, pv);
  vec2 snapped = vec2(cx.x, cy.x);
  if (u_jitter > 0.0) snapped += (rand2(vec2(cx.z, cy.z)) - 0.5) * vec2(cx.y, cy.y) * u_jitter;
  vec2 snappedPx = ((snapped - 0.5) * 2.0 * ext) * rot;   // back to screen pixels
  vec2 snappedUv = snappedPx / uResolution + 0.5;
  vec2 uv = mix(vUv, clamp(snappedUv, 0.0, 1.0), clamp(u_mix, 0.0, 1.0));
  vec4 src = texture2D(tInput, uv);
  float lv = max(2.0, u_colorLevels);
  vec3 c = floor(src.rgb * (lv - 1.0) + 0.5) / (lv - 1.0);
  gl_FragColor = vec4(c, src.a);
}
`,
};
