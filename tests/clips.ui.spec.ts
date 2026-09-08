import { test, expect } from '@playwright/test';
import { candidateStream, existingClip, fixtureProject, mockAudio, openProject, transcript } from './clips.ui.helpers';

test('reviews, seeks, edits, selects and appends candidates through normal autosave', async ({ page, request }) => {
  const id = await fixtureProject(request);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockAudio(page, id);
  await page.route(`**/api/projects/${id}/clip-candidates`, async (route) => {
    expect(route.request().postDataJSON().transcript).toMatchObject(transcript);
    await route.fulfill({ contentType: 'application/x-ndjson', body: candidateStream() });
  });
  await openProject(page, id);
  await page.getByRole('button', { name: 'Find clips', exact: true }).click();
  const first = page.getByRole('article', { name: 'Candidate 1', exact: true });
  await expect(first).toBeVisible();
  expect((await (await request.get(`/api/projects/${id}`)).json()).microTimelines).toEqual([existingClip]);
  await expect(first.getByText('00:00:12.000 → 00:00:35.000 · 23.00s')).toBeVisible();
  await first.getByRole('button', { name: 'Seek to start' }).click();
  await expect(page.getByText('0:12.00', { exact: true }).first()).toBeVisible();
  await first.getByLabel('Title', { exact: true }).fill('My edited clip');
  await first.getByLabel('Start seconds').fill('13.25');
  await first.getByLabel('End seconds').fill('80');
  await first.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Add selected (1)', exact: true })).toBeDisabled();
  await expect(first.getByRole('alert')).toContainText('beyond');
  await first.getByLabel('End seconds').fill('34.5');
  const saved = page.waitForRequest((req) => req.url().endsWith(`/${id}/settings`)
    && req.method() === 'PUT' && req.postDataJSON().microTimelines?.length === 2);
  await page.getByRole('button', { name: 'Add selected (1)', exact: true }).click();
  const payload = (await saved).postDataJSON();
  expect(payload.microTimelines[0]).toEqual(existingClip);
  expect(payload.microTimelines[1]).toMatchObject({ name: 'My edited clip', startSecond: 13.25, endSecond: 34.5, color: '#30d158' });
  await expect(first.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('article', { name: 'Candidate 2', exact: true }).getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('button', { name: 'Edits', exact: true }).click();
  await page.getByRole('button', { name: 'Clips', exact: true }).click();
  await expect(first.getByLabel('Title', { exact: true })).toHaveValue('My edited clip');
  await expect(async () => {
    const project = await (await request.get(`/api/projects/${id}`)).json();
    expect(project.microTimelines).toHaveLength(2);
  }).toPass();
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/clips-workspace.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('shows missing transcript, missing key, provider error and empty discovery states', async ({ page, request }) => {
  const emptyId = await fixtureProject(request, false);
  await openProject(page, emptyId);
  await expect(page.getByRole('button', { name: 'Find clips', exact: true })).toBeDisabled();
  const id = await fixtureProject(request);
  await openProject(page, id);
  await page.getByRole('button', { name: 'Find clips', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('OPENAI_API_KEY');
  await page.route(`**/api/projects/${id}/clip-candidates`, (route) => route.fulfill({
    contentType: 'application/x-ndjson',
    body: '{"type":"progress","completed":0,"total":2}\n{"type":"error","error":"OpenAI rate or usage limit reached.","code":"provider_error"}\n',
  }));
  await page.getByRole('button', { name: 'Find clips', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('rate or usage limit');
  await page.unroute(`**/api/projects/${id}/clip-candidates`);
  await page.route(`**/api/projects/${id}/clip-candidates`, (route) => route.fulfill({
    contentType: 'application/x-ndjson', body: '{"type":"complete","candidates":[],"total":2}\n',
  }));
  await page.getByRole('button', { name: 'Find clips', exact: true }).click();
  await expect(page.getByText(/no strong standalone clips/)).toBeVisible();
  expect((await (await request.get(`/api/projects/${id}`)).json()).microTimelines).toEqual([existingClip]);
});

test('cancels in-flight discovery and clears candidates when switching projects', async ({ page, request }) => {
  const id = await fixtureProject(request);
  const otherId = await fixtureProject(request);
  let finish: () => void = () => {};
  await page.route(`**/api/projects/${id}/clip-candidates`, async (route) => {
    await new Promise<void>((resolve) => { finish = resolve; });
    await route.fulfill({ contentType: 'application/x-ndjson', body: candidateStream() }).catch(() => {});
  });
  await openProject(page, id);
  const sent = page.waitForRequest(`**/api/projects/${id}/clip-candidates`);
  await page.getByRole('button', { name: 'Find clips', exact: true }).click();
  await sent;
  await expect(page.getByRole('button', { name: 'Finding clips…' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  finish();
  await expect(page.getByText(/Discovery cancelled/)).toBeVisible();
  await page.unroute(`**/api/projects/${id}/clip-candidates`);
  await page.route(`**/api/projects/${id}/clip-candidates`, (route) => route.fulfill({ contentType: 'application/x-ndjson', body: candidateStream() }));
  await page.getByRole('button', { name: 'Find clips', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Candidate 1', exact: true })).toBeVisible();
  await page.getByRole('combobox').first().selectOption(otherId);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find clips', exact: true })).toBeEnabled();
});
