import React from 'react';
import { C, ACCENT, ALPHA } from '../lib/designTokens';
import { Icon } from './ui/Icon';

/* Shared control primitives — redesigned "Direction D" control system:
   card sections, dark filled sliders, pill toggles, field-box selects/colors.
   The exported API (Section/Row/Slider/Toggle/ColorInput/Select) is unchanged
   so every existing panel picks up the new look with no call-site edits. */

export const Section: React.FC<{
  title: string;
  onReset?: () => void;
  /** Optional on/off toggle rendered next to the title. */
  enabled?: boolean;
  onToggle?: (v: boolean) => void;
  children: React.ReactNode;
}> = ({ title, onReset, enabled, onToggle, children }) => (
  <div style={{
    border: `1px solid ${C.line}`, borderRadius: 8, padding: '11px 13px', marginBottom: 10,
    background: ALPHA('#ffffff', 0.012),
    opacity: enabled === false ? 0.5 : 1, transition: 'opacity 150ms',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color: C.faint, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>{title}</div>
        {onToggle && (
          <button
            onClick={() => onToggle(!enabled)}
            title={enabled ? 'On' : 'Off'}
            style={{
              width: 30, height: 16, borderRadius: 999, border: 'none', padding: 0, cursor: 'pointer',
              background: enabled ? ACCENT : '#2c2c2c', position: 'relative', transition: 'background 150ms',
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: enabled ? 16 : 2,
              width: 12, height: 12, borderRadius: '50%', background: enabled ? '#111' : '#fff',
              transition: 'left 150ms',
            }} />
          </button>
        )}
      </div>
      {onReset && (
        <button
          onClick={onReset}
          style={{
            padding: '3px 8px', background: 'transparent', color: C.faint,
            border: `1px solid ${C.line2}`, borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.dim; e.currentTarget.style.borderColor = C.line3; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.faint; e.currentTarget.style.borderColor = C.line2; }}
        >
          Restore
        </button>
      )}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
  </div>
);

export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '96px 1fr 56px', alignItems: 'center', gap: 10 }}>
    <span style={{ color: C.dim, fontSize: 11.5 }}>{label}</span>
    {children}
  </label>
);

/** Dark slider with a visible accent fill + round knob, and an editable value box. */
export const FilledTrack: React.FC<{
  value: number; min: number; max: number; step: number; readOnly: boolean;
  listId?: string; onChange: (v: number) => void;
}> = ({ value, min, max, step, readOnly, listId, onChange }) => {
  const span = max - min || 1;
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  return (
    <div style={{ position: 'relative', height: 14, display: 'flex', alignItems: 'center', minWidth: 0 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, background: C.line2 }} />
      <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: 4, borderRadius: 2, background: ACCENT, opacity: 0.85 }} />
      <div style={{
        position: 'absolute', left: `calc(${pct}% - 6px)`, width: 12, height: 12, borderRadius: '50%',
        background: ACCENT, boxShadow: '0 1px 3px rgba(0,0,0,.5)', pointerEvents: 'none',
      }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        list={listId}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-readonly={readOnly}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0,
          opacity: 0, cursor: readOnly ? 'default' : 'pointer',
          pointerEvents: readOnly ? 'none' : undefined,
        }}
      />
    </div>
  );
};

export const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Shows a live value without allowing direct edits. */
  readOnly?: boolean;
  /** Optional tick marks rendered via <datalist>. */
  ticks?: number[];
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 0.01, readOnly = false, ticks, onChange }) => {
  const listId = React.useId();
  const hasTicks = !!(ticks && ticks.length);
  return (
    <Row label={label}>
      <FilledTrack
        value={Number.isFinite(value) ? value : min}
        min={min} max={max} step={step} readOnly={readOnly}
        listId={hasTicks ? listId : undefined}
        onChange={onChange}
      />
      {hasTicks ? (
        <datalist id={listId}>
          {ticks!.map((t) => <option key={t} value={t} label={String(t)} />)}
        </datalist>
      ) : null}
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        readOnly={readOnly}
        style={{
          width: '100%', textAlign: 'center', padding: '3px 2px',
          background: C.field, color: C.text, border: `1px solid ${C.line2}`, borderRadius: 4,
          fontFamily: 'inherit', fontSize: 11, fontVariantNumeric: 'tabular-nums',
        }}
      />
    </Row>
  );
};

export const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
    <span style={{ color: C.dim, fontSize: 11.5 }}>{label}</span>
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      title={value ? 'On' : 'Off'}
      style={{
        width: 32, height: 17, borderRadius: 999, border: 'none', padding: 0, cursor: 'pointer',
        background: value ? ACCENT : '#2c2c2c', position: 'relative', transition: 'background 150ms', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 17 : 2, width: 13, height: 13, borderRadius: '50%',
        background: value ? '#111' : '#fff', transition: 'left 150ms',
      }} />
    </button>
  </div>
);

export const ColorInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <Row label={label}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 22, height: 22, padding: 0, background: 'transparent', border: `1px solid ${C.line2}`, borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1, minWidth: 0, background: C.field, color: C.text, border: `1px solid ${C.line2}`, borderRadius: 4,
          padding: '3px 6px', fontFamily: 'inherit', fontSize: 11, fontVariantNumeric: 'tabular-nums',
        }}
      />
    </div>
    <span />
  </Row>
);

export const Select: React.FC<{
  label: string;
  value: string | number;
  options: { label: string; value: string | number }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <Row label={label}>
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          background: C.field, color: C.text, border: `1px solid ${C.line2}`, borderRadius: 4,
          padding: '4px 24px 4px 8px', fontFamily: 'inherit', fontSize: 11.5, cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
      <span style={{ position: 'absolute', right: 7, pointerEvents: 'none', color: C.faint, display: 'flex' }}>
        <Icon name="chev" size={11} />
      </span>
    </div>
    <span />
  </Row>
);
