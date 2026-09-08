import { randomUUID } from 'node:crypto';
import type { ClipCandidate } from '../../src/lib/clipCandidates.js';
import type { TimedUnit } from './transcript.js';
import { ClipFinderError } from './errors.js';

export const clipSchema = {
  type: 'object', additionalProperties: false, required: ['clips'],
  properties: {
    clips: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'startId', 'endId', 'reason', 'score'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          startId: { type: 'integer', minimum: 0 },
          endId: { type: 'integer', minimum: 0 },
          reason: { type: 'string', minLength: 1, maxLength: 600 },
          score: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  },
};

function invalidResponse(): never {
  throw new ClipFinderError('invalid_response',
    'OpenAI returned an invalid clip response or source range. No candidates were saved. Try again.', 502);
}

export function parseClipResponse(raw: unknown, units: TimedUnit[]): ClipCandidate[] {
  const response = raw as any;
  if (response?.status !== 'completed' || !Array.isArray(response.output)) invalidResponse();
  const messages = response.output.filter((item: any) => item?.type === 'message');
  if (!messages.length || messages.some((item: any) => !Array.isArray(item.content))) invalidResponse();
  const content = messages.flatMap((item: any) => item.content);
  if (content.some((item: any) => item?.type === 'refusal')) {
    throw new ClipFinderError('provider_refusal', 'OpenAI declined to analyze this transcript. No clips were changed.', 502);
  }
  const text = content.filter((item: any) => item?.type === 'output_text');
  if (text.length !== 1 || typeof text[0].text !== 'string') invalidResponse();
  let parsed: any;
  try { parsed = JSON.parse(text[0].text); } catch { invalidResponse(); }
  if (!parsed || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.clips) || parsed.clips.length > 8) {
    invalidResponse();
  }
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return parsed.clips.map((clip: any) => {
    if (!clip || Object.keys(clip).sort().join(',') !== 'endId,reason,score,startId,title'
      || typeof clip.title !== 'string' || !clip.title.trim() || clip.title.length > 120
      || typeof clip.reason !== 'string' || !clip.reason.trim() || clip.reason.length > 600
      || !Number.isInteger(clip.score) || clip.score < 1 || clip.score > 100
      || !Number.isInteger(clip.startId) || !Number.isInteger(clip.endId) || clip.startId > clip.endId) {
      invalidResponse();
    }
    const start = byId.get(clip.startId);
    const end = byId.get(clip.endId);
    if (!start || !end || end.end - start.start < 100) invalidResponse();
    return { id: randomUUID(), title: clip.title.trim(), reason: clip.reason.trim(), score: clip.score,
      startSecond: start.start / 1000, endSecond: end.end / 1000 };
  });
}

export function deduplicateCandidates(candidates: ClipCandidate[]): ClipCandidate[] {
  const sorted = [...candidates].sort((left, right) => right.score - left.score || left.startSecond - right.startSecond);
  const unique: ClipCandidate[] = [];
  for (const candidate of sorted) {
    const duplicate = unique.some((existing) => {
      const overlap = Math.min(existing.endSecond, candidate.endSecond) - Math.max(existing.startSecond, candidate.startSecond);
      const shorter = Math.min(existing.endSecond - existing.startSecond, candidate.endSecond - candidate.startSecond);
      return overlap / shorter >= 0.8;
    });
    if (!duplicate) unique.push(candidate);
  }
  return unique;
}
