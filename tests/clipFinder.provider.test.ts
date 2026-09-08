import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerConfig, requestClips } from '../server/clipFinder/provider.js';
import { discoverClips } from '../server/clipFinder/discover.js';
import { publicClipError } from '../server/clipFinder/errors.js';
import { transcriptUnits, chunkTranscript } from '../server/clipFinder/transcript.js';

const units = transcriptUnits([{ text: 'Private source text.', start: 10, end: 30_000 }]);
const config = { apiKey: 'test-key-not-real', model: 'test-model' };
const response = { status: 'completed', output: [{ type: 'message', content: [
  { type: 'output_text', text: JSON.stringify({ clips: [] }) },
] }] };

test('server config requires a key, defaults to gpt-5.4-mini and permits a model override', () => {
  const before = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL };
  try {
    delete process.env.OPENAI_API_KEY;
    assert.throws(providerConfig, /Set OPENAI_API_KEY/);
    process.env.OPENAI_API_KEY = 'fake-key';
    delete process.env.OPENAI_MODEL;
    assert.equal(providerConfig().model, 'gpt-5.4-mini');
    process.env.OPENAI_MODEL = 'override-model';
    assert.equal(providerConfig().model, 'override-model');
  } finally {
    if (before.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before.key;
    if (before.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = before.model;
  }
});

test('uses server-only Responses endpoint, strict schema, store:false and exact timed content', async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.model, config.model);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.deepEqual(JSON.parse(body.input), units);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key-not-real');
    return Response.json(response);
  };
  assert.deepEqual(await requestClips(units, config, new AbortController().signal, mockFetch), []);
});

test('provider errors and network exceptions never echo keys or transcript content', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(requestClips(units, config, new AbortController().signal,
      async () => new Response('test-key-not-real Private source text.', { status })), (error: Error) => {
      assert.doesNotMatch(error.message, /test-key-not-real|Private source text/);
      return true;
    });
  }
  assert.doesNotMatch(publicClipError(new Error('test-key-not-real Private source text.')).message, /Private|test-key/);
});

test('full chunk discovery bounds concurrency, processes final section, and reports real progress', async () => {
  const chunks = chunkTranscript(transcriptUnits(Array.from({ length: 30 }, (_, index) => ({
    text: `Section ${index}`, start: index * 1000, end: index * 1000 + 900,
  }))), 250);
  const seen = new Set<number>();
  let active = 0;
  let peak = 0;
  const progress: number[] = [];
  const mockRequest: typeof requestClips = async (chunk) => {
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    chunk.forEach((unit) => seen.add(unit.id));
    active--;
    return [];
  };
  await discoverClips(chunks, config, new AbortController().signal, (event) => {
    if (event.type === 'progress') progress.push(event.completed);
  }, mockRequest);
  assert.equal(seen.size, 30);
  assert.equal(peak, 2);
  assert.deepEqual(progress, Array.from({ length: chunks.length + 1 }, (_, index) => index));
});

test('one failed section fails the whole search; cancelled work is not published', async () => {
  await assert.rejects(discoverClips([units, units], config, new AbortController().signal, () => {},
    async () => { throw new Error('provider failed'); }), /provider failed/);
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(discoverClips([units], config, controller.signal, () => {}, async () => { called = true; return []; }));
  assert.equal(called, false);
});
