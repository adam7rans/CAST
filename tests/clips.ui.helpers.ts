import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const existingClip = { id: 'manual', name: 'Keep this clip', startSecond: 0, endSecond: 9, color: '#1f6feb' };
export const transcript = { utterances: [
  { text: 'The opening context.', start: 0, end: 10_000 },
  { text: 'A compelling and complete thought.', start: 12_000, end: 35_000 },
  { text: 'Another complete insight.', start: 40_000, end: 60_000 },
] };
export const candidates = [
  { id: 'first', title: 'A strong insight', startSecond: 12, endSecond: 35, reason: 'A complete thought with a satisfying ending.', score: 95 },
  { id: 'second', title: 'A second insight', startSecond: 40, endSecond: 60, reason: 'A useful explanation that stands alone.', score: 90 },
];

export async function fixtureProject(request: APIRequestContext, withTranscript = true) {
  const response = await request.post('/api/projects', { data: { name: `Clip finder ${crypto.randomUUID()}` } });
  const { id } = await response.json();
  await request.put(`/api/projects/${id}/settings`, { data: {
    microTimelines: [existingClip], selectedClipId: existingClip.id,
    ui: { mainTab: 'editor', editorSubTab: 'clips', editorMode: 'clips' },
    layers: { background: false, video: false, captions: false, music: false },
  } });
  if (withTranscript) await request.put(`/api/projects/${id}/caption`, { data: transcript });
  return id as string;
}

export async function openProject(page: Page, id: string) {
  await page.goto('/');
  await page.locator(`select:has(option[value="${id}"])`).selectOption(id);
  await expect(page.getByText('AI clip finder', { exact: true })).toBeVisible();
}

export async function mockAudio(page: Page, id: string) {
  const sampleRate = 8000;
  const bytes = sampleRate * 70 * 2;
  const wave = Buffer.alloc(44 + bytes);
  wave.write('RIFF', 0); wave.writeUInt32LE(36 + bytes, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
  wave.write('data', 36); wave.writeUInt32LE(bytes, 40);
  await page.route(`**/api/projects/${id}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), hasAudio: true, audioFile: 'preview.wav', mediaType: 'audio' } });
  });
  await page.route(`**/api/projects/${id}/audio`, (route) => {
    const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wave.length - 1) : wave.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body: wave.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wave.length}` } : {}) },
    });
  });
}

export function candidateStream() {
  return `${JSON.stringify({ type: 'progress', completed: 1, total: 1 })}\n${JSON.stringify({ type: 'complete', candidates, total: 1 })}\n`;
}
