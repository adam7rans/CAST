import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { google } from 'googleapis';
import { APP_HOST, APP_PORT, SERVER_DIR } from './helpers.js';

const tokenFile = path.join(SERVER_DIR, '.youtube-token.json');
type Token = { refresh_token?: string | null; access_token?: string | null; expiry_date?: number | null };
export function youtubeConfigured() {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI);
}
export function youtubeRedirectUri() {
  const uri = new URL(process.env.YOUTUBE_REDIRECT_URI!);
  uri.hostname = APP_HOST;
  uri.port = String(APP_PORT);
  return uri.toString();
}
export function unlistedApproved() { return process.env.YOUTUBE_UNLISTED_APPROVED === '1'; }
export function tokenExists() {
  try { return !!(JSON.parse(fs.readFileSync(tokenFile, 'utf8')) as Token).refresh_token; } catch { return false; }
}
export function youtubeAuth() {
  if (!youtubeConfigured()) throw new Error('YouTube OAuth is not configured');
  const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET, youtubeRedirectUri());
  if (fs.existsSync(tokenFile)) auth.setCredentials(JSON.parse(fs.readFileSync(tokenFile, 'utf8')));
  auth.on('tokens', tokens => {
    const prior = tokenExists() ? JSON.parse(fs.readFileSync(tokenFile, 'utf8')) as Token : {};
    saveToken({ ...prior, ...tokens });
  });
  return auth;
}
export function saveToken(token: Token) {
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  const temp = `${tokenFile}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(token), { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, tokenFile);
}
export function deleteToken() {
  fs.rmSync(tokenFile, { force: true });
}
