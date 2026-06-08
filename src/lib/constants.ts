export type MainTab = 'background' | 'video' | 'captions' | 'audio' | 'editor' | 'export';
export type BgSubTab = 'noise' | 'dither';
export type VideoSubTab = 'shader' | 'gradient' | 'settings';
export type VideoShaderSubTab = 'image' | 'rez' | 'distortion' | 'dither' | 'position';
export type AudioSubTab = 'music' | 'mixer' | 'reactivity';
export type CaptionsSubTab = 'editor' | 'type' | 'font' | 'shader';
export type EditorSubTab = 'edits' | 'mode';
export type EditorMode = 'clips' | 'full';
export type FxSubTab = 'sidechain' | 'limiter';

export type ProjectTaskStatus = {
  kind: 'idle' | 'progress' | 'success' | 'error';
  message: string;
  detail?: string;
  progress?: number;
};

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac'];

export function isAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith('audio/')) return true;
  const lower = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const GUIDES = [
  { key: '1080x1350', w: 1080, h: 1350, label: '1080×1350' },
  { key: '1080x1080', w: 1080, h: 1080, label: '1080×1080' },
  { key: '1920x1080', w: 1920, h: 1080, label: '1920×1080' },
  { key: '1080x1920', w: 1080, h: 1920, label: '1080×1920' },
] as const;

export type GuideKey = (typeof GUIDES)[number]['key'];

/** Slot key used to store caption settings when no crop guide is selected. */
export const CAPTION_GUIDE_SLOT_NONE = '__none__';

/** Map an active guide (or null) to its caption-settings slot key. */
export const captionGuideSlot = (guide: GuideKey | null): string => guide ?? CAPTION_GUIDE_SLOT_NONE;

/** Build a per-guide map that seeds every guide slot (and the no-guide slot)
 * with the same value. Used for backward-compat when loading legacy projects /
 * presets that stored a single flat caption style/shader. */
export function seedGuideMap<T>(value: T): Record<string, T> {
  const map: Record<string, T> = { [CAPTION_GUIDE_SLOT_NONE]: value };
  for (const g of GUIDES) map[g.key] = value;
  return map;
}

export const CANONICAL_RESOLUTIONS = [
  { w: 1080, h: 1920 }, // 9:16
  { w: 1080, h: 1350 }, // 4:5
  { w: 1080, h: 1080 }, // 1:1
  { w: 1920, h: 1080 }, // 16:9
] as const;

export const CAPTION_FONT_OPTIONS = [
  { label: 'Source Code Pro', value: '"Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { label: 'System mono', value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { label: 'System sans', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
];
