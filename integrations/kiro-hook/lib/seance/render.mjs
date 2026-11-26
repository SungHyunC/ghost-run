// Seance pages (Requirement 26): plain HTML in the style of the UI kit, with no script.
// Every value from the graveyard passes `text()` (hidden and control characters shown as
// \u{...} escapes, then HTML-escaped) before it reaches the page.
import { createHash } from 'node:crypto';

/** @typedef {import('@ghost-run/ui').GraveEntry} GraveEntry */

/** Most graves on the list page. */
export const MAX_LIST = 200;
const MAX_VALUE = 500;
const MAX_ITEMS = 50;

// Dark tokens of the kit (ui/src/theme/tokens.ts), repeated here because the kit is TSX source.
const STYLE = `
:root{--bg:#14111c;--surface:#1d1928;--fog:rgba(176,170,204,0.10);--text:#ece8f4;--muted:#b4adc6;--pass:#fff1d6;--warn:#ffc247;--block:#ff8585;--line:#8d86a6;--focus:#8ab4ff;--flame:#fff1d6}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5;color:var(--text);background:var(--bg) radial-gradient(ellipse at 50% -10%,#2a2340 0,var(--bg) 60%) no-repeat}
main{max-width:56rem;margin:0 auto}
header{display:flex;align-items:center;gap:12px;margin:0 0 20px;padding:0 0 12px;border-bottom:1px solid var(--line)}
header svg{flex:none}.brand{font-weight:700;letter-spacing:.02em}.brand span{color:var(--flame)}
.tag{margin-left:auto;color:var(--muted);font-size:.85rem}
h1{font-size:1.5rem;margin:0 0 12px}h2{font-size:1.1rem;margin:12px 0 4px}
section{margin:0 0 16px;padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
code,.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.9rem;overflow-wrap:anywhere}
pre.cmd{margin:8px 0;padding:12px;border-radius:6px;background:var(--bg);border:1px solid var(--line);font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere}
a{color:var(--focus)}a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
ul{padding-left:20px;margin:4px 0}.note{color:var(--muted)}
ul.graves{list-style:none;padding:0;margin:0}
.graves li{border-top:1px solid var(--line)}.graves li:first-child{border-top:0}
.graves a{display:grid;grid-template-columns:auto auto 1fr;gap:4px 12px;align-items:baseline;padding:8px 4px;text-decoration:none;color:var(--text)}
.graves a:hover{background:var(--fog)}
.graves .when{color:var(--muted)}.graves .wards{color:var(--muted)}.graves .first{grid-column:1 / 4}
.badge{display:inline-block;padding:1px 10px;border:1px solid currentColor;border-radius:999px;font-size:.8rem;font-weight:700;white-space:nowrap}
.candle{font-weight:700}.pass{color:var(--pass)}.warn{color:var(--warn)}.block{color:var(--block)}.unknown{color:var(--muted)}
`;

