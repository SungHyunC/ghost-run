// Pure scanner for the built gallery (`ui/dist`). No file access, no clock, no network.
// Requirements 13.3, 13.4, 12.11.

export interface DistFile {
  readonly path: string;
  readonly text: string;
}

export type DistRule =
  | 'external-origin'
  | 'foreign-reference'
  | 'network-api'
  | 'analytics'
  | 'remote-font'
  | 'inline-script'
  | 'csp-missing'
  | 'file-type'
  | 'axe-core';

export interface Violation {
  readonly rule: DistRule;
  readonly path: string;
  readonly detail: string;
}

export interface AllowEntry {
  readonly rule: DistRule;
  /** A violation is suppressed when its detail contains this text. */
  readonly contains: string;
  readonly reason: string;
}

/** The exact policy string injected by `vite.config.ts`. */
export const CSP_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'";

export const ALLOWED_EXTENSIONS: readonly string[] = ['html', 'js', 'css', 'svg', 'txt'];
export const RESERVED_HOST_SUFFIXES: readonly string[] = ['.example', '.test', '.localhost', '.invalid'];

const W3 = 'http' + ':/' + '/www.w3.org/';
/** W3C namespace identifiers: compared as text, never requested. */
export const W3C_NAMESPACES: readonly string[] = [
  W3 + '2000/svg',
  W3 + '1999/xhtml',
  W3 + '1998/Math/MathML',
  W3 + '1999/xlink',
  W3 + 'XML/1998/namespace',
];

/** Entries recorded after the first build (task 9.3, Open Question Q5), each with a reason. */
export const DIST_ALLOW_LIST: readonly AllowEntry[] = [
  {
    rule: 'external-origin',
    contains: '/errors/"+',
    reason:
      'React production error decoder (docs host of the React project, path /errors/): a string prefix that is only concatenated into an error message text (two copies, react and react-dom). It is never requested; the CSP also sets connect-src none.',
  },
  {
    rule: 'external-origin',
    contains: 'curl -d @.env https://${',
    reason:
      'Gallery sample data: a displayed command string (a possession example) whose host is a template variable bound to a reserved .example host. It is text on screen, not a URL the page loads.',
  },
  {
    rule: 'analytics',
    contains: 'segment: {number:',
    reason:
      'False positive on the word "segment": the red-thread view of the kit names its line parts "segments". No analytics library is present.',
  },
  {
    rule: 'inline-script',
    contains: "javascript:throw new Error('React has blocked",
    reason:
      'React DOM message text for a blocked javascript: URL (the safety check that refuses such URLs). It is a string in an error, not a link and not an executed script.',
  },
];

const NETWORK_PATTERNS: readonly RegExp[] = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /new\s+WebSocket/,
  /sendBeacon/,
  /new\s+EventSource/,
  /importScripts/,
  /serviceWorker\.register/,
];

const ANALYTICS_WORDS: readonly string[] = [
  'gtag(',
  'googletagmanager',
  'google-analytics',
  'plausible',
  'mixpanel',
  'segment',
  'hotjar',
  'sentry',
  'datadog',
  'newrelic',
  'clarity.ms',
  'fullstory',
];

const AXE_PATTERN = /axe-core|\baxe\.(?:run|configure|version)\b|axe\._|"wcag2aa?"/;

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 40);
  return text.slice(start, end).replace(/\s+/g, ' ');
}

