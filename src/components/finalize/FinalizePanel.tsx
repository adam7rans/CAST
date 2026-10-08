import React, { useEffect, useMemo, useState } from 'react';
import { getFinalizeStatus, stitchFinalVideo, generateChapterVersions, getChosenChapters,
  chooseChapterVersion, getYoutubeDescription, saveYoutubeDescription, openFinalExportFolder,
  type Chapter, type ChapterVersion, type ChapterVersions, type FinalizeStatus } from '../../lib/projectApi.finalize';
import { connectYoutube, disconnectYoutube, getUploadStatus, getYoutubeStatus, startYoutubeUpload,
  type UploadStatus, type YoutubeStatus } from '../../lib/projectApi.youtube';
import { ReadinessSection } from './ReadinessSection';
import { StitchSection } from './StitchSection';
import { ChaptersSection } from './ChaptersSection';
import { ChapterPickerModal } from './ChapterPickerModal';
import { DescriptionSection } from './DescriptionSection';
import { YouTubeSection } from './YouTubeSection';
import { missingSteps } from './finalizeUi';

interface Props { projectId: string | null; onSeek: (sourceSecond: number) => void }
export function FinalizePanel({ projectId, onSeek }: Props) {
  const [status, setStatus] = useState<FinalizeStatus | null>(null);
  const [youtube, setYoutube] = useState<YoutubeStatus | null>(null);
  const [upload, setUpload] = useState<UploadStatus | null>(null);
  const [versions, setVersions] = useState<ChapterVersions | null>(null);
  const [currentVersion, setCurrentVersion] = useState<ChapterVersion | null>(null);
  const [chosen, setChosen] = useState<Chapter[] | null>(null);
  const [block, setBlock] = useState('');
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const refresh = async (id: string) => {
    const [s, c, d, y, u] = await Promise.all([
      getFinalizeStatus(id), getChosenChapters(id), getYoutubeDescription(id), getYoutubeStatus(), getUploadStatus(id),
    ]);
    setStatus(s); setChosen(c.chapters); setBlock(c.youtubeBlock || '');
    setTitle(d.title); setTemplate(d.template); setSaved(d.saved); setYoutube(y); setUpload(u);
  };
  useEffect(() => {
    setStatus(null); setChosen(null); setVersions(null); setCurrentVersion(null); setError(''); setMessage('');
    if (!projectId) return;
    let alive = true;
    Promise.all([getFinalizeStatus(projectId), getChosenChapters(projectId), getYoutubeDescription(projectId),
      getYoutubeStatus(), getUploadStatus(projectId)]).then(([s, c, d, y, u]) => {
      if (!alive) return;
      setStatus(s); setChosen(c.chapters); setBlock(c.youtubeBlock || '');
      setTitle(d.title); setTemplate(d.template); setSaved(d.saved); setYoutube(y); setUpload(u);
    }).catch(e => alive && setError(e instanceof Error ? e.message : 'Could not load finalize state'));
    return () => { alive = false; };
  }, [projectId]);
  useEffect(() => {
    if (!projectId || upload?.state !== 'uploading') return;
    const timer = window.setInterval(() => getUploadStatus(projectId).then(setUpload).catch(() => {}), 1200);
    return () => window.clearInterval(timer);
  }, [projectId, upload?.state]);
  useEffect(() => {
    const connected = (event: MessageEvent) => {
      if (!['http://127.0.0.1:3002', 'http://localhost:3002', window.location.origin].includes(event.origin)
        || event.data?.type !== 'cast-youtube-oauth') return;
      if (event.data.status === 'connected') getYoutubeStatus().then(setYoutube).catch(() => {});
      else setError('YouTube connection failed. Try connecting again.');
    };
    window.addEventListener('message', connected);
    return () => window.removeEventListener('message', connected);
  }, []);
  const preview = useMemo(() => template.includes('{chapters}')
    ? template.split('{chapters}').join(block) : `${template.trim()}\n\nChapters:\n${block}`, [template, block]);
  const missing = missingSteps(status, !!chosen, saved && !!title.trim() && !!template.trim() && preview.length <= 5000,
    !!youtube?.connected, !!youtube?.unlistedReady);
  const perform = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : `${label} failed`); }
    finally { setBusy(''); }
  };
  const showChapterVersions = () => perform('chapters', async () => {
    const [generated, savedChapters] = await Promise.all([
      generateChapterVersions(projectId!), getChosenChapters(projectId!),
    ]);
    const savedVersion = savedChapters.chapters && savedChapters.version ? savedChapters.version : null;
    setCurrentVersion(savedVersion);
    setVersions(savedVersion ? { ...generated, [savedVersion]: savedChapters.chapters! } : generated);
  });
  if (!projectId) return <div style={{ color: '#999', padding: 10, fontSize: 12 }}>Select a project to finalize.</div>;
  return <div>
    <ReadinessSection status={status} />
    <StitchSection status={status} busy={busy === 'stitch'} onStitch={() => perform('stitch', async () => {
      await stitchFinalVideo(projectId); await refresh(projectId); setVersions(null); setMessage('Full video stitched.');
    })} onReveal={() => perform('reveal', async () => { await openFinalExportFolder(projectId); })} />
    <ChaptersSection chapters={chosen} busy={busy === 'chapters'} canGenerate={!!status?.stitched.exists && !status.stitched.stale}
      onGenerate={showChapterVersions} onCompare={showChapterVersions} onSeek={onSeek} />
    <DescriptionSection title={title} template={template} preview={preview} saved={saved} busy={busy === 'description'}
      canSave={!!chosen && !!status?.stitched.exists && !status.stitched.stale}
      onTitle={value => { setTitle(value); setSaved(false); }}
      onTemplate={value => { setTemplate(value); setSaved(false); }}
      onSave={() => perform('description', async () => {
        await saveYoutubeDescription(projectId, title, template); setSaved(true); setMessage('Description saved.');
      })} />
    <YouTubeSection youtube={youtube} upload={upload} missing={missing} onConnect={connectYoutube}
      onDisconnect={() => perform('disconnect', async () => { await disconnectYoutube(); setYoutube(await getYoutubeStatus()); })}
      onUpload={() => perform('upload', async () => { setUpload(await startYoutubeUpload(projectId)); })} />
    {error && <div role="alert" style={{ color: '#ff9b9b', fontSize: 12, padding: 8 }}>{error}</div>}
    {message && <div style={{ color: '#85d8a0', fontSize: 12, padding: 8 }}>{message}</div>}
    {versions && <ChapterPickerModal initial={versions} currentVersion={currentVersion} onClose={() => setVersions(null)} onSeek={onSeek} busy={busy === 'choose'}
      onContinue={(version: ChapterVersion, chapters: Chapter[]) => perform('choose', async () => {
        const result = await chooseChapterVersion(projectId, version, chapters);
        setChosen(result.chapters); setCurrentVersion(version); setBlock(result.youtubeBlock); setVersions(null); setMessage(`${version} chapters selected.`);
      })} />}
  </div>;
}
