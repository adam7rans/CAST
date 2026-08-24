import React, { useEffect, useRef, useState } from 'react';
import { C } from '../../lib/designTokens';

/* Lightweight popover: a trigger button + an absolutely-positioned panel that
   closes on outside-click or Escape. Used to collapse the mode/guide controls
   into the top bar without permanently occupying a row. */
export const Popover: React.FC<{
  trigger: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  title?: string;
}> = ({ trigger, children, align = 'left', title }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={title}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: open ? C.field : 'transparent', border: `1px solid ${open ? C.line3 : C.line2}`, color: open ? C.text : C.dim, borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5 }}
      >
        {trigger(open)}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', [align]: 0,
          minWidth: 180, zIndex: 50, background: C.raise, border: `1px solid ${C.line3}`, borderRadius: 8,
          padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {title && <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>}
          {children}
        </div>
      )}
    </div>
  );
};
