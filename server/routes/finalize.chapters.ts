import fs from 'node:fs';
import { captionPath } from '../helpers.js';
import { discoverChunks, jsonPath, readJson, writeJson, type Chapter, type Version } from './finalize.data.js';

interface Word { text: string; start: number; end: number }
interface MappedWord extends Word { out: number; source: number }
const config: Record<Version, { target: number; pause: number; min: number; max: number }> = {
  sparse: { target: 420, pause: 1.2, min: 5, max: 8 },
  balanced: { target: 190, pause: 0.8, min: 12, max: 18 },
  dense: { target: 85, pause: 0.45, min: 25, max: 40 },
};
const filler = new Set(['um', 'uh', 'erm', 'like']);
const clean = (text: string) => text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
function rawWords(id: string): Word[] {
  const data = readJson<{ utterances?: Array<{ words?: Word[] }> }>(captionPath(id));
  return (data?.utterances || []).flatMap(u => u.words || []).filter(w =>
    typeof w.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end));
}
export function mappedWords(id: string) {
  const words = rawWords(id).sort((a, b) => a.start - b.start);
  const mapped: MappedWord[] = [];
  let base = 0;
  for (const chunk of discoverChunks(id)) {
    const segments = chunk.keptSegments.length ? chunk.keptSegments : [{ srcStart: chunk.start, srcEnd: chunk.end }];
    for (const segment of segments) {
      const from = segment.srcStart * 1000, to = segment.srcEnd * 1000;
      for (const word of words) {
        if (word.start >= from && word.start < to) {
          mapped.push({ ...word, out: base + (word.start - from) / 1000, source: word.start / 1000 });
        }
      }
      base += segment.srcEnd - segment.srcStart;
    }
  }
  return { words: mapped.sort((a, b) => a.out - b.out), duration: base };
}
function terms(words: MappedWord[]) {
  return new Set(words.map(w => clean(w.text).toLowerCase()).filter(w => w.length > 3));
}
function overlap(a: Set<string>, b: Set<string>) {
  let hits = 0;
  for (const word of a) if (b.has(word)) hits++;
  return hits / Math.max(1, Math.min(a.size, b.size));
}
function chapterText(words: MappedWord[]): Pick<Chapter, 'title' | 'summary'> {
  const withoutFillers = words.map(w => clean(w.text)).join(' ').replace(/\byou\s+know\b/gi, ' ')
    .split(/\s+/).filter(w => w && !filler.has(w.toLowerCase()));
  const title = withoutFillers.slice(0, 8).map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ').slice(0, 80) || 'Untitled Chapter';
  const full = words.map(w => w.text).join(' ').replace(/\s+/g, ' ');
  const sentence = full.match(/^.*?[.!?](?:\s|$)/)?.[0] || full;
  return { title, summary: sentence.trim().slice(0, 200) };
}
function makeVersion(words: MappedWord[], duration: number, version: Version): Chapter[] {
  const cfg = config[version];
  const count = Math.min(cfg.max, Math.max(3, cfg.min, Math.round(duration / cfg.target)));
  const boundaries = [0];
  for (let part = 1; part < count; part++) {
    const ideal = duration * part / count;
    const previous = boundaries.at(-1) || 0;
    const candidates = words.map((word, index) => ({ word, index }))
      .filter(({ word }) => word.out > previous + 10 && Math.abs(word.out - ideal) < duration / count * 0.38);
    if (!candidates.length) continue;
    let best = candidates[0], bestScore = -Infinity;
    for (const candidate of candidates) {
      const { word, index } = candidate;
      const prior = words[index - 1];
      const pause = prior ? Math.max(0, word.out - (prior.out + (prior.end - prior.start) / 1000)) : 0;
      const similarity = overlap(terms(words.slice(Math.max(0, index - 35), index)), terms(words.slice(index, index + 35)));
      const score = (pause >= cfg.pause ? 3 : Math.min(2, pause / cfg.pause))
        + (1 - similarity) * 2 - Math.abs(word.out - ideal) / cfg.target * 3;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    const rounded = Math.round(best.word.out);
    if (rounded - previous >= 10 && duration - rounded >= 10) boundaries.push(rounded);
  }
  return boundaries.map((start, index) => {
    const end = boundaries[index + 1] ?? duration;
    const section = words.filter(w => w.out >= start && w.out < end);
    return { start, sourceStart: section[0]?.source ?? start, ...chapterText(section) };
  });
}
export function validateChapters(chapters: Chapter[], duration: number): string | null {
  if (!Array.isArray(chapters) || chapters.length < 3) return 'At least three chapters are required';
  if (chapters[0].start !== 0) return 'First chapter must start at 0:00';
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    if (!Number.isInteger(c.start) || c.start < 0 || c.start >= duration) return 'Invalid chapter time';
    if (typeof c.title !== 'string' || !c.title.trim() || c.title.length > 80) return 'Chapter titles must be 1–80 characters';
    if (i && c.start - chapters[i - 1].start < 10) return 'Chapters must be at least 10 seconds apart';
  }
  if (duration - chapters.at(-1)!.start < 10) return 'Last chapter must be at least 10 seconds long';
  return null;
}
function timestamp(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function youtubeBlock(chapters: Chapter[]) {
  return chapters.map(c => `${timestamp(c.start)} ${c.title.trim()}`).join('\n');
}
export function generateChapters(id: string, fingerprint: string) {
  const { words, duration } = mappedWords(id);
  if (words.length < 30 || duration < 40) throw new Error('Not enough kept transcript to make chapters');
  const versions = {} as Record<Version, Chapter[]>;
  for (const version of Object.keys(config) as Version[]) {
    versions[version] = makeVersion(words, duration, version);
    const path = jsonPath(id, `chapters.${version}.json`);
    const previous = readJson<{ fingerprint: string; chapters: Chapter[] }>(path);
    if (previous?.fingerprint === fingerprint) {
      const titles = new Map(previous.chapters.map(chapter => [chapter.start, chapter.title]));
      versions[version] = versions[version].map(chapter => ({
        ...chapter, title: titles.get(chapter.start) || chapter.title,
      }));
    }
    const error = validateChapters(versions[version], duration);
    if (error) throw new Error(`${version}: ${error}`);
    writeJson(path, { fingerprint, chapters: versions[version] });
  }
  return versions;
}
export function readChosen(id: string, fingerprint: string) {
  const chosen = readJson<{ fingerprint: string; version: Version; chapters: Chapter[] }>(jsonPath(id, 'chapters.chosen.json'));
  return chosen?.fingerprint === fingerprint ? chosen : null;
}
export function chooseChapters(id: string, version: Version, edits: Chapter[] | undefined, fingerprint: string, duration: number) {
  if (!Object.hasOwn(config, version)) throw new Error('Unknown chapter version');
  const stored = readJson<{ fingerprint: string; chapters: Chapter[] }>(jsonPath(id, `chapters.${version}.json`));
  if (!stored || stored.fingerprint !== fingerprint) throw new Error('Regenerate chapters for the current stitch');
  const chapters = edits || stored.chapters;
  const error = validateChapters(chapters, duration);
  if (error) throw new Error(error);
  writeJson(jsonPath(id, 'chapters.chosen.json'), { version, chapters, fingerprint });
  const block = youtubeBlock(chapters);
  fs.writeFileSync(jsonPath(id, 'chapters.chosen.txt'), block + '\n');
  return { ok: true, chapters, youtubeBlock: block };
}
