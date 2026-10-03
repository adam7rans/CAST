import React from 'react';
import { FILLER_CATEGORIES } from '../../lib/fillerDetector';
import { SKIP_TYPE_META } from '../../lib/skipTypes';
import { Section, Slider } from '../Controls';
import type { FillerCategoryId } from '../../lib/fillerDetector';

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
  hasTranscript: boolean;
  fillerCutCount: number;
  customCutCount: number;
  showFillerCuts: boolean;
  setShowFillerCuts: React.Dispatch<React.SetStateAction<boolean>>;
  fillerCategories: FillerCategoryId[];
  setFillerCategories: React.Dispatch<React.SetStateAction<FillerCategoryId[]>>;
  onDetectFillers: () => void;
  onClearCustomCuts: () => void;
  customPaddingMs: number;
  setCustomPaddingMs: React.Dispatch<React.SetStateAction<number>>;
}

export const FillerWordsSection: React.FC<Props> = ({
  hasTranscript, fillerCutCount, customCutCount,
  showFillerCuts, setShowFillerCuts,
  fillerCategories, setFillerCategories,
  onDetectFillers, onClearCustomCuts,
  customPaddingMs, setCustomPaddingMs,
}) => {
  const toggle = (id: FillerCategoryId) => {
    const on = fillerCategories.includes(id);
    if (on && fillerCategories.length === 1) return; // keep at least one selected
    setFillerCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  return (
    <Section
      title="Skip filler words"
      colorDot={SKIP_TYPE_META.filler.hex}
      enabled={showFillerCuts}
      onToggle={customCutCount > 0 || hasTranscript ? setShowFillerCuts : undefined}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#777', fontSize: 11 }}>Detect:</span>
        {FILLER_CATEGORIES.map((cat) => {
          const on = fillerCategories.includes(cat.id);
          const isLast = on && fillerCategories.length === 1;
          return (
            <button
              key={cat.id}
              onClick={() => toggle(cat.id)}
              title={isLast ? 'Keep at least one filler type selected' : cat.hint}
              style={{
                background: on ? '#30d15822' : 'transparent',
                border: `1px solid ${on ? '#30d158' : '#3a3a3a'}`,
                color: on ? '#8fe6a8' : '#777',
                borderRadius: 999, padding: '2px 10px', fontSize: 11,
                fontFamily: 'inherit', cursor: isLast ? 'default' : 'pointer',
                opacity: isLast ? 0.6 : 1,
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={onDetectFillers}
          disabled={!hasTranscript || fillerCategories.length === 0}
          style={{ ...primaryButtonStyle, opacity: hasTranscript ? 1 : 0.5, cursor: hasTranscript ? 'pointer' : 'not-allowed' }}
        >
          ✂ Skip filler words
        </button>
        <span style={{ color: '#888', fontSize: 12 }}>
          {fillerCutCount > 0 ? `${fillerCutCount} filler skip${fillerCutCount === 1 ? '' : 's'}` : 'no filler skips yet'}
        </span>
        {customCutCount > 0 && (
          <button onClick={onClearCustomCuts} style={buttonStyle}>
            Clear custom skips
          </button>
        )}
      </div>
      {customCutCount > 0 && (
        <Slider
          label="tighten ms"
          value={customPaddingMs}
          min={0}
          max={500}
          step={10}
          ticks={[50, 100, 200, 300]}
          onChange={(value: number) => setCustomPaddingMs(Math.max(0, Math.round(value)))}
        />
      )}
    </Section>
  );
};
