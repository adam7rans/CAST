// Types mirroring cast-metal's ShaderParams (Swift) for the control WebSocket.
// Keep in sync with Sources/CastMetalCore/ShaderParams.swift.

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  r: number;
  g: number;
  b: number;
}

export interface GradientStop {
  color: Vec3;
  opacity: number;
  position: number;
}

export type DitherType =
  | 'bayer2x2' | 'bayer4x4' | 'bayer8x8' | 'random' | 'blueNoise'
  | 'pattern' | 'threshold' | 'floydSteinberg' | 'atkinson' | 'burkes'
  | 'jarvis' | 'sierra2' | 'stucki' | 'diffusionRow' | 'diffusionColumn'
  | 'diffusion2D';

export type GradientBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

export interface MetalShaderParams {
  resolution: Vec2;

  gradientEnabled: boolean;
  gradientType: number; // 0 linear, 1 radial
  gradientStops: GradientStop[];
  gradientOpacity: number;
  gradientBlendMode: GradientBlendMode;
  gradientAngle: number;
  gradientScale: number;
  gradientOffsetX: number;
  gradientOffsetY: number;

  shaderEnabled: boolean;

  rezEnabled: boolean;
  rezCellWidth: number;
  rezCellHeight: number;
  rezColorLevels: number;
  rezMix: number;
  rezJitter: number;

  ditherScale: number;
  contrast: number;
  brightness: number;
  blackPoint: number;
  whitePoint: number;
  gamma: number;
  shadows: number;
  midtones: number;
  highlights: number;
  saturation: number;
  exposure: number;
  clarity: number;

  ditherType: DitherType;
  errorDiffusion: number;
  threshold: number;
  alphaThreshold: number;
  ditherEnabled: boolean;
  ditherGradient: boolean;
  ditherColor: Vec3;
  ditherGradientColorA: Vec3;
  ditherGradientColorB: Vec3;
  ditherGradientAngle: number;
  ditherGradientScale: number;
  ditherGradientOffsetX: number;
  ditherGradientOffsetY: number;

  distortionFrequency: number;
  distortionAmplitude: number;
  distortionSpeed: number;
  distortionAngle: number;

  positionX: number;
  positionY: number;
  positionRotation: number;
  positionScale: number;
  rotation: number;
  scale: number;
  uvScale: Vec2;
}

export type MetalParamPatch = Partial<{
  [K in keyof Omit<MetalShaderParams, 'resolution'>]: MetalShaderParams[K];
}>;

export interface MetalStats {
  fps: number;
  frames?: number;
  camera?: string;
}

export const METAL_WS_URL = 'ws://127.0.0.1:4313/ws';
export const METAL_HTTP_BASE = 'http://127.0.0.1:4313';
export const METAL_SUPERVISOR_BASE = '/api/metal';

export interface MetalCameraInfo {
  name: string;
}
