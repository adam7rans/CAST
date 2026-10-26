import type { ShaderDefinition } from '../types';

export const distortStage: ShaderDefinition = {
  type: 'distort',
  label: 'Distort',
  description: 'Rotate / scale the image and ripple it with an animated sine wave.',
  defaults: { rotation: 0, scale: 1, waveFreq: 82, waveAmp: 0.005, waveSpeed: 1.7, waveAngle: 57 },
  controls: [
    { kind: 'slider', key: 'rotation', label: 'rotation°', min: -180, max: 180, step: 0.5, animatable: true },
    { kind: 'slider', key: 'scale', label: 'scale', min: 0.1, max: 3, step: 0.01, animatable: true },
    { kind: 'slider', key: 'waveFreq', label: 'wave freq', min: 0, max: 200, step: 0.5, animatable: true },
    { kind: 'slider', key: 'waveAmp', label: 'wave amp', min: 0, max: 0.1, step: 0.001, animatable: true },
    { kind: 'slider', key: 'waveSpeed', label: 'wave speed', min: -5, max: 5, step: 0.05, animatable: true },
    { kind: 'slider', key: 'waveAngle', label: 'wave angle°', min: 0, max: 360, step: 1, animatable: true },
  ],
  fragment: `
uniform float u_rotation, u_scale, u_waveFreq, u_waveAmp, u_waveSpeed, u_waveAngle;

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vUv - 0.5;
  p.x *= aspect;
  float r = radians(u_rotation);
  p = mat2(cos(r), -sin(r), sin(r), cos(r)) * p;
  p *= u_scale;
  p.x /= aspect;
  vec2 uv = p + 0.5;

  float a = radians(u_waveAngle);
  vec2 dir = vec2(cos(a), sin(a));
  float wave = sin(dot(vUv - 0.5, dir) * u_waveFreq + uTime * u_waveSpeed) * u_waveAmp;
  float edge = smoothstep(0.0, 0.05, vUv.x) * (1.0 - smoothstep(0.95, 1.0, vUv.x)) *
               smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.95, 1.0, vUv.y));
  uv += vec2(-dir.y, dir.x) * wave * edge;
  gl_FragColor = texture2D(tInput, clamp(uv, 0.0, 1.0));
}
`,
};
