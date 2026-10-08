import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { google } from 'googleapis';
import { projectExists } from './finalize.data.js';
import { startUpload, uploadStatus } from './youtube.upload.js';
import { deleteToken, saveToken, tokenExists, unlistedApproved, youtubeAuth, youtubeConfigured } from '../youtube.auth.js';

export const youtubeRoutes = Router();
export const projectYoutubeRoutes = Router();
const pending = new Map<string, { returnTo: string; popup: boolean; expires: number }>();
const allowedReturn = new Set(['http://127.0.0.1:4312', 'http://127.0.0.1:5180',
  'http://localhost:4312', 'http://localhost:5180']);
function safeReturn(value: string) {
  try {
    const url = new URL(value);
    if (allowedReturn.has(url.origin) && /^\/(?:[a-zA-Z0-9_-]+)?$/.test(url.pathname)) {
      return `${url.origin}${url.pathname}`;
    }
  } catch {}
  return 'http://127.0.0.1:4312/';
}
function returnWithStatus(base: string, status: 'connected' | 'error') {
  const url = new URL(base);
  url.searchParams.set('youtube', status);
  return url.toString();
}
function finishAuth(res: import('express').Response, session: { returnTo: string; popup: boolean }, status: 'connected' | 'error') {
  if (!session.popup) return void res.redirect(returnWithStatus(session.returnTo, status));
  const origin = new URL(session.returnTo).origin;
  res.type('html').send(`<!doctype html><title>CAST YouTube</title><p>${status === 'connected' ? 'YouTube connected. You can close this window.' : 'Connection failed. You can close this window.'}</p><script>if(window.opener){window.opener.postMessage({type:'cast-youtube-oauth',status:${JSON.stringify(status)}},${JSON.stringify(origin)});window.close()}else{location.href=${JSON.stringify(returnWithStatus(session.returnTo, status))}}</script>`);
}

youtubeRoutes.get('/status', async (_req, res) => {
  if (!youtubeConfigured() || !tokenExists()) return void res.json({ connected: false, setupRequired: !youtubeConfigured(), unlistedReady: unlistedApproved() });
  try {
    const auth = youtubeAuth();
    await auth.getAccessToken();
    let channelTitle: string | undefined;
    try {
      const youtube = google.youtube({ version: 'v3', auth });
      const channels = await youtube.channels.list({ part: ['snippet'], mine: true });
      channelTitle = channels.data.items?.[0]?.snippet?.title || undefined;
    } catch { /* Upload permission can still be valid without channel read access. */ }
    res.json({ connected: true, channelTitle, unlistedReady: unlistedApproved() });
  } catch { res.json({ connected: false, setupRequired: false, unlistedReady: unlistedApproved() }); }
});

youtubeRoutes.get('/oauth/start', (req, res) => {
  if (!youtubeConfigured()) return void res.status(503).json({ error: 'YouTube OAuth is not configured' });
  const returnTo = safeReturn(String(req.query.returnTo || 'http://127.0.0.1:4312/'));
  const state = randomBytes(24).toString('hex');
  pending.set(state, { returnTo, popup: req.query.popup === '1', expires: Date.now() + 10 * 60_000 });
  const auth = youtubeAuth();
  res.redirect(auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube.upload'], state }));
});

youtubeRoutes.get('/oauth/callback', async (req, res) => {
  const state = String(req.query.state || '');
  const session = pending.get(state);
  pending.delete(state);
  if (!session || session.expires < Date.now()) return void res.status(400).send('YouTube connection expired. Start again in CAST.');
  if (req.query.error) return void finishAuth(res, session, 'error');
  try {
    const auth = youtubeAuth();
    const { tokens } = await auth.getToken(String(req.query.code || ''));
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token');
    saveToken(tokens);
    finishAuth(res, session, 'connected');
  } catch (error) {
    console.error('[youtube] OAuth failed:', error instanceof Error ? error.message : error);
    finishAuth(res, session, 'error');
  }
});

youtubeRoutes.post('/disconnect', (_req, res) => {
  deleteToken();
  res.json({ connected: false });
});

projectYoutubeRoutes.get('/:id/youtube/upload/status', (req, res) => {
  if (!projectExists(req.params.id)) return void res.status(404).json({ error: 'Project not found' });
  res.json(uploadStatus(req.params.id));
});
projectYoutubeRoutes.post('/:id/youtube/upload', (req, res) => {
  if (!projectExists(req.params.id)) return void res.status(404).json({ error: 'Project not found' });
  if (!youtubeConfigured() || !tokenExists()) return void res.status(409).json({ error: 'Connect YouTube first' });
  if (!unlistedApproved()) return void res.status(409).json({ error: 'YouTube API audit approval is required for unlisted uploads' });
  if (req.body?.communityGuidelinesAccepted !== true) {
    return void res.status(400).json({ error: 'Confirm the video follows YouTube Community Guidelines before uploading' });
  }
  try { res.status(202).json(startUpload(req.params.id)); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Upload could not start' }); }
});
