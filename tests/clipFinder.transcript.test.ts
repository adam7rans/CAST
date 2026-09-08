import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcriptUnits, chunkTranscript } from '../server/clipFinder/transcript.js';

const word = (index: number) => ({ text: `word${index}`, start: index * 500, end: index * 500 + 400 });

test('uses exact word timings and sorts source units chronologically', () => {
  const units = transcriptUnits({ utterances: [
    { ...word(3), speaker: 'B' },
    { text: 'word0 word1', start: 0, end: 1000, speaker: 'A', words: [word(0), word(1)] },
  ] });
  assert.deepEqual(units.map(({ id, start, end }) => ({ id, start, end })), [
    { id: 0, start: 0, end: 400 }, { id: 1, start: 500, end: 900 }, { id: 2, start: 1500, end: 1900 },
  ]);
  assert.equal(units[0].speaker, 'A');
});

test('keeps complete utterance text when words are missing or incomplete', () => {
  const units = transcriptUnits([{ text: 'The entire thought.', start: 0, end: 7000, words: [word(1)] }]);
  assert.equal(units[0].text, 'The entire thought.');
  assert.equal(units[0].end, 7000);
  assert.equal(transcriptUnits([{ words: [word(0), word(1)] }]).length, 2);
});

test('rejects untimed and corrupt sections instead of silently omitting them', () => {
  for (const raw of [null, [], { text: 'Untimed only' }, [word(1), { text: 'Missing timing' }],
    [{ text: 'Bad', start: -1, end: 1000 }], [{ text: 'Bad', start: 0, end: Infinity }]]) {
    assert.throws(() => transcriptUnits(raw));
  }
});

test('bounded overlapping chunks cover every unit, including the last section and multibyte text', () => {
  const units = transcriptUnits(Array.from({ length: 600 }, (_, index) => ({ ...word(index), text: '你好 🎤 complete thought' })));
  const chunks = chunkTranscript(units, 1800);
  assert.ok(chunks.length > 1);
  assert.equal(new Set(chunks.flat().map((unit) => unit.id)).size, units.length);
  assert.ok(chunks.every((chunk) => Buffer.byteLength(JSON.stringify(chunk)) <= 1800));
  assert.equal(chunks.at(-1)?.at(-1)?.id, 599);
  assert.ok(chunks[0].some((unit) => chunks[1].includes(unit)));
});

test('rejects oversized single sections without truncating text', () => {
  assert.throws(() => chunkTranscript(transcriptUnits([{ ...word(0), text: 'x'.repeat(1000) }]), 100), /section exceeds/);
});

test('a near-limit next section cannot trap overlapping chunk construction', () => {
  const units = transcriptUnits([word(0), word(1), { ...word(2), text: 'x'.repeat(250) }, word(3)]);
  const chunks = chunkTranscript(units, 320);
  assert.equal(new Set(chunks.flat().map((unit) => unit.id)).size, 4);
  assert.ok(chunks.every((chunk) => Buffer.byteLength(JSON.stringify(chunk)) <= 320));
});
