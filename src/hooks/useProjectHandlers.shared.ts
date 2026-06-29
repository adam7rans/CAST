import { DEFAULT_LIMITER } from '../lib/AudioSource';
import { DEFAULT_MUSIC_PARAMS } from '../lib/MusicPlayer';
import { DEFAULT_AUDIO_REACTIVITY, DEFAULT_BACKGROUND, DEFAULT_CAPTION_SHADER, DEFAULT_CAPTION_STYLE, DEFAULT_DITHER, DEFAULT_EXPORT, DEFAULT_VIDEO, normalizeVideoShaderParams } from '../lib/types';
import { seedGuideMap, type GuideKey } from '../lib/constants';
import type { CaptionShaderParams, CaptionStyle } from '../lib/types';
import type { ProjectData } from '../lib/projectApi';
import type { ProjectHandlerRefs, ProjectHandlerSetters } from './useProjectHandlers.types';

function normalizeStyleMap(map: Record<string, any>): Record<string, CaptionStyle> {
  const out: Record<string, CaptionStyle> = {};
  for (const [key, value] of Object.entries(map)) {
    if (value && typeof value === 'object') out[key] = { ...DEFAULT_CAPTION_STYLE, ...value };
  }
  return out;
}

function normalizeShaderMap(map: Record<string, any>): Record<string, CaptionShaderParams> {
  const out: Record<string, CaptionShaderParams> = {};
  for (const [key, value] of Object.entries(map)) {
    if (value && typeof value === 'object') out[key] = { ...DEFAULT_CAPTION_SHADER, ...value };
  }
  return out;
}

export function resetManagedMedia(refs: ProjectHandlerRefs) {
  refs.mediaElRef.current?.pause();
  refs.videoElRef.current = null;
  refs.audioElRef.current = null;
  refs.mediaElRef.current = null;
  refs.audioSourceRef.current?.dispose();
  refs.audioSourceRef.current = null;
  refs.videoRendererRef.current?.setVideo(null);
  refs.musicElRef.current?.pause();
  refs.musicPlayerRef.current?.dispose();
  refs.musicPlayerRef.current = null;
  refs.musicElRef.current = null;
}

export function resetProjectState(setters: ProjectHandlerSetters) {
  setters.setMainTab('video');
  setters.setBgSubTab('noise');
  setters.setVideoSubTab('shader');
  setters.setVideoShaderSubTab('image');
  setters.setCaptionsSubTab('editor');
  setters.setEditorSubTab('edits');
  setters.setEditorMode('clips');
  setters.setBg(DEFAULT_BACKGROUND);
  setters.setBgDither(DEFAULT_DITHER);
  setters.setVid(DEFAULT_VIDEO);
  setters.setBgExport({ ...DEFAULT_EXPORT, filenamePrefix: 'bg' });
  setters.setVidExport({ ...DEFAULT_EXPORT, filenamePrefix: 'talking' });
  setters.setActiveGuide(null);
  setters.setCropToGuide(false);
  setters.setBgLayerOn(true);
  setters.setVideoLayerOn(true);
  setters.setCaptionsLayerOn(true);
  setters.setCaptionMode('line');
  setters.setCaptionStyle(DEFAULT_CAPTION_STYLE);
  setters.setCaptionShader(DEFAULT_CAPTION_SHADER);
  setters.setCaptionStyleByGuide({});
  setters.setCaptionShaderByGuide({});
  setters.setMuted(false);
  setters.setMediaVolume(1);
  setters.setVideoInfo(null);
  setters.setAudioInfo(null);
  setters.setPlayheadSecond(0);
  setters.setTranscript(null);
  setters.setTranscriptName(null);
  setters.setCaptionClipEdits({});
  setters.setCurrentPresetId(null);
  setters.setPlaying(false);
  setters.setAudioReactivity(DEFAULT_AUDIO_REACTIVITY);
  setters.setMusicInfo(null);
  setters.setMusic(DEFAULT_MUSIC_PARAMS);
  setters.setMusicLibrary([]);
  setters.setMusicAssetDurations({});
  setters.setSelectedMusicAssetIds([]);
  setters.setMusicTimelineClips([]);
  setters.setSelectedMusicClipId(null);
  setters.setLimiter(DEFAULT_LIMITER);
  setters.setMusicLayerOn(true);
  setters.setShowAudioTracks(true);
  setters.setMicroTimelines([]);
  setters.setSelectedClipId(null);
  setters.setSelectedFullSegmentId(null);
  setters.setPendingClipStart(null);
  setters.setCustomCuts([]);
  setters.setJumpCutsEnabled(false);
  setters.setJumpCutGapMs(300);
  setters.setJumpCutPaddingMs(0);
  setters.setCustomCutPaddingMs(0);
  setters.setJumpCutGapOverrides({});
  setters.setJumpCutGapDisabled({});
  setters.setSelectedGapKey(null);
  setters.setShowSilenceGaps(false);
  setters.setShowFillerCuts(false);
  setters.setShowManualCuts(false);
}

