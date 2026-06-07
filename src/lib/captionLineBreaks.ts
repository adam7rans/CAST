type MeasureFont = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  letterSpacing?: number;
};

const LINE_BALANCE_WEIGHT = 24;
const TWO_WORD_ORPHAN_PENALTY = 40;
const ONE_WORD_ORPHAN_PENALTY = 400;

let browserMeasureCtx: CanvasRenderingContext2D | null = null;

function getBrowserMeasureContext(): CanvasRenderingContext2D | null {
  if (browserMeasureCtx) return browserMeasureCtx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  browserMeasureCtx = canvas.getContext('2d');
  return browserMeasureCtx;
}

export function measureCaptionTextWidth(text: string, font: MeasureFont): number {
  const ctx = getBrowserMeasureContext();
  const fallbackWidth = text.length * font.fontSize * 0.6;
  if (!ctx) return fallbackWidth;
  ctx.font = `${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`;
  const baseWidth = ctx.measureText(text).width;
  const trackingPx = (font.letterSpacing ?? 0) * font.fontSize;
  const extraTracking = text.length > 1 ? (text.length - 1) * trackingPx : 0;
  return baseWidth + extraTracking || fallbackWidth;
}

function splitByBreakpoints<T>(items: readonly T[], breakpoints: number[]): T[][] {
  const lines: T[][] = [];
  let start = 0;
  for (const end of breakpoints) {
    lines.push(items.slice(start, end));
    start = end;
  }
  return lines.filter((line) => line.length > 0);
}

export function splitCaptionItemsIntoLines<T>(
  items: readonly T[],
  maxWidth: number,
  measureSlice: (slice: readonly T[]) => number,
): T[][] {
  if (items.length <= 1 || maxWidth <= 0) return items.length ? [items.slice()] : [];
  if (measureSlice(items) <= maxWidth) return [items.slice()];

  const segmentWidthCache = new Map<string, number>();
  const getSegmentWidth = (start: number, end: number) => {
    const key = `${start}:${end}`;
    const cached = segmentWidthCache.get(key);
    if (cached !== undefined) return cached;
    const width = measureSlice(items.slice(start, end));
    segmentWidthCache.set(key, width);
    return width;
  };

  for (let lineCount = 2; lineCount <= items.length; lineCount++) {
    const targetWordsPerLine = items.length / lineCount;
    const scores = Array.from({ length: lineCount + 1 }, () => Array(items.length + 1).fill(Number.POSITIVE_INFINITY));
    const previous = Array.from({ length: lineCount + 1 }, () => Array(items.length + 1).fill(-1));
    scores[0][0] = 0;

    for (let lineIndex = 1; lineIndex <= lineCount; lineIndex++) {
      for (let end = lineIndex; end <= items.length; end++) {
        for (let start = end - 1; start >= lineIndex - 1; start--) {
          const width = getSegmentWidth(start, end);
          if (width > maxWidth) break;
          const priorScore = scores[lineIndex - 1][start];
          if (!Number.isFinite(priorScore)) continue;
          const wordCount = end - start;
          const balancePenalty = Math.pow(wordCount - targetWordsPerLine, 2) * LINE_BALANCE_WEIGHT;
          const orphanPenalty = items.length > 4
            ? wordCount === 1
              ? ONE_WORD_ORPHAN_PENALTY
              : wordCount === 2
                ? TWO_WORD_ORPHAN_PENALTY
                : 0
            : 0;
          const fillPenalty = Math.pow(1 - width / maxWidth, 2);
          const score = priorScore + balancePenalty + orphanPenalty + fillPenalty;
          if (score < scores[lineIndex][end]) {
            scores[lineIndex][end] = score;
            previous[lineIndex][end] = start;
          }
        }
      }
    }

    if (!Number.isFinite(scores[lineCount][items.length])) continue;

    const breakpoints: number[] = [];
    let cursor = items.length;
    for (let lineIndex = lineCount; lineIndex > 0; lineIndex--) {
      breakpoints.unshift(cursor);
      cursor = previous[lineIndex][cursor];
    }
    return splitByBreakpoints(items, breakpoints);
  }

  return [items.slice()];
}
