import * as fs from 'fs';
import * as path from 'path';
import { extractAudio, runParakeet } from './transcribe.api.js';
import { checkSpace } from './diskSpace.js';
import { applyTranscriptRules } from './transcriptRules.js';
export type { TranscribeEvent } from './transcribe.types.js';

const CAPTION_FILE = 'caption.json';

/** Room for the extracted audio and the model's temporary WAV windows. */
const TRANSCRIBE_SCRATCH_BYTES = 512 * 1024 ** 2;

function assertTranscribeSpace(projectDir: string) {
  const space = checkSpace(projectDir, TRANSCRIBE_SCRATCH_BYTES, 'transcribe safely');
  if (!space.ok) throw new Error(space.message);
}

/** Transcribe one audio file locally and write CAST's caption.json. */
async function runFromAudioFile(
  audioPath: string,
  transcriptPath: string,
  onEvent: (e: import('./transcribe.types.js').TranscribeEvent) => void,
): Promise<void> {
  onEvent({ type: 'submitted', message: 'Loading local Parakeet model…' });
  const { transcript } = await runParakeet(audioPath, (message) => {
    onEvent({ type: 'polling', status: message, message });
  });
  applyTranscriptRules(transcript); // e.g. "source" → "SOURCE" outside "open source"
  fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
  onEvent({ type: 'done', message: '✓ Captions ready!' });
}

export async function runTranscriptionPipeline(
  videoPath: string,
  projectDir: string,
  onEvent: (e: import('./transcribe.types.js').TranscribeEvent) => void,
): Promise<void> {
  const audioPath = path.join(projectDir, '_audio.m4a');
  const transcriptPath = path.join(projectDir, CAPTION_FILE);
  try {
    assertTranscribeSpace(projectDir);
    onEvent({ type: 'audio_extracting', message: 'Extracting audio…' });
    await extractAudio(videoPath, audioPath);
    const mb = (fs.statSync(audioPath).size / 1e6).toFixed(1);
    onEvent({ type: 'audio_extracted', message: `Audio extracted (${mb} MB)` });
    await runFromAudioFile(audioPath, transcriptPath, onEvent);
    try { fs.unlinkSync(audioPath); } catch {}
  } catch (err: any) {
    try { fs.unlinkSync(audioPath); } catch {}
    onEvent({ type: 'error', message: err.message || String(err) });
  }
}

/**
 * For audio-only uploads — no extraction step needed. The original audio file is
 * kept in the project folder so the preview/export pipeline can play it back and
 * analyse it for visualisations.
 */
export async function runAudioTranscriptionPipeline(
  audioPath: string,
  projectDir: string,
  onEvent: (e: import('./transcribe.types.js').TranscribeEvent) => void,
): Promise<void> {
  const transcriptPath = path.join(projectDir, CAPTION_FILE);
  try {
    assertTranscribeSpace(projectDir);
    onEvent({ type: 'audio_extracted', message: 'Audio ready — transcribing locally' });
    await runFromAudioFile(audioPath, transcriptPath, onEvent);
  } catch (err: any) {
    onEvent({ type: 'error', message: err.message || String(err) });
  }
}
