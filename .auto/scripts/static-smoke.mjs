import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const host = '127.0.0.1';
const port = 4312;
const baseUrl = `http://${host}:${port}`;
const expectedHtml = await readFile('dist/index.html', 'utf8');
const assetPath = expectedHtml.match(/<script\b[^>]*\bsrc="(\/assets\/[^"?]+\.js)"/)?.[1];
assert.ok(assetPath, 'dist/index.html must reference a built JavaScript asset');
const expectedAsset = await readFile(path.join('dist', assetPath), 'utf8');

const probe = net.createServer();
probe.listen({ host, port, exclusive: true });
try {
  await once(probe, 'listening');
} catch (error) {
  throw new Error(`static smoke: ${baseUrl} is unavailable; do not stop another listener`, { cause: error });
}
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'cast-health-smoke-'));
let server;
let output = '';
let interrupted = false;
let forcedCleanup;

function signalGroup(signal) {
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function interrupt() {
  interrupted = true;
  signalGroup('SIGTERM');
}

process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

try {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CAST_SERVE_STATIC: '1',
      CAST_HOST: host,
      CAST_PORT: String(port),
      CAST_DATA_DIR: path.join(temporaryRoot, 'projects'),
      CAST_PRESETS_DIR: path.join(temporaryRoot, 'presets'),
    },
  });
  let spawnError;
  server.on('error', error => { spawnError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', chunk => { output = (output + chunk).slice(-4096); });
  }
  forcedCleanup = setTimeout(() => signalGroup('SIGKILL'), 30_000);
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error('static smoke interrupted');
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error('CAST exited before static smoke completed');
    }
    if (output.includes(`CAST app -> ${baseUrl}`)) {
      ready = true;
      break;
    }
    await delay(100);
  }
  assert.ok(ready, 'CAST did not start within 20 seconds');
  for (const [urlPath, expected] of [['/', expectedHtml], [assetPath, expectedAsset]]) {
    const response = await fetch(`${baseUrl}${urlPath}`, { signal: AbortSignal.timeout(2000), redirect: 'error' });
    assert.equal(response.status, 200, `GET ${urlPath} must return HTTP 200`);
    assert.equal(await response.text(), expected, `GET ${urlPath} must serve the current dist build`);
  }
  assert.equal(interrupted, false, 'static smoke interrupted');
  assert.equal(server.exitCode, null, 'CAST must remain running until cleanup');
  assert.equal(server.signalCode, null, 'CAST must not be killed before cleanup');
} catch (error) {
  if (output) console.error(output.trim());
  throw error;
} finally {
  if (forcedCleanup) clearTimeout(forcedCleanup);
  signalGroup('SIGTERM');
  const deadline = Date.now() + 3000;
  while (server?.pid && Date.now() < deadline) {
    try {
      process.kill(-server.pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') break;
      throw error;
    }
    await delay(100);
  }
  signalGroup('SIGKILL');
  await rm(temporaryRoot, { recursive: true, force: true });
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}

console.log(`PASS static smoke: ${baseUrl}, current HTML/JS, owned process group stopped`);
