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
:root{--bg:#14111c;--surface:#1d1928;--text:#ece8f4;--muted:#b4adc6;--pass:#fff1d6;--warn:#ffc247;--block:#ff8585;--line:#8d86a6;--focus:#8ab4ff}
body{margin:0;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5;color:var(--text);background:var(--bg)}
main{max-width:56rem;margin:0 auto}
h1{font-size:1.5rem;margin:0 0 12px}h2{font-size:1.1rem;margin:12px 0 4px}
section{margin:0 0 16px;padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
code,.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;overflow-wrap:anywhere}
a{color:var(--focus)}ul{padding-left:20px;margin:4px 0}.note{color:var(--muted)}
.candle{font-weight:700}.pass{color:var(--pass)}.warn{color:var(--warn)}.block{color:var(--block)}
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
 * @returns {string}
 */
export function text(v) {
  let s = typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v) ?? '';
  const cps = [...s];
  if (cps.length > MAX_VALUE) s = `${cps.slice(0, MAX_VALUE - 3).join('')}...`;
  s = s.replace(HIDDEN_RE, (c) => `\\u{${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`);
  return escapeHtml(s);
}

/**
 * @param {string} title
 * @param {string} body
 * @returns {string}
 */
function page(title, body) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${text(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>\n`;
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
  let out = `<section><h2>Verdict</h2><p class="candle ${v ?? ''}">Candle ${text(label)}</p>`;
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
 * @param {readonly GraveEntry[]} entries Oldest first, as the file order.
 * @param {number} corrupt
 * @returns {string}
 */
export function renderList(entries, corrupt) {
  const newest = [...entries].reverse();
  const shown = newest.slice(0, MAX_LIST);
  let body = '<h1>Ghost Run+ graveyard</h1>';
  if (entries.length === 0) {
    body += '<section><p>The graveyard is empty. A blocked or warned command appears here.</p></section>';
  } else {
    body += `<section><p class="mono">${entries.length} graves${entries.length > shown.length ? `, newest ${shown.length} shown` : ''}</p><ul>`;
    body += shown
      .map((e) => `<li><a href="/seance/${text(e.id)}"><code>${text(e.command)}</code></a><br><span class="mono">${text(e.recordedAt)} ${text(e.wardIds.join(', '))}</span></li>`)
      .join('');
    body += '</ul></section>';
  }
  if (corrupt > 0) body += `<p class="note">${corrupt} unreadable lines were skipped.</p>`;
  return page('Ghost Run+ graveyard', body);
}

/**
 * @param {GraveEntry} entry
 * @returns {string}
 */
export function renderGrave(entry) {
  const d = isObj(entry.detail) ? entry.detail : {};
  let body = '<h1>Seance</h1><p><a href="/seance/">Back to the graveyard</a></p>';
  body += `<section><p><code>${text(entry.command)}</code></p><p class="mono">${text(entry.recordedAt)}</p><p class="mono">${text(entry.wardIds.join(', '))}</p></section>`;
  body += verdictHtml(d.wardVerdict) + changesHtml(d.changes) + claimsHtml(d.claims) + threadHtml(d.links);
  return page(`Seance ${entry.id}`, body);
}

/**
 * @param {string} title
 * @param {string} message
 * @returns {string}
 */
export function renderMessage(title, message) {
  return page(title, `<h1>${text(title)}</h1><p>${text(message)}</p><p><a href="/seance/">Back to the graveyard</a></p>`);
}
