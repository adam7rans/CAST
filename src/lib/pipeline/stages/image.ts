import type { ShaderDefinition } from '../types';

export const imageStage: ShaderDefinition = {
  type: 'image',
  label: 'Image',
  description: 'Levels, tone, exposure, contrast and saturation.',
  defaults: {
    blackPoint: 0, whitePoint: 1, brightness: 0.8, contrast: 0.9, shadows: 0, midtones: 0, highlights: 0,
    exposure: 0, gamma: 1, saturation: 1, clarity: 0,
  },
  controls: [
    { kind: 'slider', key: 'brightness', label: 'brightness', min: 0, max: 3, step: 0.01 },
    { kind: 'slider', key: 'contrast', label: 'contrast', min: 0, max: 4, step: 0.01 },
    { kind: 'slider', key: 'exposure', label: 'exposure', min: -3, max: 3, step: 0.05 },
    { kind: 'slider', key: 'shadows', label: 'shadows', min: -0.5, max: 0.5, step: 0.01 },
    { kind: 'slider', key: 'midtones', label: 'midtones', min: -0.5, max: 0.5, step: 0.01 },
    { kind: 'slider', key: 'highlights', label: 'highlights', min: -0.5, max: 0.5, step: 0.01 },
    { kind: 'slider', key: 'saturation', label: 'saturation', min: 0, max: 3, step: 0.01 },
    { kind: 'slider', key: 'gamma', label: 'gamma', min: 0.2, max: 3, step: 0.01 },
    { kind: 'slider', key: 'clarity', label: 'clarity', min: -1, max: 1, step: 0.01 },
    { kind: 'slider', key: 'blackPoint', label: 'black point', min: 0, max: 1, step: 0.005 },
    { kind: 'slider', key: 'whitePoint', label: 'white point', min: 0, max: 1, step: 0.005 },
  ],
  fragment: `
uniform float u_blackPoint, u_whitePoint, u_brightness, u_contrast, u_shadows, u_midtones, u_highlights;
uniform float u_exposure, u_gamma, u_saturation, u_clarity;

float adjustTone(float v, float sh, float mid, float hi) {
  float shI = 1.0 - smoothstep(0.0, 0.6, v);
  float hiI = smoothstep(0.4, 1.0, v);
  float midI = 1.0 - abs(v - 0.5) * 2.0;
  return clamp(v + shI * sh + midI * mid + hiI * hi, 0.0, 1.0);
}

void main() {
  vec4 src = texture2D(tInput, vUv);
  vec3 c = pow(src.rgb, vec3(2.2));
  c *= pow(2.0, u_exposure);
  c = clamp((c - vec3(u_blackPoint)) / max(u_whitePoint - u_blackPoint, 0.0001), 0.0, 1.0);
  c = vec3(adjustTone(c.r, u_shadows, u_midtones, u_highlights),
           adjustTone(c.g, u_shadows, u_midtones, u_highlights),
           adjustTone(c.b, u_shadows, u_midtones, u_highlights));
  c = clamp(pow(c, vec3(1.0 / max(u_gamma, 0.001))), 0.0, 1.0);
  if (u_clarity != 0.0) {
    float l = luma(c);
    c = mix(c, vec3(l), -u_clarity * 4.0 * l * (1.0 - l));
  }
  c = pow(c, vec3(1.0 / 2.2));
  c = clamp((c - 0.5) * u_contrast + 0.5 + (u_brightness - 1.0), 0.0, 1.0);
  if (u_saturation != 1.0) c = mix(vec3(luma(c)), c, u_saturation);
  gl_FragColor = vec4(c, src.a);
}
`,
};
