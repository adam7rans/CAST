export type SearchMatch = {
  startIndex: number;
  endIndex: number;
  startMs: number | null;
  endMs: number | null;
};

function isEscapedQuote(text: string, index: number) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function findQuotedStringBounds(text: string, matchIndex: number, matchLength: number) {
  let startQuote = -1;
  for (let i = matchIndex; i >= 0; i -= 1) {
    if (text[i] === '"' && !isEscapedQuote(text, i)) {
      startQuote = i;
      break;
    }
  }
  if (startQuote < 0) return null;

  let endQuote = -1;
  for (let i = matchIndex + matchLength; i < text.length; i += 1) {
    if (text[i] === '"' && !isEscapedQuote(text, i)) {
      endQuote = i;
      break;
    }
  }
  if (endQuote < 0) return null;

  return { startQuote, endQuote };
}

function findTimestampedWordMatch(
  text: string,
  matchIndex: number,
  matchLength: number,
) {
  const bounds = findQuotedStringBounds(text, matchIndex, matchLength);
  if (!bounds) return null;

  const before = text.slice(Math.max(0, bounds.startQuote - 40), bounds.startQuote);
  if (!/"text"\s*:\s*$/.test(before)) return null;

  const after = text.slice(bounds.endQuote + 1, bounds.endQuote + 120);
  const timestampMatch = /^\s*,\s*"start"\s*:\s*(\d+)\s*,\s*"end"\s*:\s*(\d+)/.exec(after);
  if (!timestampMatch) return null;

  return {
    startMs: Number(timestampMatch[1]),
    endMs: Number(timestampMatch[2]),
  };
}

export function collectSearchMatches(text: string, searchTerm: string): SearchMatch[] {
  if (!searchTerm) return [];

  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  const matches: SearchMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const timing = findTimestampedWordMatch(text, match.index, match[0].length);
    matches.push({
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      startMs: timing?.startMs ?? null,
      endMs: timing?.endMs ?? null,
    });
    if (match[0].length === 0) regex.lastIndex += 1;
  }

  return matches;
}
