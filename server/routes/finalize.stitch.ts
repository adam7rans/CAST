import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { discoverChunks, exportsPath, jsonPath, sourceFingerprint, writeJson, type Chunk, type Receipt } from './finalize.data.js';

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', part => {
      output = (output + part.toString()).slice(-12000);
    });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`${command} failed: ${output}`)));
  });
}
async function probe(file: string) {
  const output = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_name,codec_type,width,height,sample_rate', '-of', 'json', file]);
  const data = JSON.parse(output) as { format?: { duration?: string }; streams?: Array<Record<string, unknown>> };
  return { duration: Number(data.format?.duration) || 0,
    signature: JSON.stringify((data.streams || []).map(s => [s.codec_type, s.codec_name, s.width, s.height, s.sample_rate])) };
}
function concatLine(file: string) { return `file '${file.replace(/'/g, "'\\''")}'`; }
const running = new Set<string>();

export async function stitchChunks(id: string, outName?: string) {
  if (running.has(id)) throw new Error('Stitch already in progress');
  if (outName && (!/^[a-zA-Z0-9._-]+\.mp4$/.test(outName) || outName.startsWith('.'))) {
    throw new Error('Output name must be a plain .mp4 filename');
  }
  running.add(id);
  let tempDir = '';
  let tempOutput = '';
  try {
    const chunks = discoverChunks(id);
    if (!chunks.length) throw new Error('No completed chunk videos found');
    const name = outName || `${id}-full-youtube.mp4`;
    const output = path.join(exportsPath(id), name);
    tempOutput = path.join(exportsPath(id), `.${name}.${process.pid}.partial.mp4`);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-concat-'));
    const list = path.join(tempDir, 'list.txt');
    fs.writeFileSync(list, chunks.map((c: Chunk) => concatLine(c.file)).join('\n') + '\n');
    const probes = await Promise.all(chunks.map(c => probe(c.file)));
    const mismatch = probes.some(p => p.signature !== probes[0].signature);
    const base = ['-y', '-f', 'concat', '-safe', '0', '-i', list];
    let reencoded = mismatch;
    try {
      await run('ffmpeg', [...base, ...(mismatch
        ? ['-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-c:a', 'aac', '-b:a', '320k']
        : ['-c', 'copy']), '-movflags', '+faststart', tempOutput]);
    } catch (error) {
      if (mismatch) throw error;
      fs.rmSync(tempOutput, { force: true });
      reencoded = true;
      await run('ffmpeg', [...base, '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
        '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', tempOutput]);
    }
    const { duration } = await probe(tempOutput);
    if (!duration || !fs.statSync(tempOutput).size) throw new Error('Final video is empty');
    fs.renameSync(tempOutput, output);
    const receipt: Receipt = { outputFile: name, chunkIds: chunks.map(c => c.exportId),
      createdAt: new Date().toISOString(), duration, fingerprint: sourceFingerprint(id, chunks), reencoded };
    writeJson(jsonPath(id, 'finalize.json'), receipt);
    return { ok: true, outputFile: `exports/${name}`, size: fs.statSync(output).size, duration, reencoded };
  } finally {
    running.delete(id);
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    if (tempOutput) fs.rmSync(tempOutput, { force: true });
  }
}
