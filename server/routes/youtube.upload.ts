import fs from 'node:fs';
import { youtubeAuth } from '../youtube.auth.js';
import { description } from './finalize.js';
import { readChosen, validateChapters } from './finalize.chapters.js';
import { exportsPath, finalizeStatus, jsonPath, readJson, writeJson } from './finalize.data.js';
import path from 'node:path';

interface UploadResult { ok: true; videoId: string; url: string; studioUrl: string; privacyStatus: string }
interface UploadJob { state: 'uploading' | 'done' | 'error'; progress: number; result?: UploadResult; error?: string }
const jobs = new Map<string, UploadJob>();
const CHUNK = 8 * 1024 * 1024;
function validSession(url: string) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['www.googleapis.com', 'youtube.googleapis.com'].includes(u.hostname)) {
    throw new Error('Unexpected YouTube upload session URL');
  }
  return url;
}
async function bearer() {
  const auth = youtubeAuth();
  const token = await auth.getAccessToken();
  if (!token.token) throw new Error('YouTube authorization expired; reconnect');
  return token.token;
}
async function responseError(response: Response) {
  return `${response.status} ${((await response.text()).slice(0, 500))}`;
}
async function beginUpload(fileSize: number, title: string, text: string) {
  const token = await bearer();
  const response = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(fileSize), 'X-Upload-Content-Type': 'video/mp4' },
    body: JSON.stringify({ snippet: { title, description: text, categoryId: '28' },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false } }),
  });
  if (!response.ok) throw new Error(`YouTube session failed: ${await responseError(response)}`);
  const location = response.headers.get('location');
  if (!location) throw new Error('YouTube did not return an upload session');
  return validSession(location);
}
async function queryOffset(session: string, size: number): Promise<{ offset: number; video?: { id: string; privacyStatus: string } }> {
  const response = await fetch(session, { method: 'PUT', redirect: 'manual',
    headers: { Authorization: `Bearer ${await bearer()}`, 'Content-Range': `bytes */${size}`, 'Content-Length': '0' } });
  if (response.status === 308) {
    const range = response.headers.get('range')?.match(/bytes=0-(\d+)/);
    return { offset: range ? Number(range[1]) + 1 : 0 };
  }
  if (response.ok) {
    const data = await response.json() as { id?: string; status?: { privacyStatus?: string } };
    return { offset: size, video: data.id ? { id: data.id, privacyStatus: data.status?.privacyStatus || 'unknown' } : undefined };
  }
  throw new Error(`Could not resume YouTube upload: ${await responseError(response)}`);
}
async function transfer(file: string, session: string, job: UploadJob) {
  const handle = await fs.promises.open(file, 'r');
  const size = (await handle.stat()).size;
  let offset = 0;
  try {
    while (offset < size) {
      const length = Math.min(CHUNK, size - offset);
      const buffer = Buffer.allocUnsafe(length);
      let filled = 0;
      while (filled < length) {
        const { bytesRead } = await handle.read(buffer, filled, length - filled, offset + filled);
        if (!bytesRead) throw new Error('Final video changed during upload');
        filled += bytesRead;
      }
      let completed = false;
      const startingOffset = offset;
      for (let attempt = 0; attempt < 5 && !completed; attempt++) {
        try {
          const response = await fetch(session, { method: 'PUT', redirect: 'manual',
            headers: { Authorization: `Bearer ${await bearer()}`, 'Content-Type': 'video/mp4',
              'Content-Length': String(length), 'Content-Range': `bytes ${offset}-${offset + length - 1}/${size}` }, body: buffer });
          if (response.status === 308) {
            const range = response.headers.get('range')?.match(/bytes=0-(\d+)/);
            offset = range ? Number(range[1]) + 1 : offset + length;
            completed = true;
          }
          else if (response.ok) {
            const data = await response.json() as { id?: string; status?: { privacyStatus?: string } };
            if (!data.id) throw new Error('YouTube did not return a video ID');
            return { id: data.id, privacyStatus: data.status?.privacyStatus || 'unknown' };
          } else if (response.status !== 429 && response.status < 500) {
            throw new Error(`YouTube upload failed: ${await responseError(response)}`);
          }
        } catch (error) {
          if (attempt === 4 || (error instanceof Error && error.message.startsWith('YouTube upload failed:'))) throw error;
        }
        if (!completed) {
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
          const state = await queryOffset(session, size);
          if (state.video) return state.video;
          offset = state.offset;
          completed = offset > startingOffset;
        }
      }
      job.progress = Math.min(99, Math.round(offset / size * 100));
      if (!completed) throw new Error('YouTube upload could not resume');
    }
    throw new Error('YouTube completed upload without returning a video ID');
  } finally { await handle.close(); }
}
export function uploadStatus(id: string) {
  const prior = readJson<{ fingerprint: string; result: UploadResult }>(jsonPath(id, 'youtube-upload.json'));
  const current = finalizeStatus(id).receipt?.fingerprint;
  return jobs.get(id) || (prior?.fingerprint === current ? { state: 'done', progress: 100, result: prior.result } : { state: 'idle', progress: 0 });
}
export function startUpload(id: string) {
  const prior = uploadStatus(id);
  if (prior.state === 'uploading' || prior.state === 'done') return prior;
  const status = finalizeStatus(id);
  if (!status.coverage.complete || !status.stitched.exists || status.stitched.stale || !status.receipt) {
    throw new Error('Stitch the current complete chunk set first');
  }
  const chosen = readChosen(id, status.receipt.fingerprint);
  if (!chosen || validateChapters(chosen.chapters, status.receipt.duration)) throw new Error('Choose valid chapters first');
  const saved = readJson<{ title: string; template: string }>(jsonPath(id, 'youtube-meta.json'));
  if (!saved?.title?.trim() || !saved?.template?.trim()) throw new Error('Save a title and description first');
  const meta = description(id, status.receipt.fingerprint);
  if (meta.preview.length > 5000) throw new Error('YouTube description exceeds 5000 characters');
  const file = path.join(exportsPath(id), status.receipt.outputFile);
  if (!fs.existsSync(file)) throw new Error('Final video is missing');
  const job: UploadJob = { state: 'uploading', progress: 0 };
  jobs.set(id, job);
  void (async () => {
    try {
      const session = await beginUpload(fs.statSync(file).size, meta.title, meta.preview);
      const video = await transfer(file, session, job);
      const videoId = video.id;
      const result: UploadResult = { ok: true, videoId, url: `https://youtu.be/${videoId}`,
        studioUrl: `https://studio.youtube.com/video/${videoId}/edit`, privacyStatus: video.privacyStatus };
      writeJson(jsonPath(id, 'youtube-upload.json'), { fingerprint: status.receipt!.fingerprint, result });
      jobs.set(id, { state: 'done', progress: 100, result });
    } catch (error) {
      console.error('[youtube] Upload failed:', error instanceof Error ? error.message : error);
      jobs.set(id, { state: 'error', progress: job.progress, error: error instanceof Error ? error.message : 'Upload failed' });
    }
  })();
  return job;
}
