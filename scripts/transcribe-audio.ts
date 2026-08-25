import * as fs from 'fs';
import * as path from 'path';
import {
  getParagraphs,
  pollJob,
  readApiKey,
  submitJob,
  uploadAudio,
} from '../server/transcribe.api.js';

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
    : [minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

const audioArgument = process.argv[2];
if (!audioArgument) {
  console.error('Usage: tsx scripts/transcribe-audio.ts <audio-file> [output-file]');
  process.exit(1);
}

const audioPath = path.resolve(audioArgument);
if (!fs.existsSync(audioPath)) {
  console.error(`Audio file not found: ${audioPath}`);
  process.exit(1);
}

const parsedPath = path.parse(audioPath);
const outputPath = path.resolve(process.argv[3] || path.join(parsedPath.dir, `${parsedPath.name}-transcript.txt`));

try {
  const key = readApiKey();
  console.log(`Uploading ${path.basename(audioPath)}…`);
  const audioUrl = await uploadAudio(key, audioPath);

  console.log('Submitting transcription job…');
  const transcriptId = await submitJob(key, audioUrl);
  await pollJob(key, transcriptId, (status) => console.log(`AssemblyAI status: ${status}`));

  console.log('Formatting timestamped paragraphs…');
  const paragraphs = await getParagraphs(key, transcriptId);
  if (paragraphs.length === 0) throw new Error('AssemblyAI returned no transcript paragraphs');

  const transcript = paragraphs
    .map((paragraph) => `[${formatTimestamp(paragraph.start || 0)}] ${paragraph.text || ''}`)
    .join('\n\n');

  fs.writeFileSync(outputPath, `${transcript}\n`);
  console.log(`Transcript saved to ${outputPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
