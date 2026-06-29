import { useMemo } from 'react';
import type React from 'react';
import { DEFAULT_AUDIO_REACTIVITY, DEFAULT_BACKGROUND, DEFAULT_CAPTION_SHADER, DEFAULT_CAPTION_STYLE, DEFAULT_DITHER, DEFAULT_VIDEO, normalizeVideoShaderParams } from '../../lib/types';
import { DEFAULT_LIMITER } from '../../lib/AudioSource';
import { DEFAULT_MUSIC_PARAMS } from '../../lib/MusicPlayer';
import { seedGuideMap } from '../../lib/constants';
import { extractPresetSettings } from '../../lib/presetSettings';

interface Args {
  state: {
    bg: typeof DEFAULT_BACKGROUND;
    bgDither: typeof DEFAULT_DITHER;
    vid: typeof DEFAULT_VIDEO;
    audioReactivity: typeof DEFAULT_AUDIO_REACTIVITY;
    music: typeof DEFAULT_MUSIC_PARAMS;
    limiter: typeof DEFAULT_LIMITER;
    captionMode: string;
    captionStyle: typeof DEFAULT_CAPTION_STYLE;
    captionShader: typeof DEFAULT_CAPTION_SHADER;
    captionStyleByGuide: Record<string, typeof DEFAULT_CAPTION_STYLE>;
    captionShaderByGuide: Record<string, typeof DEFAULT_CAPTION_SHADER>;
    bgLayerOn: boolean;
    videoLayerOn: boolean;
    captionsLayerOn: boolean;
    musicLayerOn: boolean;
    bgOffMode: 'grid' | 'color';
    bgOffColor: string;
    activeGuide: string | null;
    cropToGuide: boolean;
  };
  setters: {
    setBg: React.Dispatch<React.SetStateAction<typeof DEFAULT_BACKGROUND>>;
    setBgDither: React.Dispatch<React.SetStateAction<typeof DEFAULT_DITHER>>;
    setVid: React.Dispatch<React.SetStateAction<typeof DEFAULT_VIDEO>>;
    setAudioReactivity: React.Dispatch<React.SetStateAction<typeof DEFAULT_AUDIO_REACTIVITY>>;
    setMusic: React.Dispatch<React.SetStateAction<typeof DEFAULT_MUSIC_PARAMS>>;
    setLimiter: React.Dispatch<React.SetStateAction<typeof DEFAULT_LIMITER>>;
    setCaptionMode: React.Dispatch<React.SetStateAction<any>>;
    setCaptionStyle: React.Dispatch<React.SetStateAction<typeof DEFAULT_CAPTION_STYLE>>;
    setCaptionShader: React.Dispatch<React.SetStateAction<typeof DEFAULT_CAPTION_SHADER>>;
    setCaptionStyleByGuide: React.Dispatch<React.SetStateAction<Record<string, typeof DEFAULT_CAPTION_STYLE>>>;
    setCaptionShaderByGuide: React.Dispatch<React.SetStateAction<Record<string, typeof DEFAULT_CAPTION_SHADER>>>;
    setBgLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
    setVideoLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
    setCaptionsLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
    setMusicLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
    setBgOffMode: React.Dispatch<React.SetStateAction<'grid' | 'color'>>;
    setBgOffColor: React.Dispatch<React.SetStateAction<string>>;
    setActiveGuide: React.Dispatch<React.SetStateAction<any>>;
    setCropToGuide: React.Dispatch<React.SetStateAction<boolean>>;
  };
}

export function usePresetSettings({ state, setters }: Args) {
  const currentPresetSettings = useMemo(
    () => extractPresetSettings({
      background: state.bg,
      backgroundDither: state.bgDither,
      video: state.vid,
      audioReactivity: state.audioReactivity,
      music: state.music,
      limiter: state.limiter,
      captionMode: state.captionMode,
      captionStyle: state.captionStyle,
      captionShader: state.captionShader,
      captionStyleByGuide: state.captionStyleByGuide,
      captionShaderByGuide: state.captionShaderByGuide,
      layers: {
        background: state.bgLayerOn,
        video: state.videoLayerOn,
        captions: state.captionsLayerOn,
        music: state.musicLayerOn,
        bgOffMode: state.bgOffMode,
        bgOffColor: state.bgOffColor,
      },
      activeGuide: state.activeGuide,
      cropToGuide: state.cropToGuide,
    }),
    [state],
  );

  const applyPresetSettings = (data: Record<string, any>) => {
    if (data.background) setters.setBg(data.background);
    if (data.backgroundDither) setters.setBgDither(data.backgroundDither);
    if (data.video) setters.setVid(normalizeVideoShaderParams(data.video));
    if (data.audioReactivity) setters.setAudioReactivity({ ...DEFAULT_AUDIO_REACTIVITY, ...data.audioReactivity });
    if (data.captionMode) setters.setCaptionMode(data.captionMode);
    // Per-guide caption settings: prefer the maps; otherwise seed every guide
    // slot from a legacy flat value so old presets/projects still apply.
    if (data.captionStyleByGuide && typeof data.captionStyleByGuide === 'object') {
      const m: Record<string, typeof DEFAULT_CAPTION_STYLE> = {};
      for (const [k, v] of Object.entries(data.captionStyleByGuide as Record<string, any>)) {
        if (v && typeof v === 'object') m[k] = { ...DEFAULT_CAPTION_STYLE, ...v };
      }
      setters.setCaptionStyleByGuide(m);
    } else if (data.captionStyle) {
      setters.setCaptionStyleByGuide(seedGuideMap({ ...DEFAULT_CAPTION_STYLE, ...data.captionStyle }));
    }
    if (data.captionShaderByGuide && typeof data.captionShaderByGuide === 'object') {
      const m: Record<string, typeof DEFAULT_CAPTION_SHADER> = {};
      for (const [k, v] of Object.entries(data.captionShaderByGuide as Record<string, any>)) {
        if (v && typeof v === 'object') m[k] = { ...DEFAULT_CAPTION_SHADER, ...v };
      }
      setters.setCaptionShaderByGuide(m);
    } else if (data.captionShader) {
      setters.setCaptionShaderByGuide(seedGuideMap({ ...DEFAULT_CAPTION_SHADER, ...data.captionShader }));
    }
    if (data.limiter) setters.setLimiter({ ...DEFAULT_LIMITER, ...data.limiter });
    if (data.music) {
      setters.setMusic({
        ...DEFAULT_MUSIC_PARAMS,
        ...data.music,
        sidechain: { ...DEFAULT_MUSIC_PARAMS.sidechain, ...(data.music.sidechain ?? {}) },
      });
    }
    if (data.layers) {
      if (typeof data.layers.background === 'boolean') setters.setBgLayerOn(data.layers.background);
      if (typeof data.layers.video === 'boolean') setters.setVideoLayerOn(data.layers.video);
      if (typeof data.layers.captions === 'boolean') setters.setCaptionsLayerOn(data.layers.captions);
      if (typeof data.layers.music === 'boolean') setters.setMusicLayerOn(data.layers.music);
      if (data.layers.bgOffMode === 'grid' || data.layers.bgOffMode === 'color') setters.setBgOffMode(data.layers.bgOffMode);
      if (typeof data.layers.bgOffColor === 'string') setters.setBgOffColor(data.layers.bgOffColor);
    }
    if (data.activeGuide === null || typeof data.activeGuide === 'string') setters.setActiveGuide(data.activeGuide);
    if (typeof data.cropToGuide === 'boolean') setters.setCropToGuide(data.cropToGuide);
  };

  return { currentPresetSettings, applyPresetSettings };
}
