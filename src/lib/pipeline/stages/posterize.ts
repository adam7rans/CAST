import type { ShaderDefinition } from '../types';

export const posterizeStage: ShaderDefinition = {
  type: 'posterize',
  label: 'Posterize',
  description: 'Flattens brightness into a few bands painted with shades of one color; the shades can cycle over time.',
  defaults: {
    levels: 5, softness: 0, inputContrast: 1, color: '#c9a95a', lightAmount: 0.85, darkAmount: 0.85,
    mix: 1, cycle: true, cycleSpeed: 0.25, cycleStyle: 1, stepped: false,
  },
  controls: [
    { kind: 'slider', key: 'levels', label: 'bands', min: 2, max: 16, step: 1 },
    { kind: 'slider', key: 'softness', label: 'edge softness', min: 0, max: 1, step: 0.01 },
    { kind: 'slider', key: 'inputContrast', label: 'input contrast', min: 0.2, max: 4, step: 0.01 },
    { kind: 'color', key: 'color', label: 'base color' },
    { kind: 'slider', key: 'lightAmount', label: 'light shade', min: 0, max: 1, step: 0.01 },
    { kind: 'slider', key: 'darkAmount', label: 'dark shade', min: 0, max: 1, step: 0.01 },
    { kind: 'slider', key: 'mix', label: 'mix', min: 0, max: 1, step: 0.01 },
    { kind: 'toggle', key: 'cycle', label: 'cycle shades' },
    { kind: 'slider', key: 'cycleSpeed', label: 'cycle speed', min: -2, max: 2, step: 0.01, animatable: true, showIf: (p) => !!p.cycle },
    { kind: 'select', key: 'cycleStyle', label: 'cycle style', options: [{ label: 'wrap (light→dark, repeat)', value: 0 }, { label: 'ping-pong (smooth)', value: 1 }], showIf: (p) => !!p.cycle },
    { kind: 'toggle', key: 'stepped', label: 'stepped (stop-motion)', showIf: (p) => !!p.cycle },
  ],
  fragment: `
uniform float u_levels, u_softness, u_inputContrast, u_lightAmount, u_darkAmount, u_mix, u_cycleSpeed, u_cycleStyle;
uniform bool u_cycle, u_stepped;
uniform vec3 u_color;

// 0 = darkest shade, 0.5 = base color, 1 = lightest shade
vec3 ramp(float p) {
  vec3 dark = mix(u_color, vec3(0.0), u_darkAmount);
  vec3 light = mix(u_color, vec3(1.0), u_lightAmount);
  return p < 0.5 ? mix(dark, u_color, p * 2.0) : mix(u_color, light, (p - 0.5) * 2.0);
}

void main() {
  vec4 src = texture2D(tInput, vUv);
  float lv = max(2.0, floor(u_levels + 0.5));
  float l = clamp((luma(src.rgb) - 0.5) * u_inputContrast + 0.5, 0.0, 0.9999);

  // Quantize brightness into bands; softness blends neighbouring bands near their edges.
  float c = l * lv - 0.5;
  float idx = floor(c);
  float soft = smoothstep(0.5 - u_softness * 0.5, 0.5 + u_softness * 0.5 + 0.0001, fract(c));
  float band = clamp(idx + soft, 0.0, lv - 1.0);

  float p;
  if (u_cycle) {
    float phase = uTime * u_cycleSpeed;
    if (u_stepped) phase = floor(phase * lv) / lv;
    float q = band / lv + phase;
    p = u_cycleStyle < 0.5 ? fract(q) : 1.0 - abs(2.0 * fract(q) - 1.0);
  } else {
    p = band / (lv - 1.0);
  }
  gl_FragColor = vec4(mix(src.rgb, ramp(p), u_mix), src.a);
}
`,
};
