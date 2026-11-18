/**
 * Redaction of secret values from command output (Requirements 3.7, 7.8, 8.3, 17.7, 19.6, 20.3,
 * Property 18). `cat .env` writes the file content to a step's stdout; the Playground_Run must
 * hold no secret content, so the secret values are replaced by a fixed placeholder in the step
 * views. Pure: no clock, random source, or storage.
 */

export const REDACTED = '[redacted]';

const MIN_LEN = 4;
const TOKEN = /[A-Za-z0-9_.+/=-]{8,}/g;

function toBase64(bytes: Uint8Array): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += table[(n >> 18) & 63]! + table[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? table[(n >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? table[n & 63]! : '=';
  }
  return out;
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const pctAll = (bytes: Uint8Array): string => Array.from(bytes, (b) => '%' + b.toString(16).padStart(2, '0')).join('');

function forms(text: string): string[] {
  const bytes = new TextEncoder().encode(text);
  const b64 = toBase64(bytes);
  const h = hex(bytes);
  const p = pctAll(bytes);
  return [
    text,
    b64,
    b64.replace(/=+$/, ''),
    b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    h,
    h.toUpperCase(),
    p,
    p.toUpperCase(),
    encodeURIComponent(text),
  ];
}

/** Candidate secret strings of one file: the whole content, each line, each value after `=`, each long token. */
function candidates(content: string): string[] {
  const out = new Set<string>([content, content.trim()]);
  for (const line of content.split(/\r?\n/)) {
    out.add(line);
    const eq = line.indexOf('=');
    if (eq >= 0) out.add(line.slice(eq + 1).trim());
    for (const m of line.matchAll(TOKEN)) out.add(m[0]);
  }
  return [...out].filter((c) => c.length >= MIN_LEN);
}

/** Builds a function that replaces every secret value and its encoded forms with the placeholder. */
export function makeRedactor(secretFiles: Iterable<Uint8Array>): (text: string) => string {
  const needles = new Set<string>();
  for (const bytes of secretFiles) {
    for (const c of candidates(new TextDecoder().decode(bytes))) {
      for (const f of forms(c)) if (f.length >= MIN_LEN) needles.add(f);
    }
  }
  const ordered = [...needles].sort((a, b) => b.length - a.length);
  return (text) => {
    let out = text;
    for (const n of ordered) if (out.includes(n)) out = out.split(n).join(REDACTED);
    return out;
  };
}