export function applyProjectVisualState(proj: ProjectData, setters: ProjectHandlerSetters) {
  if (proj.background) setters.setBg(proj.background);
  if (proj.backgroundDither) setters.setBgDither(proj.backgroundDither);
  if (proj.video) setters.setVid(normalizeVideoShaderParams(proj.video));
  setters.setAudioReactivity(proj.audioReactivity ? { ...DEFAULT_AUDIO_REACTIVITY, ...proj.audioReactivity } : DEFAULT_AUDIO_REACTIVITY);
  setters.setMusic(proj.music ? { ...DEFAULT_MUSIC_PARAMS, ...proj.music, sidechain: { ...DEFAULT_MUSIC_PARAMS.sidechain, ...(proj.music.sidechain ?? {}) } } : DEFAULT_MUSIC_PARAMS);
  setters.setLimiter(proj.limiter ? { ...DEFAULT_LIMITER, ...proj.limiter } : DEFAULT_LIMITER);
  if (proj.captionMode) setters.setCaptionMode(proj.captionMode);
  // Caption style/shader are per crop-guide. Prefer the per-guide maps; fall
  // back to seeding every guide slot from the legacy flat value.
  if (proj.captionStyleByGuide && typeof proj.captionStyleByGuide === 'object') {
    setters.setCaptionStyleByGuide(normalizeStyleMap(proj.captionStyleByGuide));
  } else if (proj.captionStyle) {
    setters.setCaptionStyleByGuide(seedGuideMap({ ...DEFAULT_CAPTION_STYLE, ...proj.captionStyle }));
  } else {
    setters.setCaptionStyleByGuide({});
  }
  if (proj.captionShaderByGuide && typeof proj.captionShaderByGuide === 'object') {
    setters.setCaptionShaderByGuide(normalizeShaderMap(proj.captionShaderByGuide));
  } else if (proj.captionShader) {
    setters.setCaptionShaderByGuide(seedGuideMap({ ...DEFAULT_CAPTION_SHADER, ...proj.captionShader }));
  } else {
    setters.setCaptionShaderByGuide({});
  }
  if (proj.layers) {
    setters.setBgLayerOn(proj.layers.background ?? true);
    setters.setVideoLayerOn(proj.layers.video ?? true);
    setters.setCaptionsLayerOn(proj.layers.captions ?? true);
    setters.setMusicLayerOn(proj.layers.music ?? true);
    if (proj.layers.bgOffMode) setters.setBgOffMode(proj.layers.bgOffMode);
    if (proj.layers.bgOffColor) setters.setBgOffColor(proj.layers.bgOffColor);
  }
  if (proj.activeGuide !== undefined) setters.setActiveGuide(proj.activeGuide as GuideKey | null);
  else if (proj.guides) setters.setActiveGuide((Object.entries(proj.guides) as [GuideKey, boolean][]).find(([, on]) => on)?.[0] ?? null);
  else setters.setActiveGuide(null);
  if (proj.cropToGuide !== undefined) setters.setCropToGuide(proj.cropToGuide);
  if (proj.exportBackground) setters.setBgExport(proj.exportBackground);
  if (proj.exportVideo) setters.setVidExport(proj.exportVideo);
}

export function applyProjectUiState(proj: ProjectData, setters: ProjectHandlerSetters) {
  if (!proj.ui) {
    setters.setEditorSubTab('edits');
    setters.setEditorMode('clips');
    setters.setSelectedFullSegmentId(null);
    setters.setShowAudioTracks(true);
    setters.setCurrentPresetId(null);
    return;
  }
  if (proj.ui.mainTab === 'reactivity') {
    setters.setMainTab('audio');
    setters.setAudioSubTab('reactivity');
  } else if (proj.ui.mainTab === 'music') {
    setters.setMainTab('audio');
    setters.setAudioSubTab('music');
  } else if (proj.ui.mainTab) setters.setMainTab(proj.ui.mainTab);
  if (proj.ui.bgSubTab) setters.setBgSubTab(proj.ui.bgSubTab);
  if (proj.ui.videoSubTab) {
    if (['levels', 'tone', 'color', 'image', 'rez', 'distortion', 'dither', 'position'].includes(proj.ui.videoSubTab)) {
      setters.setVideoSubTab('shader');
      setters.setVideoShaderSubTab(['levels', 'tone', 'color'].includes(proj.ui.videoSubTab) ? 'image' : proj.ui.videoSubTab);
    } else setters.setVideoSubTab(proj.ui.videoSubTab);
  }
  if (proj.ui.videoShaderSubTab) setters.setVideoShaderSubTab(['levels', 'tone', 'color'].includes(proj.ui.videoShaderSubTab) ? 'image' : proj.ui.videoShaderSubTab);
  if (proj.ui.audioSubTab) setters.setAudioSubTab(proj.ui.audioSubTab === 'music' ? 'mixer' : proj.ui.audioSubTab);
  if (proj.ui.captionsSubTab) setters.setCaptionsSubTab(proj.ui.captionsSubTab === 'captions' ? 'editor' : proj.ui.captionsSubTab);
  setters.setEditorSubTab(proj.ui.editorSubTab ?? 'edits');
  setters.setEditorMode(proj.ui.editorMode ?? 'clips');
  setters.setSelectedFullSegmentId(typeof proj.ui.selectedFullSegmentId === 'string' || proj.ui.selectedFullSegmentId === null ? proj.ui.selectedFullSegmentId : null);
  setters.setShowAudioTracks(typeof proj.ui.showAudioTracks === 'boolean' ? proj.ui.showAudioTracks : true);
  if (typeof proj.ui.muted === 'boolean') setters.setMuted(proj.ui.muted);
  if (typeof proj.ui.mediaVolume === 'number') setters.setMediaVolume(proj.ui.mediaVolume);
  if (typeof proj.ui.outroVolume === 'number') setters.setOutroVolume(proj.ui.outroVolume);
  setters.setCurrentPresetId(typeof proj.ui.presetId === 'string' && proj.ui.presetId.trim() ? proj.ui.presetId : null);
}
