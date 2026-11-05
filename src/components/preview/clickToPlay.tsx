import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';

/**
 * YouTube-style click-to-play on the preview: a quick click on the picture
 * toggles play/pause and briefly flashes the matching icon. Only clicks that
 * land on the picture itself count (a canvas, or an element marked
 * `data-preview-surface`), so drag handles, guides, toasts and buttons keep
 * their own behaviour, and a drag never toggles.
 */
const MAX_MOVE_PX = 5;
const MAX_PRESS_MS = 500;
const FLASH_MS = 550;

function isPictureTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'CANVAS' || target.dataset.previewSurface !== undefined;
}

export function useClickToPlay(enabled: boolean, playing: boolean, onToggle: () => void) {
  const press = useRef<{ x: number; y: number; at: number } | null>(null);
  const [flash, setFlash] = useState<{ key: number; icon: 'play' | 'pause' } | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    press.current = enabled && e.button === 0 && isPictureTarget(e.target)
      ? { x: e.clientX, y: e.clientY, at: performance.now() }
      : null;
  }, [enabled]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const start = press.current;
    press.current = null;
    if (!start || !enabled || !isPictureTarget(e.target)) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > MAX_MOVE_PX || performance.now() - start.at > MAX_PRESS_MS) return;
    // The icon shows what the click did: starting playback flashes "play".
    setFlash({ key: Date.now(), icon: playing ? 'pause' : 'play' });
    onToggle();
  }, [enabled, playing, onToggle]);

  return { handlers: { onPointerDown, onPointerUp }, flash };
}

export const PlayPauseFlash: React.FC<{ flash: { key: number; icon: 'play' | 'pause' } | null }> = ({ flash }) => {
  if (!flash) return null;
  return (
    <div
      key={flash.key}
      aria-hidden
      style={{
        position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32,
        borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'grid', placeItems: 'center',
        pointerEvents: 'none', zIndex: 150, animation: `cast-play-flash ${FLASH_MS}ms ease-out forwards`,
      }}
    >
      <style>{'@keyframes cast-play-flash { from { opacity: 1; transform: scale(0.85); } to { opacity: 0; transform: scale(1.25); } }'}</style>
      <Icon name={flash.icon} size={26} />
    </div>
  );
};
