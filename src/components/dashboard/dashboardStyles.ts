import { C } from '../../lib/designTokens';

/* Hover and focus states can't be expressed with inline styles, so the
   dashboard injects this small sheet. Every class is prefixed `cdash-`. */
export const DASHBOARD_CSS = `
.cdash-root { position: fixed; inset: 0; z-index: 900; background: ${C.bg}; color: ${C.text};
  font-family: ${C.font}; display: flex; flex-direction: column; }
.cdash-scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
.cdash-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
  border-radius: 6px; border: 1px solid ${C.line2}; background: ${C.chip}; color: ${C.dim};
  font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.cdash-btn:hover { color: ${C.text}; border-color: ${C.line3}; background: #202020; }
.cdash-btn:focus-visible, .cdash-card:focus-visible, .cdash-row:focus-visible, .cdash-del:focus-visible {
  outline: 2px solid ${C.blue}; outline-offset: 2px; }
.cdash-btn.primary { background: ${C.blue}; border-color: ${C.blue}; color: #fff; }
.cdash-btn.primary:hover { background: #2b7bf5; }
.cdash-btn.danger { background: ${C.red}; border-color: ${C.red}; color: #fff; }
.cdash-btn.danger:hover { background: #ff5c53; }
.cdash-btn:disabled { opacity: .5; cursor: default; }
.cdash-seg { display: inline-flex; border: 1px solid ${C.line2}; border-radius: 6px; overflow: hidden; }
.cdash-seg button { height: 28px; width: 34px; display: grid; place-items: center; border: 0;
  background: ${C.chip}; color: ${C.faint}; cursor: pointer; }
.cdash-seg button[aria-pressed="true"] { background: #262626; color: ${C.text}; }
.cdash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }
.cdash-card { position: relative; display: flex; flex-direction: column; text-align: left; padding: 0;
  border-radius: 10px; border: 1px solid ${C.line}; background: ${C.raise}; color: inherit; font: inherit;
  cursor: pointer; overflow: hidden; transition: border-color .12s, transform .12s; }
.cdash-card:hover { border-color: ${C.line3}; transform: translateY(-1px); }
.cdash-card.active, .cdash-row.active { border-color: ${C.blue}; }
.cdash-del { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; display: grid;
  place-items: center; border-radius: 6px; border: 1px solid #ffffff22; background: #000000b0;
  color: #ddd; cursor: pointer; opacity: 0; transition: opacity .12s; }
.cdash-card:hover .cdash-del, .cdash-row:hover .cdash-del, .cdash-del:focus-visible { opacity: 1; }
.cdash-del:hover { color: #fff; background: ${C.red}; border-color: ${C.red}; }
.cdash-row .cdash-del { position: static; background: transparent; border-color: transparent; color: ${C.faint}; }
.cdash-list { display: flex; flex-direction: column; border: 1px solid ${C.line}; border-radius: 10px; overflow: hidden; }
.cdash-row { position: relative; display: grid; align-items: center; gap: 16px; padding: 10px 14px;
  grid-template-columns: 112px minmax(160px, 1.4fr) 80px minmax(180px, 2fr) 72px 92px 32px;
  border: 1px solid transparent; border-bottom-color: ${C.line}; background: ${C.raise};
  color: inherit; font: inherit; text-align: left; cursor: pointer; }
.cdash-row:last-child { border-bottom-color: transparent; }
.cdash-row:hover { background: #151515; }
.cdash-row.head { cursor: default; background: ${C.bar}; padding-top: 8px; padding-bottom: 8px;
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: ${C.fainter}; }
@media (max-width: 860px) {
  .cdash-row { grid-template-columns: 96px 1fr 32px; }
  .cdash-row .cdash-wide { display: none; }
  .cdash-scroll { padding: 16px; }
}
`;
