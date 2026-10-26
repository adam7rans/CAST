import { stagePreamble } from './common';

/**
 * First pass of the pipeline: samples the video (cover-fit + position/zoom/rotation). Not reorderable.
 */
export const sourceFragmentShader = `${stagePreamble}
uniform vec2 uUvScale;
uniform float uPositionX, uPositionY, uPositionRotation, uPositionScale;

void main() {
  vec2 p = vUv - 0.5 - vec2(uPositionX, uPositionY);
  p = mat2(cos(uPositionRotation), -sin(uPositionRotation), sin(uPositionRotation), cos(uPositionRotation)) * p;
  p *= uPositionScale;
  p *= uUvScale;
  vec3 col = texture2D(tInput, clamp(p + 0.5, 0.0, 1.0)).rgb;

  gl_FragColor = vec4(col, 1.0);
}
`;
