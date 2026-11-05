import React, { useState } from 'react';
import { C } from '../../lib/designTokens';
import { Icon } from '../ui/Icon';

/** "New project" button that turns into a name field; creating opens the editor. */
export const NewProjectControl: React.FC<{ onCreate: (name: string) => Promise<void> }> = ({ onCreate }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const cancel = () => { setEditing(false); setName(''); };
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      cancel();
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className="cdash-btn primary" onClick={() => setEditing(true)}>
        <Icon name="plus" size={13} /> New project
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
    >
      <input
        autoFocus
        aria-label="Project name"
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } }}
        placeholder="Project name"
        style={{
          height: 30, width: 200, padding: '0 10px', borderRadius: 6, border: `1px solid ${C.blue}`,
          background: C.field, color: C.text, font: 'inherit', fontSize: 12, outline: 'none',
        }}
      />
      <button type="submit" className="cdash-btn primary" disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create'}
      </button>
      <button type="button" className="cdash-btn" onClick={cancel} disabled={busy}>Cancel</button>
    </form>
  );
};
