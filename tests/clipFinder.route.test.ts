import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = mkdtempSync(path.join(tmpdir(), 'cast-clips-route-'));
process.env.CAST_DATA_DIR = directory;
process.env.CAST_PRESETS_DIR = path.join(directory, 'presets');
const { clipFinderRoutes } = await import('../server/routes/clipFinder.js');
const app = express();
app.use(express.json());
app.use('/api/projects', clipFinderRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address() as { port: number };
const endpoint = `http://127.0.0.1:${address.port}/api/projects/fixture/clip-candidates`;
const nativeFetch = globalThis.fetch;
const projectDirectory = path.join(directory, 'fixture');
mkdirSync(projectDirectory);
writeFileSync(path.join(projectDirectory, 'project.json'), JSON.stringify({ id: 'fixture', name: 'Fixture' }));
writeFileSync(path.join(projectDirectory, 'transcript.json'), JSON.stringify({ utterances: [
  { text: 'Full saved transcript.', start: 500, end: 20_000 },
] }));
const settings = JSON.stringify({ microTimelines: [{ id: 'manual', name: 'Keep existing' }] });
writeFileSync(path.join(projectDirectory, 'settings.json'), settings);

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
});

const providerResponse = (startId: number, endId: number) => Response.json({ status: 'completed', output: [
  { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ clips: [
    { title: 'Candidate', reason: 'Complete thought', startId, endId, score: 90 },
  ] }) }] },
] });

test('missing server key and unknown projects return actionable errors before streaming', async () => {
  delete process.env.OPENAI_API_KEY;
  const response = await nativeFetch(endpoint, { method: 'POST' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'missing_key');
  const missing = await nativeFetch(endpoint.replace('/fixture/', '/absent/'), { method: 'POST' });
  assert.equal(missing.status, 404);
});

test('rejects cross-origin discovery before any paid provider work', async () => {
  const response = await nativeFetch(endpoint, { method: 'POST', headers: { Origin: 'https://untrusted.example' } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'forbidden_origin');
});

test('streams progress and review-only candidates from the saved full transcript without saving clips', async () => {
  process.env.OPENAI_API_KEY = 'fake-test-key';
  globalThis.fetch = async (_url, init) => {
    const units = JSON.parse(JSON.parse(String(init?.body)).input);
    assert.equal(units[0].text, 'Full saved transcript.');
    return providerResponse(units[0].id, units.at(-1).id);
  };
  const response = await nativeFetch(endpoint, { method: 'POST' });
  assert.match(response.headers.get('content-type') ?? '', /application\/x-ndjson/);
  const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(events.map((event) => event.type), ['progress', 'progress', 'complete']);
  assert.equal(events[2].candidates[0].startSecond, 0.5);
  assert.equal(readFileSync(path.join(projectDirectory, 'settings.json'), 'utf8'), settings);
});

test('uses the current loaded snapshot instead of a stale saved transcript', async () => {
  globalThis.fetch = async (_url, init) => {
    const units = JSON.parse(JSON.parse(String(init?.body)).input);
    assert.equal(units[0].text, 'An unsaved caption edit.');
    return providerResponse(units[0].id, units.at(-1).id);
  };
  const response = await nativeFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: { utterances: [{ text: 'An unsaved caption edit.', start: 900, end: 23_000 }] } }),
  });
  const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(events.at(-1).candidates[0].startSecond, 0.9);
});

test('concurrent requests for one project are rejected; a provider failure returns no partial candidates', async () => {
  let release: () => void = () => {};
  let started: () => void = () => {};
  const providerStarted = new Promise<void>((resolve) => { started = resolve; });
  globalThis.fetch = async () => {
    started();
    await new Promise<void>((resolve) => { release = resolve; });
    return new Response('fake-test-key Full saved transcript.', { status: 429 });
  };
  const first = nativeFetch(endpoint, { method: 'POST' });
  await providerStarted;
  const busy = await nativeFetch(endpoint, { method: 'POST' });
  assert.equal(busy.status, 409);
  release();
  const body = await (await first).text();
  assert.match(body, /provider_error/);
  assert.doesNotMatch(body, /"complete"|fake-test-key|Full saved transcript/);
  assert.equal(readFileSync(path.join(projectDirectory, 'settings.json'), 'utf8'), settings);
});
