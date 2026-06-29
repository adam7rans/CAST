export const DEFAULT_NEW_PROJECT_PRESET_ID = 'white-sand-v3';

const PRESET_SETTING_KEYS = [
  'background',
  'backgroundDither',
  'video',
  'audioReactivity',
  'music',
  'limiter',
  'captionMode',
  'captionStyle',
  'captionShader',
  'captionStyleByGuide',
  'captionShaderByGuide',
  'layers',
  'activeGuide',
  'cropToGuide',
] as const;

export function extractPresetSettings(data: Record<string, any>): Record<string, any> {
  const settings: Record<string, any> = {};
  for (const key of PRESET_SETTING_KEYS) {
    const value = data[key];
    if (value !== undefined) settings[key] = JSON.parse(JSON.stringify(value));
  }
  return settings;
}

export function getPresetIdFromData(data: Record<string, any> | null | undefined): string | null {
  const presetId = data?.ui?.presetId;
  return typeof presetId === 'string' && presetId.trim() ? presetId : null;
}
