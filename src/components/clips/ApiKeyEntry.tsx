import React, { useEffect, useState } from 'react';
import { fetchClipFinderConfig, saveClipFinderKey } from '../../lib/projectApi.clips';
import { clipButtonStyle, clipFieldStyle } from './styles';

export interface ApiKeyEntryProps {
  onSaved: () => void;
}

export const ApiKeyEntry: React.FC<ApiKeyEntryProps> = ({ onSaved }) => {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchClipFinderConfig().then((config) => {
      if (!cancelled && !config.hasKey) setOpen(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (status === 'saving') return;
    setStatus('saving');
    setMessage('');
    try {
      await saveClipFinderKey(key);
      setKey('');
      onSaved();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not save the key. Check the CAST server.');
    }
  };

  if (!open) {
    return <button style={clipButtonStyle} onClick={() => setOpen(true)}>Add API key</button>;
  }
  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}
      style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <label htmlFor="clip-finder-key" style={{ lineHeight: 1.5 }}>
        Paste an OpenAI API key to enable clip discovery. It is saved locally on this machine
        and sent only to OpenAI. Create one at platform.openai.com/api-keys.
      </label>
      <input id="clip-finder-key" type="password" autoComplete="off" spellCheck={false}
        placeholder="sk-..." value={key} disabled={status === 'saving'}
        onChange={(event) => { setKey(event.target.value); setStatus('idle'); setMessage(''); }}
        style={clipFieldStyle} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={status === 'saving' || !key.trim()}
          style={{ ...clipButtonStyle, borderColor: '#1f6feb', color: '#fff' }}>
          {status === 'saving' ? 'Saving…' : 'Save key'}
        </button>
        <button type="button" style={clipButtonStyle} onClick={() => setOpen(false)}>Hide</button>
      </div>
      {message && <p role="alert" style={{ color: '#ff8b84', margin: 0, lineHeight: 1.5 }}>{message}</p>}
    </form>
  );
};
