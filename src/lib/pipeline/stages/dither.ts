import type { ShaderDefinition } from '../types';
import { DITHER_TYPES } from '../../../shaders/ditherShader';

const typeOptions = Object.entries(DITHER_TYPES).map(([k, v]) => ({ label: k.replace(/_/g, ' ').toLowerCase(), value: v as number }));

export const ditherStage: ShaderDefinition = {
  type: 'dither',
  label: 'Dither',
  description: 'Turns the image into a two-state mask (ink or transparent) painted with a color or gradient.',
  defaults: {
    type: 8, scale: 1.1, threshold: 1, alphaThreshold: 0.95, pulse: 0.1,
    gradient: true, color: '#ffffff', colorA: '#5754ff', colorB: '#666eae',
    angle: 0, spread: 1, offsetX: 0, offsetY: 0,
  },
  controls: [
    { kind: 'select', key: 'type', label: 'type', options: typeOptions },
    { kind: 'slider', key: 'scale', label: 'scale', min: 0.1, max: 8, step: 0.05 },
    { kind: 'slider', key: 'threshold', label: 'threshold', min: 0, max: 1, step: 0.01 },
    { kind: 'slider', key: 'alphaThreshold', label: 'alpha thresh', min: 0, max: 1, step: 0.01 },
    { kind: 'slider', key: 'pulse', label: 'pulse', min: 0, max: 1, step: 0.01 },
    { kind: 'segment', key: 'gradient', label: 'color mode', options: [{ label: 'Single color', value: false }, { label: 'Gradient', value: true }] },
    { kind: 'color', key: 'color', label: 'color', showIf: (p) => !p.gradient },
    { kind: 'color', key: 'colorA', label: 'color A', showIf: (p) => !!p.gradient },
    { kind: 'color', key: 'colorB', label: 'color B', showIf: (p) => !!p.gradient },
    { kind: 'slider', key: 'angle', label: 'angle', min: 0, max: 360, step: 1, showIf: (p) => !!p.gradient },
    { kind: 'slider', key: 'spread', label: 'spread', min: 0.1, max: 5, step: 0.05, showIf: (p) => !!p.gradient },
    { kind: 'slider', key: 'offsetX', label: 'offset X', min: -1, max: 1, step: 0.01, showIf: (p) => !!p.gradient },
    { kind: 'slider', key: 'offsetY', label: 'offset Y', min: -1, max: 1, step: 0.01, showIf: (p) => !!p.gradient },
  ],
  fragment: `
uniform float u_type, u_scale, u_threshold, u_alphaThreshold, u_pulse;
uniform float u_angle, u_spread, u_offsetX, u_offsetY;
uniform bool u_gradient;
uniform vec3 u_color, u_colorA, u_colorB;

float bayer2(vec2 c) {
  ivec2 p = ivec2(mod(c, 2.0));
  float m[4] = float[4](0.0, 2.0, 3.0, 1.0);
  return m[p.y * 2 + p.x] / 4.0;
}
float bayer4(vec2 c) {
  ivec2 p = ivec2(mod(c, 4.0));
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[p.y * 4 + p.x] / 16.0;
}
float bayer8(vec2 c) {
  ivec2 p = ivec2(mod(c, 8.0));
  float m[64] = float[64](
    0.0, 32.0, 8.0, 40.0, 2.0, 34.0, 10.0, 42.0, 48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
    12.0, 44.0, 4.0, 36.0, 14.0, 46.0, 6.0, 38.0, 60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
    3.0, 35.0, 11.0, 43.0, 1.0, 33.0, 9.0, 41.0, 51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
    15.0, 47.0, 7.0, 39.0, 13.0, 45.0, 5.0, 37.0, 63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0);
  return m[p.y * 8 + p.x] / 64.0;
}
float blueNoise(vec2 c) {
  vec2 p = fract(c * 0.3183099 + 0.71) * 17.0;
  return fract(p.x * p.y * (p.x + p.y));
}
float pattern(vec2 c) {
  return smoothstep(0.2, 0.4, length(fract(c / 4.0) - 0.5));
}

// Mirrors the legacy shader: pick a threshold for the pixel, then ink where luminance reaches it.
// Types 7-8 return a 0/1 "threshold" and 9-15 fall back to a 0.5 cut, exactly as before.
float ink(vec2 c, int t, float l) {
  float d;
  if (t == 7) { vec2 n = fract(c * 0.5453 + l * 0.3183); d = step((n.x + n.y) * 0.5 * 0.9375, l); }
  else if (t == 8) { vec2 n = fract(c * 0.7531 + l * 0.4142); d = step(n.x * n.y * 0.8 * 0.75, l); }
  else if (t >= 9) d = step(0.5, l);
  else if (t == 0) d = bayer2(c);
  else if (t == 2) d = bayer8(c);
  else if (t == 3) d = rand(c);
  else if (t == 4) d = blueNoise(c);
  else if (t == 5) d = pattern(c);
  else if (t == 6) d = u_threshold;
  else d = bayer4(c);
  return step(d, l);
}

void main() {
  vec4 src = texture2D(tInput, vUv);
  float l = luma(src.rgb);
  vec3 outColor = src.rgb;
  float alpha = 0.0;
  if (l <= u_alphaThreshold) {
    vec2 coord = vUv * uResolution * u_scale;
    if (ink(coord, int(u_type + 0.5), l) > 0.5) {
      alpha = 1.0;
      if (!u_gradient) {
        outColor = u_color;
      } else {
        float a = radians(u_angle);
        float t = dot(vUv - vec2(0.5 + u_offsetX, 0.5 + u_offsetY), vec2(cos(a), sin(a))) * u_spread + 0.5;
        outColor = mix(u_colorA, u_colorB, clamp(t, 0.0, 1.0));
      }
    }
  }
  alpha *= src.a * ((1.0 - u_pulse) + sin(uTime * 2.0) * u_pulse);
  gl_FragColor = vec4(outColor, alpha);
}
`,
};
