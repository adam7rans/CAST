import { spawn, execFile } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { emit, projectDir, readProject, writeProject, PROJECTS_DIR } from '../helpers.js';
import { checkSpace, guardChildDiskSpace, WRITE_RESERVE_BYTES } from '../diskSpace.js';

const execFileAsync = promisify(execFile);
const active = new Map<string, ReturnType<typeof spawn>>();

type MediaProbe = {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
};

export async function probe(file: string): Promise<MediaProbe> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height',
    '-of', 'json', file,
  ]);
  return JSON.parse(stdout) as MediaProbe;
}

export function videoShape(data: MediaProbe) {
  const video = data.streams?.find((stream) => stream.codec_type === 'video');
  return { duration: Number(data.format?.duration), width: video?.width, height: video?.height,
    audio: data.streams?.some((stream) => stream.codec_type === 'audio') ?? false };
}

export async function encode(source: string, output: string, id: string, duration: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source,
      '-map', '0:v:0', '-map', '0:a?', '-sn', '-dn', '-map_metadata', '-1',
      '-vf', 'hue=s=0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-threads', '4', '-pix_fmt', 'yuv420p',
      '-fps_mode', 'passthrough', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-progress', 'pipe:1', output,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    active.set(id, child);
    const diskStop = guardChildDiskSpace(child, path.dirname(output), 'Video compression');
    let progressBuffer = '';
    let lastPercent = 0;
    let errors = '';
    child.stdout.on('data', (chunk: Buffer) => {
      progressBuffer += chunk.toString();
      const lines = progressBuffer.split('\n');
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)/);
        if (!match || !duration) continue;
        const percent = Math.min(99, Math.floor(Number(match[1]) / (duration * 10000)));
        if (percent >= lastPercent + 2) {
          lastPercent = percent;
          emit(id, { type: 'video_optimizing', message: `Compressing video… ${percent}%` });
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { errors = (errors + chunk.toString()).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (active.get(id) === child) active.delete(id);
      const stopped = diskStop();
      if (stopped) reject(new Error(stopped));
      else if (code === 0) resolve();
      else reject(new Error(signal ? `Video conversion stopped (${signal})` : errors.trim() || `ffmpeg exited ${code}`));
    });
  });
}

export function cancelVideoOptimization(id: string) {
  active.get(id)?.kill('SIGTERM');
}

/** Keep the source until the replacement is verified and transcription finishes reading it. */
export async function optimizeImportedVideo(id: string, sourceFile: string, transcription: Promise<void>) {
  const dir = projectDir(id);
  const source = path.join(dir, sourceFile);
  const temporary = path.join(dir, `.optimizing-${randomUUID()}.mp4`);
  const replacement = `optimized-${randomUUID().slice(0, 8)}.mp4`;
  const current = () => {
    const project = readProject(id);
    return project?.videoFile === sourceFile && project.videoOptimization?.sourceFile === sourceFile ? project : null;
  };
  try {
    if (!current() || !fs.existsSync(source)) return;
    // The compressed copy can approach the source's size before it is verified.
    const space = checkSpace(dir, fs.statSync(source).size, 'compress this video', WRITE_RESERVE_BYTES);
    if (!space.ok) throw new Error(space.message);
    const sourceInfo = videoShape(await probe(source));
    if (!sourceInfo.width || !sourceInfo.height || !Number.isFinite(sourceInfo.duration)) {
      throw new Error('Could not read the source video');
    }
    emit(id, { type: 'video_optimizing', message: 'Compressing video in the background…' });
    await encode(source, temporary, id, sourceInfo.duration);
    if (!current()) return;
    const resultInfo = videoShape(await probe(temporary));
    if (resultInfo.width !== sourceInfo.width || resultInfo.height !== sourceInfo.height ||
        resultInfo.audio !== sourceInfo.audio ||
        Math.abs(resultInfo.duration - sourceInfo.duration) > Math.max(2, sourceInfo.duration * 0.001)) {
      throw new Error('Converted video did not pass duration, size, and audio checks');
    }
    const originalBytes = fs.statSync(source).size;
    const optimizedBytes = fs.statSync(temporary).size;
    if (optimizedBytes >= originalBytes) {
      const project = current();
      if (project) {
        project.videoOptimization = { status: 'ineffective', sourceFile };
        writeProject(id, project);
        emit(id, { type: 'video_optimization_skipped', message: 'Video is already compact; kept the smaller original.' });
      }
      return;
    }
    fs.renameSync(temporary, path.join(dir, replacement));
    const project = current();
    if (!project) { fs.unlinkSync(path.join(dir, replacement)); return; }
    project.videoFile = replacement;
    project.videoOptimization = { status: 'completed', sourceFile };
    project.videoOptimizationResult = { originalBytes, optimizedBytes, profile: 'bw-crf28' };
    project.updatedAt = new Date().toISOString();
    writeProject(id, project);
    emit(id, { type: 'video_optimized', message: `Video compressed to ${Math.round(optimizedBytes / originalBytes * 100)}% of its original size`, originalBytes, optimizedBytes });
    await transcription;
    fs.unlinkSync(source);
    const finished = readProject(id);
    if (finished?.videoFile === replacement && finished.videoOptimization?.sourceFile === sourceFile) {
      delete finished.videoOptimization;
      writeProject(id, finished);
    }
  } catch (error) {
    const project = current();
    if (project) {
      const message = error instanceof Error ? error.message : String(error);
      project.videoOptimization = { status: 'failed', sourceFile, error: message };
      writeProject(id, project);
      emit(id, { type: 'video_optimization_failed', message: `Video compression failed; original kept. ${message}` });
    }
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

/** Resume an interrupted conversion after the dock app restarts. */
export function resumeVideoOptimizations(startTranscription: (id: string, source: string) => Promise<void>) {
  for (const id of fs.readdirSync(PROJECTS_DIR)) {
    const project = readProject(id);
    const source = project?.videoOptimization?.sourceFile;
    if (project?.videoOptimization?.status === 'completed' && source) {
      const replacement = project.videoFile && path.join(projectDir(id), project.videoFile);
      if (!replacement || !fs.existsSync(replacement)) {
        project.videoFile = source;
        project.videoOptimization = { status: 'failed', sourceFile: source, error: 'Converted file missing after restart' };
        writeProject(id, project);
        continue;
      }
      const transcription = project.captionFile ? Promise.resolve() : startTranscription(id, replacement);
      void transcription.then(() => {
        try { fs.unlinkSync(path.join(projectDir(id), source)); } catch {}
        const finished = readProject(id);
        if (finished?.videoFile === project.videoFile && finished.videoOptimization?.sourceFile === source) {
          delete finished.videoOptimization;
          writeProject(id, finished);
        }
      });
      continue;
    }
    if (project?.videoOptimization?.status !== 'pending' || !source || project.videoFile !== source) continue;
    const sourcePath = path.join(projectDir(id), source);
    if (!fs.existsSync(sourcePath)) continue;
    for (const name of fs.readdirSync(projectDir(id))) {
      if (name.startsWith('.optimizing-') && name.endsWith('.mp4')) {
        try { fs.unlinkSync(path.join(projectDir(id), name)); } catch {}
      }
    }
    const transcription = project.captionFile ? Promise.resolve() : startTranscription(id, sourcePath);
    void transcription.then(() => optimizeImportedVideo(id, source, Promise.resolve()));
  }
}
