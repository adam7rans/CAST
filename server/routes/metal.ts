import { Router } from 'express';
import { ensureMetalRunning, metalRunning, stopMetal } from '../metalSupervisor.js';

export const metalRoutes = Router();

/** Status: is castmetal's control server reachable? */
metalRoutes.get('/status', async (_req, res) => {
  res.json({ running: await metalRunning() });
});

/**
 * Start castmetal if not running. Called automatically by the Metal panel
 * when it opens; also usable manually.
 */
metalRoutes.post('/start', async (_req, res) => {
  const err = await ensureMetalRunning();
  if (err) {
    res.status(500).json({ started: false, error: err });
    return;
  }
  res.json({ started: true });
});

/** Stop the instance we spawned. */
metalRoutes.post('/stop', async (_req, res) => {
  stopMetal();
  res.json({ stopped: true });
});
