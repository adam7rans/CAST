import React from 'react';

/* Inline single-color SVG icons (20×20 viewbox, 1.6 stroke, currentColor).
   Ported from the Direction-D handoff `cast-kit.jsx` Icon set — no emoji. */

export type IconName =
  | 'play' | 'pause' | 'skipPrev' | 'skipNext'
  | 'vol' | 'mute'
  | 'eye' | 'eyeOff'
  | 'chev' | 'chevR' | 'plus'
  | 'crop' | 'layers' | 'sliders' | 'film' | 'type' | 'music' | 'wand'
  | 'scissors' | 'download' | 'search' | 'reset' | 'grip'
  | 'zoomIn' | 'zoomOut' | 'target' | 'info' | 'folder' | 'dot'
  | 'follow' | 'check' | 'close';

export const Icon: React.FC<{
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}> = ({ name, size = 14, color = 'currentColor', strokeWidth = 1.6, style }) => {
  const p = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const f = { fill: color, stroke: 'none' };
  const paths: Record<IconName, React.ReactNode> = {
    play: <path d="M5 3.5v13l11-6.5z" {...f} />,
    pause: <g {...f}><rect x="4.5" y="3.5" width="4" height="13" rx="1" /><rect x="11.5" y="3.5" width="4" height="13" rx="1" /></g>,
    skipPrev: <g {...f}><rect x="4" y="4" width="2.4" height="12" rx="1" /><path d="M16 4.5v11l-8.5-5.5z" /></g>,
    skipNext: <g {...f}><rect x="13.6" y="4" width="2.4" height="12" rx="1" /><path d="M4 4.5v11l8.5-5.5z" /></g>,
    vol: <g {...p}><path d="M4 7.5v5h3l4 3.5V4L7 7.5z" /><path d="M13.5 7.5a3.5 3.5 0 0 1 0 5" /></g>,
    mute: <g {...p}><path d="M4 7.5v5h3l4 3.5V4L7 7.5z" /><path d="M14 8l4 4M18 8l-4 4" /></g>,
    eye: <g {...p}><path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10z" /><circle cx="10" cy="10" r="2.4" /></g>,
    eyeOff: <g {...p}><path d="M3 3l14 14" /><path d="M7.5 5.2A8.6 8.6 0 0 1 10 4.5c4.5 0 7.5 5.5 7.5 5.5a14 14 0 0 1-2.4 2.9M5 6.4A14 14 0 0 0 2.5 10S5.5 15.5 10 15.5a8 8 0 0 0 2.4-.4" /></g>,
    chev: <path d="M5 7.5l5 5 5-5" {...p} />,
    chevR: <path d="M7.5 5l5 5-5 5" {...p} />,
    plus: <g {...p}><path d="M10 4.5v11M4.5 10h11" /></g>,
    crop: <g {...p}><path d="M5.5 2v12.5H18M2 5.5h12.5V18" /></g>,
    layers: <g {...p}><path d="M10 3l7 4-7 4-7-4 7-4z" /><path d="M3 11l7 4 7-4" /></g>,
    sliders: <g {...p}><path d="M4 6h7M14 6h2M4 14h2M9 14h7" /><circle cx="12.5" cy="6" r="1.6" {...f} /><circle cx="7.5" cy="14" r="1.6" {...f} /></g>,
    film: <g {...p}><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M7 4v12M13 4v12M3 8h4m6 0h4M3 12h4m6 0h4" /></g>,
    type: <g {...p}><path d="M4 6V4.5h12V6M10 4.5v11M8 15.5h4" /></g>,
    music: <g {...p}><path d="M7 15V5l8-1.5V13" /><circle cx="5" cy="15" r="2" /><circle cx="13" cy="13" r="2" /></g>,
    wand: <g {...p}><path d="M4 16l8-8M13 3.5l.6 1.6 1.6.6-1.6.6L13 8l-.6-1.6L10.8 5.8l1.6-.6z" /></g>,
    scissors: <g {...p}><circle cx="5.5" cy="5.5" r="2" /><circle cx="5.5" cy="14.5" r="2" /><path d="M7 7l9 7M7 13l9-7" /></g>,
    download: <g {...p}><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M3.5 15.5h13" /></g>,
    search: <g {...p}><circle cx="8.5" cy="8.5" r="4.5" /><path d="M12 12l4 4" /></g>,
    reset: <g {...p}><path d="M4 10a6 6 0 1 1 1.8 4.3M4 14v-3.5h3.5" /></g>,
    grip: <g {...f}><circle cx="7" cy="5" r="1.1" /><circle cx="13" cy="5" r="1.1" /><circle cx="7" cy="10" r="1.1" /><circle cx="13" cy="10" r="1.1" /><circle cx="7" cy="15" r="1.1" /><circle cx="13" cy="15" r="1.1" /></g>,
    zoomIn: <g {...p}><circle cx="8.5" cy="8.5" r="4.5" /><path d="M12 12l4 4M8.5 6.5v4M6.5 8.5h4" /></g>,
    zoomOut: <g {...p}><circle cx="8.5" cy="8.5" r="4.5" /><path d="M12 12l4 4M6.5 8.5h4" /></g>,
    target: <g {...p}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2" /></g>,
    info: <g {...p}><circle cx="10" cy="10" r="7" /><path d="M10 9v4.5M10 6.6v.1" /></g>,
    folder: <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" {...p} />,
    dot: <circle cx="10" cy="10" r="4" {...f} />,
    follow: <g {...f}><path d="M6 4.5v11l9-5.5z" /></g>,
    check: <path d="M4 10.5l4 4 8-9" {...p} />,
    close: <path d="M5 5l10 10M15 5L5 15" {...p} />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: 'block', flexShrink: 0, ...style }}>
      {paths[name]}
    </svg>
  );
};
