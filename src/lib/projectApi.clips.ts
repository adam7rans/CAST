import type { ClipDiscoveryEvent } from './clipCandidates';
import type { TranscriptData } from './transcript';
import { BASE } from './projectApi.shared';

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
    throw new Error(body?.error || 'Could not start clip discovery. Check the CAST server.');
  }
  if (!response.body) throw new Error('The server did not return a discovery stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ClipDiscoveryEvent;
    if (event.type === 'error') throw new Error(event.error);
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
