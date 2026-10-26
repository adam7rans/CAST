export const pipelineVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Preamble shared by every stage fragment shader. */
export const stagePreamble = `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 rand2(vec2 c) { return vec2(rand(c + vec2(13.1, 91.7)), rand(c + vec2(71.7, 29.3))); }
`;

export const presentFragmentShader = `
precision highp float;
uniform sampler2D tInput;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tInput, vUv); }
`;
