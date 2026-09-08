import { ClipClientError, type ClipDiscoveryEvent } from './clipCandidates';
import type { TranscriptData } from './transcript';
import { BASE, fetchJson } from './projectApi.shared';

export function fetchClipFinderConfig() {
  return fetchJson<{ hasKey: boolean }>(`${BASE}/projects/clip-finder/config`);
}

export function saveClipFinderKey(apiKey: string) {
  return fetchJson<{ ok: boolean }>(`${BASE}/projects/clip-finder/key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }),
  });
}

export async function discoverProjectClips(
  projectId: string, transcript: TranscriptData, signal: AbortSignal,
  onEvent: (event: ClipDiscoveryEvent) => void,
) {
  const response = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/clip-candidates`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ClipClientError(body?.error || 'Could not start clip discovery. Check the CAST server.', body?.code);
  }
  if (!response.body) throw new Error('The server did not return a discovery stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ClipDiscoveryEvent;
    if (event.type === 'error') throw new ClipClientError(event.error, event.code);
    if (event.type !== 'progress' && event.type !== 'complete') throw new Error('Invalid discovery stream.');
    if (event.type === 'complete') complete = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    consume(buffer);
    if (!complete) throw new Error('Discovery was interrupted. No clips were changed. Please retry.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
