import type { ProjectSummary } from '../../lib/projectApi.dashboard';

/** 3760 → "1:02:40", 95 → "1:35". */
export function formatDuration(sec: number | null): string | null {
  if (sec === null || !Number.isFinite(sec)) return null;
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Decimal units, matching Finder. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function formatRelative(iso: string | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface Fact { label: string; tone?: 'muted' | 'good' | 'warn' }

/** The short facts shown on a card or row, most useful first. */
export function projectFacts(p: ProjectSummary): Fact[] {
  const facts: Fact[] = [];
  if (!p.mediaType) facts.push({ label: 'No media yet', tone: 'muted' });
  else if (p.mediaType === 'video') facts.push({ label: p.height ? `Video ${p.height}p` : 'Video' });
  else facts.push({ label: 'Audio' });
  if (p.mediaType) facts.push(p.hasTranscript ? { label: 'Captions', tone: 'good' } : { label: 'No captions', tone: 'warn' });
  if (p.musicTrackCount > 0) {
    facts.push({ label: p.musicClipCount > 0
      ? `${plural(p.musicTrackCount, 'track')} · ${plural(p.musicClipCount, 'clip')}`
      : plural(p.musicTrackCount, 'music track') });
  }
  if (p.cutCount > 0) facts.push({ label: plural(p.cutCount, 'cut') });
  if (p.exportCount > 0) facts.push({ label: plural(p.exportCount, 'export') });
  if (p.processing) facts.push({ label: 'Processing', tone: 'warn' });
  return facts;
}
