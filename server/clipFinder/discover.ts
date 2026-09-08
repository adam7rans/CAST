import type { ClipCandidate, ClipDiscoveryEvent } from '../../src/lib/clipCandidates.js';
import { requestClips } from './provider.js';
import { deduplicateCandidates } from './response.js';
import type { TimedUnit } from './transcript.js';

export async function discoverClips(
  chunks: TimedUnit[][],
  config: { apiKey: string; model: string },
  signal: AbortSignal,
  progress: (event: ClipDiscoveryEvent) => void,
  request: typeof requestClips = requestClips,
) {
  const candidates: ClipCandidate[] = [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  let next = 0;
  let completed = 0;
  progress({ type: 'progress', completed, total: chunks.length });
  const worker = async () => {
    while (next < chunks.length) {
      controller.signal.throwIfAborted();
      const chunk = chunks[next++];
      candidates.push(...await request(chunk, config, controller.signal));
      controller.signal.throwIfAborted();
      progress({ type: 'progress', completed: ++completed, total: chunks.length });
    }
  };
  try {
    await Promise.all([worker(), worker()]);
    return deduplicateCandidates(candidates);
  } finally {
    controller.abort();
    signal.removeEventListener('abort', abort);
  }
}
