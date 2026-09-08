import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateCandidates, parseClipResponse } from '../server/clipFinder/response.js';
import { transcriptUnits } from '../server/clipFinder/transcript.js';

const units = transcriptUnits([{ text: 'Opening.', start: 123, end: 4000 }, { text: 'Complete thought.', start: 4200, end: 21_456 }]);
const clip = { title: ' An important insight ', reason: 'A complete useful thought.', startId: 0, endId: 1, score: 90 };
const envelope = (clips: unknown[]) => ({ status: 'completed', output: [
  { type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ clips }) }] },
] });

test('parses Responses output and normalizes inclusive IDs to exact source seconds', () => {
  const [candidate] = parseClipResponse(envelope([clip]), units);
  assert.equal(candidate.startSecond, 0.123);
  assert.equal(candidate.endSecond, 21.456);
  assert.equal(candidate.title, 'An important insight');
  assert.ok(candidate.id);
  assert.deepEqual(parseClipResponse(envelope([]), units), []);
});

test('rejects incomplete, refused, malformed, and ambiguous provider envelopes', () => {
  for (const response of [null, { ...envelope([]), status: 'incomplete' },
    { status: 'completed', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] },
    { status: 'completed', output: [...envelope([]).output, ...envelope([]).output] }]) {
    assert.throws(() => parseClipResponse(response, units));
  }
});

test('rejects invalid shape, invented IDs, backwards ranges and non-finite scores', () => {
  for (const invalid of [null, { ...clip, title: '' }, { ...clip, title: 'x'.repeat(121) },
    { ...clip, startId: 10 }, { ...clip, endId: -1 }, { ...clip, startId: 1, endId: 0 },
    { ...clip, startId: 0.5 }, { ...clip, score: Infinity }, { ...clip, score: 101 },
    { ...clip, reason: ' ' }, { ...clip, extra: 'unexpected' }]) {
    assert.throws(() => parseClipResponse(envelope([invalid]), units));
  }
});

test('deduplicates overlap by source range, keeping stronger candidates without dropping distinct excerpts', () => {
  const [base] = parseClipResponse(envelope([clip]), units);
  const candidates = [base, { ...base, id: 'overlap', startSecond: 1, score: 99 },
    { ...base, id: 'distinct', startSecond: 25, endSecond: 45, score: 95 }];
  assert.deepEqual(deduplicateCandidates(candidates).map((candidate) => candidate.id), ['overlap', 'distinct']);
  assert.equal(candidates[0], base);
});
