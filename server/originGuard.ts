import type { RequestHandler } from 'express';
import { APP_PORT } from './helpers.js';

/**
 * CAST's API only serves CAST's own pages. The server listens on 127.0.0.1,
 * but any website open in the browser can still send requests to it, so:
 *
 * - Requests carrying an Origin header from another site are refused. Browsers
 *   attach Origin to cross-site fetches and to every POST/PUT/DELETE, so a
 *   foreign page can neither change nor read anything.
 * - The Host header must be a loopback name. That defeats DNS rebinding, where
 *   an attacker's domain is re-pointed at 127.0.0.1 so the browser treats its
 *   requests as same-origin.
 *
 * Tools that send no Origin (curl, OBS scripts) keep working. Extra entries can
 * be added with CAST_ALLOWED_ORIGINS / CAST_ALLOWED_HOSTS (comma-separated).
 */
const VITE_PORT = 5180;
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

const extra = (name: string) => (process.env[name] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const allowedHosts = new Set([
  ...LOOPBACK.map((h) => `${h}:${APP_PORT}`),
  ...extra('CAST_ALLOWED_HOSTS'),
]);

const allowedOrigins = new Set([
  ...LOOPBACK.flatMap((h) => [`http://${h}:${APP_PORT}`, `http://${h}:${VITE_PORT}`]),
  ...extra('CAST_ALLOWED_ORIGINS'),
]);

export const originGuard: RequestHandler = (req, res, next) => {
  const host = req.headers.host ?? '';
  if (!allowedHosts.has(host)) {
    res.status(403).json({ error: `Requests must be addressed to CAST on this Mac (got host "${host}")` });
    return;
  }
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: 'Requests from other websites are not allowed' });
    return;
  }
  next();
};
