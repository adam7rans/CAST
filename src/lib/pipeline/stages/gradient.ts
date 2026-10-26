import type { ShaderDefinition } from '../types';
import { createDefaultVideoGradientStops, normalizeVideoGradientStops } from '../../types.videoGradient';
import type { VideoGradientStop } from '../../types.models';

export const gradientStage: ShaderDefinition = {
  type: 'gradient',
  label: 'Gradient',
  description: 'Blends a linear or radial multi-stop gradient over the image. Drag it anywhere in the pipeline.',
  customPanel: 'gradient',
  defaults: {
    gradientType: 0, gradientBlendMode: 1, gradientOpacity: 1, gradientAngle: 0, gradientScale: 1,
    gradientOffsetX: 0, gradientOffsetY: 0, gradientGuideVisible: false,
    gradientStops: createDefaultVideoGradientStops('#000000', 1, '#ffffff', 1),
  },
  controls: [],
  normalize: (params) => ({
    ...params,
    gradientStops: normalizeVideoGradientStops(params.gradientStops as VideoGradientStop[] | undefined),
  }),
  // Uniforms: u_gradientStopsColors / Opacities / Positions / Count are generated from the stops array.
  fragment: `
uniform float u_gradientType, u_gradientBlendMode, u_gradientOpacity, u_gradientAngle, u_gradientScale;
uniform float u_gradientOffsetX, u_gradientOffsetY, u_gradientStopsCount;
uniform vec3 u_gradientStopsColors[6];
uniform float u_gradientStopsOpacities[6];
uniform float u_gradientStopsPositions[6];

vec4 sampleGradient(float t) {
  int n = max(int(u_gradientStopsCount + 0.5), 1);
  if (n == 1 || t <= u_gradientStopsPositions[0]) return vec4(u_gradientStopsColors[0], u_gradientStopsOpacities[0]);
  for (int i = 1; i < 6; i++) {
    if (i >= n) break;
    float p0 = u_gradientStopsPositions[i - 1];
    float p1 = max(u_gradientStopsPositions[i], p0 + 0.0001);
    if (t <= p1 || i == n - 1) {
      float k = clamp((t - p0) / (p1 - p0), 0.0, 1.0);
      return vec4(mix(u_gradientStopsColors[i - 1], u_gradientStopsColors[i], k),
                  mix(u_gradientStopsOpacities[i - 1], u_gradientStopsOpacities[i], k));
    }
  }
  return vec4(u_gradientStopsColors[n - 1], u_gradientStopsOpacities[n - 1]);
}

void main() {
  vec4 src = texture2D(tInput, vUv);
  vec3 col = src.rgb;
  vec2 center = vec2(0.5 + u_gradientOffsetX, 0.5 + u_gradientOffsetY);
  float gt;
  if (u_gradientType < 0.5) {
    gt = dot(vUv - center, vec2(cos(u_gradientAngle), sin(u_gradientAngle))) * u_gradientScale + 0.5;
  } else {
    vec2 d = vUv - center;
    d.x *= uResolution.x / max(uResolution.y, 0.0001);
    gt = length(d) * u_gradientScale;
  }
  vec4 g = sampleGradient(clamp(gt, 0.0, 1.0));
  if (u_gradientBlendMode < 0.5) {
    col = mix(col, g.rgb, g.a * u_gradientOpacity);
  } else {
    vec3 b;
    if (u_gradientBlendMode < 1.5) b = col * g.rgb;
    else if (u_gradientBlendMode < 2.5) b = 1.0 - (1.0 - col) * (1.0 - g.rgb);
    else b = mix(2.0 * col * g.rgb, 1.0 - 2.0 * (1.0 - col) * (1.0 - g.rgb), step(0.5, col));
    col = mix(col, mix(b, g.rgb, g.a), u_gradientOpacity);
  }
  gl_FragColor = vec4(col, src.a);
}
`,
};