/** CSP of every page: no script, no connect, no frame; the one style block is pinned by hash. */
export const CSP = `default-src 'none'; style-src 'sha256-${createHash('sha256').update(STYLE).digest('base64')}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

/**
 * HTML-escape text.
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Control, bidi, zero-width, tag, and BOM characters, and lone surrogates.
const HIDDEN_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;

/**
 * A value as page text: hidden characters become visible escapes, long values are cut, then HTML-escaped.
 * @param {unknown} v
 * @param {number} [max] Code points kept (default 500).
 * @returns {string}
 */
export function text(v, max = MAX_VALUE) {
  let s = typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v) ?? '';
  const cps = [...s];
  if (cps.length > max) s = `${cps.slice(0, max - 3).join('')}...`;
  s = s.replace(HIDDEN_RE, (c) => `\\u{${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`);
  return escapeHtml(s);
}

const HEADER = '<header><svg width="28" height="36" viewBox="0 0 28 36" role="img" aria-label="Ghost Run+ candle"><path d="M14 1c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="#fff1d6"/><rect x="9" y="19" width="10" height="15" rx="2" fill="#b4adc6"/><rect x="7" y="33" width="14" height="2" rx="1" fill="#8d86a6"/></svg><span class="brand">Ghost Run<span>+</span></span><span class="tag">Let your agent\'s ghost try it first.</span></header>';
/** Longest command shown in full on a grave page (the gate accepts at most 4096 code points). */
const MAX_COMMAND = 4096;
/** Longest first-line preview in the list, in code points. */
export const LIST_COMMAND_MAX = 120;

/**
 * @param {string} title
 * @param {string} body
 * @returns {string}
 */
function page(title, body) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${text(title)}</title><style>${STYLE}</style></head><body><main>${HEADER}${body}</main></body></html>\n`;
}

/** @param {unknown} x @returns {x is Record<string, unknown>} */
function isObj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

const CANDLE = { pass: 'lit (pass)', warn: 'flickering (warn)', block: 'out (block)' };

/**
 * @param {unknown} verdict
 * @returns {string}
 */
function verdictHtml(verdict) {
  if (!isObj(verdict)) return '<section><h2>Verdict</h2><p class="note">No verdict was recorded.</p></section>';
  const v = typeof verdict.verdict === 'string' && verdict.verdict in CANDLE ? verdict.verdict : undefined;
  const label = v === undefined ? 'unknown' : CANDLE[/** @type {'pass'|'warn'|'block'} */ (v)];
  const violations = Array.isArray(verdict.violations) ? verdict.violations.filter(isObj).slice(0, MAX_ITEMS) : [];
  const notices = Array.isArray(verdict.notices) ? verdict.notices.filter(isObj).slice(0, MAX_ITEMS) : [];
  let out = `<section><h2>Verdict</h2><p class="candle">Ward verdict <span class="badge ${v ?? 'unknown'}">${text(label)}</span></p>`;
  out += '<h2>Wards</h2>';
  out += violations.length === 0
    ? '<p class="note">No ward was violated.</p>'
    : `<ul>${violations.map((w) => `<li><code>${text(w.wardId)}</code> (${text(w.wardKind)}): ${text(w.reason)}</li>`).join('')}</ul>`;
  if (notices.length > 0) {
    out += `<h2>Needs approval</h2><ul>${notices.map((n) => `<li>${text(n.kind)}: ${text(n.reason)}</li>`).join('')}</ul>`;
  }
  return `${out}</section>`;
}

/**
 * One line per change.
 * @param {unknown} c
 * @returns {string}
 */
function changeLine(c) {
  if (!isObj(c)) return text(c);
  if (c.kind === 'sql-row-count') {
    return `sql-row-count ${text(c.table)}: ${text(c.rowsBefore)} to ${text(c.rowsAfter)} rows${c.dropped === true ? ' (table dropped)' : ''}`;
  }
  if (typeof c.path === 'string') return `${text(c.kind)} ${text(c.path)}`;
  return text(c);
}

/**
 * @param {unknown} changes
 * @returns {string}
 */
function changesHtml(changes) {
  const flat = Array.isArray(changes) ? changes.flatMap((step) => (Array.isArray(step) ? step : [step])) : [];
  if (flat.length === 0) return '<section><h2>Diff summary</h2><p class="note">No change was recorded.</p></section>';
  const shown = flat.slice(0, MAX_ITEMS);
  const more = flat.length - shown.length;
  return `<section><h2>Diff summary</h2><ul>${shown.map((c) => `<li class="mono">${changeLine(c)}</li>`).join('')}</ul>${more > 0 ? `<p class="note">+${more} more changes.</p>` : ''}</section>`;
}

/**
 * @param {unknown} claims
 * @returns {string}
 */
function claimsHtml(claims) {
  if (!isObj(claims)) return '<section><h2>Claims</h2><p class="note">No claims were recorded.</p></section>';
  const row = (/** @type {string} */ k) => `<li>${k}: ${claims[`${k.toLowerCase()}Claimed`] === true ? 'claimed' : 'NOT claimed'}</li>`;
  const planB = claims.p1Claimed !== true
    ? '<p class="note">No ghost rehearsal in a sealed box took place for this run (static analysis only). P1, P5, and P6 are not guaranteed.</p>'
    : '';
  return `<section><h2>Claims</h2><p>Isolation mode: <code>${text(claims.mode)}</code></p><ul>${row('P1')}${row('P5')}${row('P6')}</ul>${planB}</section>`;
}

/**
 * @param {unknown} links
 * @returns {string}
 */
function threadHtml(links) {
  if (!Array.isArray(links) || links.length === 0) return '';
  const items = links.filter(isObj).slice(0, MAX_ITEMS).map((l) => {
    const needle = isObj(l.needle) ? text(l.needle.value) : '';
    if (l.status !== 'found') return `<li><code>${needle}</code>: not found in any recorded source.</li>`;
    return `<li><code>${needle}</code> comes from <code>${text(l.source)}</code>, line ${text(l.line)}, column ${text(l.column)}${l.hidden === true ? ' (hidden characters)' : ''}:<br><code>${text(l.lineText)}</code></li>`;
  });
  return `<section><h2>Red thread</h2><ul>${items.join('')}</ul></section>`;
}

/**
 * First line of a command, cut to LIST_COMMAND_MAX code points with an ellipsis.
 * An ellipsis also marks a command that has more lines.
 * @param {string} command
 * @returns {string} Plain text, not yet escaped.
 */
export function firstLine(command) {
  const lines = command.split(/\r\n|\r|\n|\u2028|\u2029/);
  const first = [...(lines[0] ?? '')];
  const cut = first.length > LIST_COMMAND_MAX;
  const head = (cut ? first.slice(0, LIST_COMMAND_MAX - 1) : first).join('');
  return cut || lines.length > 1 ? `${head}\u2026` : head;
}

/**
 * Candle of a grave as a colored badge: the gate's final decision, not the ward verdict.
 * A grave exists only because the gate blocked (out) or asked (flickering).
 * @param {GraveEntry} e
 * @returns {string}
 */
function badgeOf(e) {
  const d = isObj(e.detail) ? e.detail : {};
  const out = isObj(d.wardVerdict) && d.wardVerdict.verdict === 'block';
  return `<span class="badge ${out ? 'block' : 'warn'}">${out ? 'out' : 'flickering'}</span>`;
}

/**
 * Note for a grave whose ward verdict is pass: a gate rule asked. Uses the entry's notices when present.
 * @param {GraveEntry} e
 * @returns {string}
 */
function gateNoteHtml(e) {
  const d = isObj(e.detail) ? e.detail : {};
  const wv = d.wardVerdict;
  if (!isObj(wv) || wv.verdict !== 'pass') return '';
  const notices = Array.isArray(wv.notices) ? wv.notices.filter(isObj).slice(0, MAX_ITEMS) : [];
  const why = notices.length > 0
    ? `<ul>${notices.map((n) => `<li>${text(n.reason)}</li>`).join('')}</ul>`
    : '';
  return `<section><h2>Gate rule</h2><p>No ward was violated, but a gate rule asked for approval (for example the self-protection floor for gate-protected paths).</p>${why}</section>`;
}

/**
 * @param {readonly GraveEntry[]} entries Oldest first, as the file order.
 * @param {number} corrupt
 * @returns {string}
 */
export function renderList(entries, corrupt) {
  const newest = [...entries].reverse();
  const shown = newest.slice(0, MAX_LIST);
  let body = '<h1>Graveyard</h1>';
  if (entries.length === 0) {
    body += '<section><p>The graveyard is empty. A blocked or warned command appears here.</p></section>';
  } else {
    body += `<section><p class="mono note">${entries.length} ${entries.length === 1 ? 'grave' : 'graves'}${entries.length > shown.length ? `, newest ${shown.length} shown` : ''}</p><ul class="graves">`;
    body += shown
      .map((e) => `<li><a href="/seance/${text(e.id)}"><span class="mono when">${text(e.recordedAt)}</span>${badgeOf(e)}<span class="mono wards">${text(e.wardIds.join(', '))}</span><code class="first">${text(firstLine(e.command))}</code></a></li>`)
      .join('');
    body += '</ul></section>';
  }
  if (corrupt > 0) body += `<p class="note">${corrupt} unreadable lines were skipped.</p>`;
  return page('Graveyard \u00B7 Ghost Run+', body);
}

/**
 * @param {GraveEntry} entry
 * @returns {string}
 */
export function renderGrave(entry) {
  const d = isObj(entry.detail) ? entry.detail : {};
  let body = '<h1>Seance</h1><p><a href="/seance/">Back to the graveyard</a></p>';
  body += `<section>${badgeOf(entry)}<pre class="cmd">${text(entry.command, MAX_COMMAND)}</pre><p class="mono">${text(entry.recordedAt)}</p><p class="mono">${text(entry.wardIds.join(', '))}</p></section>`;
  body += gateNoteHtml(entry) + verdictHtml(d.wardVerdict) + changesHtml(d.changes) + claimsHtml(d.claims) + threadHtml(d.links);
  return page('Seance \u00B7 Ghost Run+', body);
}

/**
 * @param {string} title
 * @param {string} message
 * @returns {string}
 */
export function renderMessage(title, message) {
  return page(`${title} \u00B7 Ghost Run+`, `<h1>${text(title)}</h1><p>${text(message)}</p><p><a href="/seance/">Back to the graveyard</a></p>`);
}