function extension(path: string): string {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function hostOf(url: string): string {
  const rest = url.replace(/^(?:https?:)?\/\//i, '');
  const authority = rest.split(/[/?#]/)[0] ?? '';
  const afterUser = authority.slice(authority.lastIndexOf('@') + 1);
  return (afterUser.split(':')[0] ?? '').toLowerCase();
}

function isReservedHost(host: string): boolean {
  return RESERVED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isNamespace(url: string): boolean {
  return W3C_NAMESPACES.some((ns) => {
    if (!url.startsWith(ns)) return false;
    const next = url.charAt(ns.length);
    return next === '' || !/[A-Za-z0-9/]/.test(next);
  });
}

/** True when the value points at another origin (scheme or protocol-relative). */
function isNonRelative(value: string): boolean {
  const v = value.trim();
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v);
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!m) return undefined;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
}

/** Decodes the entities that Vite writes into attribute values (a browser decodes them the same way). */
function decodeEntities(value: string): string {
  return value
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

const REFERENCE_ATTRS: Readonly<Record<string, string>> = {
  script: 'src',
  link: 'href',
  img: 'src',
  iframe: 'src',
  form: 'action',
};

function scanExternalOrigins(file: DistFile, out: Violation[]): void {
  const { text, path } = file;
  const absolute = /https?:\/\/[^\s"'`<>)\\,;]+/gi;
  for (const m of text.matchAll(absolute)) {
    const url = m[0];
    if (isNamespace(url) || isReservedHost(hostOf(url))) continue;
    out.push({ rule: 'external-origin', path, detail: snippet(text, m.index, url.length) });
  }
  const relativeProtocol = /(?<![:\w/.])\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\//gi;
  for (const m of text.matchAll(relativeProtocol)) {
    if (isReservedHost((m[1] ?? '').toLowerCase())) continue;
    out.push({ rule: 'external-origin', path, detail: snippet(text, m.index, m[0].length) });
  }
}

function scanHtmlReferences(file: DistFile, out: Violation[]): void {
  const { text, path } = file;
  for (const m of text.matchAll(/<(script|link|img|iframe|form)\b[^>]*>/gi)) {
    const name = (m[1] ?? '').toLowerCase();
    const value = attr(m[0], REFERENCE_ATTRS[name] ?? '');
    if (value !== undefined && isNonRelative(value)) {
      out.push({ rule: 'foreign-reference', path, detail: `<${name}> ${REFERENCE_ATTRS[name]}=${value.slice(0, 80)}` });
    }
  }
  for (const m of text.matchAll(/<script\b([^>]*)>/gi)) {
    if (attr(m[0], 'src') === undefined) {
      out.push({ rule: 'inline-script', path, detail: snippet(text, m.index, m[0].length) });
    }
  }
}

function scanCssReferences(file: DistFile, out: Violation[]): void {
  const { text, path } = file;
  for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]*)/gi)) {
    if (isNonRelative(m[1] ?? '')) {
      out.push({ rule: 'foreign-reference', path, detail: `@import ${(m[1] ?? '').slice(0, 80)}` });
    }
  }
  for (const m of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    const arg = m[1] ?? m[2] ?? m[3] ?? '';
    if (arg === '' || arg.startsWith('#')) continue;
    if (isNonRelative(arg)) {
      out.push({ rule: 'foreign-reference', path, detail: `url(${arg.slice(0, 80)})` });
    }
  }
  for (const m of text.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
    for (const u of m[0].matchAll(/url\(\s*["']?([^"')\s]*)/gi)) {
      if (isNonRelative(u[1] ?? '')) {
        out.push({ rule: 'remote-font', path, detail: `@font-face url(${(u[1] ?? '').slice(0, 80)})` });
      }
    }
  }
}

function scanContent(file: DistFile, out: Violation[]): void {
  const { text, path } = file;
  for (const pattern of NETWORK_PATTERNS) {
    const m = pattern.exec(text);
    if (m) out.push({ rule: 'network-api', path, detail: snippet(text, m.index, m[0].length) });
  }
  const lower = text.toLowerCase();
  for (const word of ANALYTICS_WORDS) {
    const index = lower.indexOf(word);
    if (index >= 0) out.push({ rule: 'analytics', path, detail: `${word}: ${snippet(text, index, word.length)}` });
  }
  const fonts = /\/\/fonts\./i.exec(text);
  if (fonts) out.push({ rule: 'remote-font', path, detail: snippet(text, fonts.index, fonts[0].length) });
  const js = /javascript:/i.exec(text);
  if (js) out.push({ rule: 'inline-script', path, detail: snippet(text, js.index, js[0].length) });
  const axe = AXE_PATTERN.exec(text);
  if (axe) out.push({ rule: 'axe-core', path, detail: snippet(text, axe.index, axe[0].length) });
}

function scanCsp(files: readonly DistFile[], out: Violation[]): void {
  const index = files.find((f) => f.path === 'index.html' || f.path.endsWith('/index.html'));
  if (!index) {
    out.push({ rule: 'csp-missing', path: 'index.html', detail: 'index.html not found' });
    return;
  }
  const ok = [...index.text.matchAll(/<meta\b[^>]*>/gi)].some((m) => {
    const equiv = attr(m[0], 'http-equiv');
    const content = attr(m[0], 'content');
    return equiv?.toLowerCase() === 'content-security-policy' && content === CSP_POLICY;
  });
  if (!ok) {
    out.push({ rule: 'csp-missing', path: index.path, detail: 'CSP meta tag missing or policy string differs' });
  }
}

/** Returns every violation found in the given files. An empty array means the dist is clean. */
export function scanDist(files: readonly DistFile[], allow: readonly AllowEntry[] = DIST_ALLOW_LIST): Violation[] {
  const out: Violation[] = [];
  for (const file of files) {
    const ext = extension(file.path);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      out.push({ rule: 'file-type', path: file.path, detail: `file type .${ext || '(none)'} is not allowed` });
      continue;
    }
    scanExternalOrigins(file, out);
    scanContent(file, out);
    if (ext === 'html') scanHtmlReferences(file, out);
    if (ext === 'css' || ext === 'html') scanCssReferences(file, out);
  }
  scanCsp(files, out);
  return out.filter((v) => !allow.some((a) => a.rule === v.rule && v.detail.includes(a.contains)));
}
