import React, { useState } from 'react';
import { Section } from '../Controls';
import type { UploadStatus, YoutubeStatus } from '../../lib/projectApi.youtube';
import { button, muted } from './finalizeUi';

interface Props { youtube: YoutubeStatus | null; upload: UploadStatus | null; missing: string[];
  onConnect: () => void; onDisconnect: () => void; onUpload: () => void }
export function YouTubeSection({ youtube, upload, missing, onConnect, onDisconnect, onUpload }: Props) {
  const [certified, setCertified] = useState(false);
  return <Section title="5 · YouTube upload">
    <div style={muted}>{youtube?.connected ? `Connected${youtube.channelTitle ? ` as ${youtube.channelTitle}` : ' to YouTube'}` :
      youtube?.setupRequired ? 'OAuth setup is required before connecting.' : 'Connect your YouTube channel.'}</div>
    <div style={{ display: 'flex', gap: 5 }}><span style={{ ...muted, background: '#26331e', padding: '3px 6px', borderRadius: 4 }}>Unlisted</span>
      <span style={{ ...muted, background: '#26331e', padding: '3px 6px', borderRadius: 4 }}>Not for kids</span></div>
    {!youtube?.connected && <button style={button} disabled={youtube?.setupRequired} onClick={onConnect}>Connect YouTube</button>}
    {youtube?.connected && <button style={button} disabled={upload?.state === 'uploading'} onClick={onDisconnect}>Disconnect YouTube</button>}
    {missing.length > 0 && <div style={{ color: '#ffba7a', fontSize: 11 }}>Before upload: {missing.join(' · ')}</div>}
    <label style={{ ...muted, display: 'block' }}><input type="checkbox" checked={certified}
      onChange={event => setCertified(event.target.checked)} /> I confirm I have the rights to upload this video and it follows
      <a href="https://www.youtube.com/howyoutubeworks/policies/community-guidelines/" target="_blank" rel="noreferrer"> YouTube's Community Guidelines</a>.</label>
    <div style={muted}>Read the <a href="https://cast-local-video.adam7rans.chatgpt.site/privacy" target="_blank" rel="noreferrer">CAST privacy policy</a>,
      {' '}<a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>, and
      {' '}<a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a> before uploading.</div>
    <button style={button} disabled={!certified || missing.length > 0 || upload?.state === 'uploading' || upload?.state === 'done'} onClick={onUpload}>
      {upload?.state === 'uploading' ? `Uploading ${upload.progress}%…` : 'Upload to YouTube'}
    </button>
    {upload?.state === 'error' && <div style={{ color: '#ff9b9b', fontSize: 11 }}>{upload.error}</div>}
    {upload?.result && <div style={{ fontSize: 11, color: upload.result.privacyStatus === 'unlisted' ? '#85d8a0' : '#ffba7a' }}>
      Uploaded as {upload.result.privacyStatus}. {upload.result.privacyStatus !== 'unlisted' && 'Check YouTube Studio before sharing.'}
    </div>}
    {upload?.result && <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
      <a href={upload.result.url} target="_blank" rel="noreferrer">Watch video</a>
      <a href={upload.result.studioUrl} target="_blank" rel="noreferrer">Open in YouTube Studio</a>
    </div>}
  </Section>;
}
