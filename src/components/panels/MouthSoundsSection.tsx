import React from 'react';
import { MOUTH_SOUND_CLASSES, SKIP_TYPE_META } from '../../lib/skipTypes';
import { Section } from '../Controls';

const buttonStyle: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#ddd',
  border: '1px solid #2a2a2a',
  padding: '6px 10px',
  borderRadius: 3,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#1f6feb22',
  borderColor: '#1f6feb',
  color: '#fff',
};

interface Props {
  mouthCutCount: number;
  hasMedia: boolean;
  showMouthCuts: boolean;
  setShowMouthCuts: React.Dispatch<React.SetStateAction<boolean>>;
  mouthDetectClasses: string[];
  setMouthDetectClasses: React.Dispatch<React.SetStateAction<string[]>>;
  mouthDetecting: boolean;
  mouthDetectError: string | null;
  onDetectMouthSounds: () => void;
  onClearMouthCuts: () => void;
}

export const MouthSoundsSection: React.FC<Props> = ({
  mouthCutCount, hasMedia, showMouthCuts, setShowMouthCuts,
  mouthDetectClasses, setMouthDetectClasses,
  mouthDetecting, mouthDetectError, onDetectMouthSounds, onClearMouthCuts,
}) => (
  <Section
    title="Mouth sounds"
    colorDot={SKIP_TYPE_META.mouth.hex}
    enabled={showMouthCuts}
    onToggle={mouthCutCount > 0 || hasMedia ? setShowMouthCuts : undefined}
  >
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ color: '#777', fontSize: 11 }}>Detect:</span>
      {MOUTH_SOUND_CLASSES.map((cls) => {
        const on = mouthDetectClasses.includes(cls);
        const isLast = on && mouthDetectClasses.length === 1;
        return (
          <button
            key={cls}
            onClick={() => {
              if (mouthDetecting) return;
              if (isLast) return; // keep at least one type selected
              setMouthDetectClasses((prev) =>
                prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls],
              );
            }}
            title={isLast ? 'Keep at least one type selected' : `Include ${cls.toLowerCase()} in detection`}
            style={{
              background: on ? '#ff6e8222' : 'transparent',
              border: `1px solid ${on ? '#ff6e82' : '#3a3a3a'}`,
              color: on ? '#ffb3c0' : '#777',
              borderRadius: 999, padding: '2px 10px', fontSize: 11,
              fontFamily: 'inherit', cursor: mouthDetecting ? 'default' : 'pointer',
              opacity: mouthDetecting && !on ? 0.5 : 1,
            }}
          >
            {cls}
          </button>
        );
      })}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button
        onClick={onDetectMouthSounds}
        disabled={!hasMedia || mouthDetecting}
        style={{ ...primaryButtonStyle, opacity: hasMedia && !mouthDetecting ? 1 : 0.5, cursor: hasMedia && !mouthDetecting ? 'pointer' : 'not-allowed' }}
      >
        {mouthDetecting ? '◌ Analyzing…' : '✂ Detect mouth sounds'}
      </button>
      <span style={{ color: '#888', fontSize: 12 }}>
        {mouthDetecting
          ? 'listening for coughs, sneezes… (a few minutes on long videos)'
          : mouthCutCount > 0
            ? `${mouthCutCount} mouth sound${mouthCutCount === 1 ? '' : 's'}`
            : 'no mouth sounds yet'}
      </span>
      {mouthCutCount > 0 && !mouthDetecting && (
        <button onClick={onClearMouthCuts} style={buttonStyle}>
          Clear mouth sounds
        </button>
      )}
    </div>
    {mouthDetectError && !mouthDetecting && (
      <div style={{ color: '#ff8b84', fontSize: 12 }}>{mouthDetectError}</div>
    )}
  </Section>
);
