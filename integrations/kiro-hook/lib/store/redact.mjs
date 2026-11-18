// Canary loading and redaction. Canaries live in memory only. Nothing in this
// module writes to disk, to STDOUT, or to STDERR, and no path or value of a
// skipped file is reported.
import { createInspector, compilePathSet, extractCanaries, compareCodePoints } from '@ghost-run/core';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** Replacement text for a canary. */
export const REDACTED = '[redacted]';

/** Most secret files read, in code-point order of the workspace-relative path. */
export const MAX_SECRET_FILES = 16;
/** Most bytes read from one secret file. */
export const MAX_SECRET_BYTES = 65_536;
/** Most directory entries visited while looking for secret files. */
const MAX_WALK_ENTRIES = 100_000;
const SKIP_DIRS = new Set(['node_modules', '.git', '.ghost-run']);
const MIN_NEEDLE = 8;
const INSPECT_CHUNK = 65_536;

/**
 * Secret patterns of every egress ward, in order of appearance.
 * @param {import('@ghost-run/core').WardSet} wardSet
 * @returns {string[]}
 */
function secretPatterns(wardSet) {
  /** @type {string[]} */
  const out = [];
  for (const ward of wardSet.wards) {
    if (ward.kind === 'egress') out.push(...ward.secrets);
  }
  return out;
}

/**
 * Workspace-relative posix paths of regular files that match the patterns.
 * Symbolic links are not followed.
 * @param {string} root
 * @param {(rel: string) => boolean} matches
 * @returns {Promise<string[]>}
 */
async function findSecretFiles(root, matches) {
  /** @type {string[]} */
  const found = [];
  let visited = 0;
  /** @param {string} rel */
  async function walk(rel) {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      visited += 1;
      if (visited > MAX_WALK_ENTRIES) return;
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(childRel);
      } else if (entry.isFile() && matches(childRel)) {
        found.push(childRel);
      }
    }
  }
  await walk('');
  return found;
}

/**
 * Read at most `max` bytes of a file.
 * @param {string} file
 * @param {number} max
 * @returns {Promise<Uint8Array>}
 */
async function readBounded(file, max) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(max);
    const { bytesRead } = await fh.read(buf, 0, max, 0);
    return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
  } finally {
    await fh.close();
  }
}

/**
 * Read the files that match the `secrets` patterns of the `egress` wards from
 * the workspace (at most 16 files in code-point order of the path, 65,536
 * bytes each) and extract their canaries. A file that cannot be read is
 * skipped silently.
 * @param {string} root workspace root
 * @param {import('@ghost-run/core').WardSet} wardSet
 * @returns {Promise<Uint8Array[]>}
 */
export async function loadCanaries(root, wardSet) {
  const patterns = secretPatterns(wardSet);
  if (patterns.length === 0) return [];
  const set = compilePathSet(patterns, { caseSensitive: false });
  const files = (await findSecretFiles(root, (rel) => set.test(rel).matched))
    .sort(compareCodePoints)
    .slice(0, MAX_SECRET_FILES);
  /** @type {Uint8Array[]} */
  const canaries = [];
  for (const rel of files) {
    try {
      const bytes = await readBounded(path.join(root, rel), MAX_SECRET_BYTES);
      canaries.push(...extractCanaries(rel, bytes));
    } catch {
      // Unreadable file: skipped, nothing about it is reported.
    }
  }
  return canaries;
}

/** @param {string} text @returns {string} */
const toBase64Url = (text) => text.replace(/\+/g, '-').replace(/\//g, '_');

/**
 * Text forms of one canary that can appear in a command or record.
 * @param {Uint8Array} canary
 * @returns {string[]}
 */
function forms(canary) {
  const buf = Buffer.from(canary);
  /** @type {Set<string>} */
  const out = new Set();
  const raw = buf.toString('utf8');
  if (!raw.includes('\uFFFD')) {
    out.add(raw);
    const pct = encodeURIComponent(raw);
    out.add(pct);
    out.add(pct.replace(/%20/g, '+'));
  }
  const std = buf.toString('base64');
  out.add(std);
  out.add(std.replace(/=+$/, ''));
  out.add(toBase64Url(std));
  out.add(toBase64Url(std).replace(/=+$/, ''));
  // Base64 groups that lie fully inside the canary at the three alignments.
  for (let offset = 0; offset < 3; offset += 1) {
    const start = Math.ceil((8 * offset) / 6);
    const end = Math.floor((8 * (offset + buf.length)) / 6);
    if (end - start < MIN_NEEDLE) continue;
    const padded = Buffer.concat([Buffer.alloc(offset), buf]);
    const inner = padded.toString('base64').slice(start, end);
    out.add(inner);
    out.add(toBase64Url(inner));
  }
  const hex = buf.toString('hex');
  out.add(hex);
  out.add(hex.toUpperCase());
  let allPct = '';
  for (const b of buf) allPct += `%${b.toString(16).padStart(2, '0')}`;
  out.add(allPct);
  out.add(allPct.toUpperCase());
  return [...out].filter((s) => s.length >= MIN_NEEDLE);
}

/**
 * True when the inspector still finds a canary, in any encoding, in the text.
 * Long texts are inspected in overlapping windows.
 * @param {string} text
 * @param {Uint8Array[]} canaries
 * @param {number} maxLen
 * @returns {boolean}
 */
function stillLeaks(text, canaries, maxLen) {
  const bytes = new TextEncoder().encode(text);
  const overlap = Math.min(2 * maxLen + 16, INSPECT_CHUNK / 2);
  const step = INSPECT_CHUNK - overlap;
  for (let start = 0; start < bytes.length || start === 0; start += step) {
    const window = bytes.subarray(start, start + INSPECT_CHUNK);
    if (createInspector(new Map([['t', window]])).hits(canaries).size > 0) return true;
    if (start + INSPECT_CHUNK >= bytes.length) break;
  }
  return false;
}

/**
 * Replace every canary in the text with `[redacted]`: the raw form, and the
 * base64, base64url, hex, and percent-encoded forms. If the core inspector
 * still finds a canary after the replacements (an unusual spelling), the
 * whole text is replaced, so a canary never survives.
 * @param {string} text
 * @param {readonly Uint8Array[]} canaries
 * @returns {string}
 */
export function redactCanaries(text, canaries) {
  const usable = canaries.filter((c) => c.length >= MIN_NEEDLE);
  if (usable.length === 0 || text.length === 0) return text;
  const needles = [...new Set(usable.flatMap(forms))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const needle of needles) {
    if (out.includes(needle)) out = out.split(needle).join(REDACTED);
  }
  const maxLen = usable.reduce((m, c) => Math.max(m, c.length), 0);
  return stillLeaks(out, usable, maxLen) ? REDACTED : out;
}

/**
 * True when the text holds a canary, raw or in one common encoding (the same
 * test `redactCanaries` uses for its final check). Never reports which canary.
 * @param {string} text
 * @param {readonly Uint8Array[]} canaries
 * @returns {boolean}
 */
export function containsCanary(text, canaries) {
  const usable = canaries.filter((c) => c.length >= MIN_NEEDLE);
  if (usable.length === 0 || text.length === 0) return false;
  const maxLen = usable.reduce((m, c) => Math.max(m, c.length), 0);
  return stillLeaks(text, usable, maxLen);
}
