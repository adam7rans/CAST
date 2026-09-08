import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendClipCandidates, candidateError, type ClipCandidate } from '../src/lib/clipCandidates.js';
import { MICRO_TIMELINE_COLORS } from '../src/lib/types.defaults.js';
import { discoverProjectClips } from '../src/lib/projectApi.clips.js';

const candidate: ClipCandidate = { id: 'candidate', title: ' New clip ', startSecond: 12.1, endSecond: 35.7, reason: 'Complete thought', score: 90 };

test('maps candidates to editable MicroTimelines and appends without mutating existing clips', () => {
  const existing = [{ id: 'manual', name: 'Keep me', startSecond: 0, endSecond: 10, color: '#ff0000' }];
  const result = appendClipCandidates(existing, [candidate], 60);
  assert.equal(result[0], existing[0]);
  assert.equal(existing.length, 1);
  assert.deepEqual(result[1], { id: 'candidate', name: 'New clip', startSecond: 12.1, endSecond: 35.7, color: MICRO_TIMELINE_COLORS[1] });
});

test('rejects empty, non-finite, reversed, too short and out-of-bounds candidate edits atomically', () => {
  for (const invalid of [{ ...candidate, title: ' ' }, { ...candidate, startSecond: NaN },
    { ...candidate, endSecond: Infinity }, { ...candidate, startSecond: -1 },
    { ...candidate, endSecond: 12.1 }, { ...candidate, endSecond: 12.15 }, { ...candidate, endSecond: 61 }]) {
    assert.ok(candidateError(invalid, 60));
    assert.throws(() => appendClipCandidates([], [candidate, invalid], 60));
  }
  assert.equal(candidateError({ ...candidate, endSecond: 60 }, 60), null);
  assert.equal(candidateError({ ...candidate, startSecond: 12.1, endSecond: 12.2 }, 60), null);
});

test('stream parser supports split UTF-8 records and rejects a truncated discovery', async () => {
  const original = globalThis.fetch;
  const transcript = { utterances: [{ text: 'Complete thought.', start: 0, end: 60_000 }] };
  const events: string[] = [];
  const encoded = new TextEncoder().encode(`${JSON.stringify({ type: 'complete', candidates: [{ ...candidate, title: '你好' }], total: 1 })}\n`);
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
      for (let index = 0; index < encoded.length; index += 2) controller.enqueue(encoded.slice(index, index + 2));
      controller.close();
    } }));
    await discoverProjectClips('project', transcript, new AbortController().signal, (event) => events.push(event.type));
    assert.deepEqual(events, ['complete']);
    globalThis.fetch = async () => new Response('{"type":"progress","completed":0,"total":2}\n');
    await assert.rejects(discoverProjectClips('project', transcript, new AbortController().signal, () => {}), /interrupted/);
  } finally { globalThis.fetch = original; }
});
