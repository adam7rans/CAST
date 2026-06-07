import React, { useMemo } from 'react';
import type { CaptionStyle } from '../lib/types';
import type { TranscriptWord } from '../lib/transcript';
import { measureCaptionTextWidth, splitCaptionItemsIntoLines } from '../lib/captionLineBreaks';
import { isWordActive, splitWordParts } from './captions.helpers';

type Props = {
  words: TranscriptWord[];
  currentTimeMs: number;
  captionStyle: CaptionStyle;
  captionScale: number;
  boxWidthPx: number;
  activeColor: string;
  dimColorResolved: string;
};

function measureWordSlice(
  words: readonly TranscriptWord[],
  fontSize: number,
  captionStyle: CaptionStyle,
) {
  return measureCaptionTextWidth(
    words.map((word) => word.text).join(' '),
    {
      fontFamily: captionStyle.fontFamily,
      fontSize,
      fontWeight: captionStyle.fontWeight,
      letterSpacing: captionStyle.letterSpacing,
    },
  );
}

export const CaptionLineText: React.FC<Props> = ({
  words,
  currentTimeMs,
  captionStyle,
  captionScale,
  boxWidthPx,
  activeColor,
  dimColorResolved,
}) => {
  const fontSize = captionStyle.lineFontSize * captionScale;
  const lines = useMemo(
    () => splitCaptionItemsIntoLines(words, boxWidthPx, (slice) => measureWordSlice(slice, fontSize, captionStyle)),
    [words, boxWidthPx, fontSize, captionStyle],
  );

  return (
    <>
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} style={{ whiteSpace: 'nowrap' }}>
          {line.map((word, wordIndex) => {
            const active = isWordActive(word, currentTimeMs);
            const start = word.start ?? 0;
            const end = word.end ?? start;
            const duration = Math.max(end - start, 1);
            const elapsed = active ? Math.min(Math.max(currentTimeMs - start, 0), duration) : 0;
            const remaining = active ? Math.max(end - currentTimeMs, 0) : 0;
            const progress = active ? elapsed / duration : 0;
            const highlighted = active && captionStyle.wordHighlightEnabled;
            const underlineMode = captionStyle.underlineMode ?? (captionStyle.underlineEnabled === false ? 'off' : 'draw');
            const fadeMs = Math.max(0, captionStyle.underlineFadeMs ?? 150);
            const fadeAlpha = active
              ? fadeMs === 0
                ? 1
                : Math.max(0, Math.min(1, Math.min(elapsed, remaining) / fadeMs))
              : 0;
            const drawWidth = underlineMode === 'draw' && active
              ? `${(progress * 100).toFixed(2)}%`
              : underlineMode === 'fade' && active
                ? '100%'
                : '0%';
            const drawOpacity = underlineMode === 'fade' ? fadeAlpha : 1;
            const { lead, body, trail } = splitWordParts(word.text);
            const dimColor = captionStyle.wordHighlightEnabled ? dimColorResolved : activeColor;
            const bodyColor = captionStyle.wordHighlightEnabled
              ? (highlighted ? activeColor : dimColorResolved)
              : activeColor;

            return (
              <React.Fragment key={`${lineIndex}:${wordIndex}:${word.start ?? wordIndex}`}>
                {wordIndex > 0 ? ' ' : null}
                <span style={{ display: 'inline' }}>
                  {lead ? <span style={{ color: dimColor }}>{lead}</span> : null}
                  {body ? (
                    <span
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        color: bodyColor,
                        transition: 'color 200ms ease',
                        paddingBottom: 2,
                      }}
                    >
                      {body}
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: 0,
                          bottom: 0,
                          height: 2,
                          width: drawWidth,
                          background: activeColor,
                          opacity: drawOpacity,
                          transition: underlineMode === 'draw'
                            ? 'width 100ms linear'
                            : `opacity ${fadeMs}ms ease`,
                          pointerEvents: 'none',
                        }}
                      />
                    </span>
                  ) : null}
                  {trail ? <span style={{ color: dimColor }}>{trail}</span> : null}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </>
  );
};
