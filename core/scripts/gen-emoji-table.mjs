#!/usr/bin/env node
// Dev-time generator for the two Unicode tables used by the possession detector.
// Node 20+, no dependencies. ASCII only: this file contains no hidden character,
// tag character, or emoji, and it writes none.
//
// Usage:
//   node scripts/gen-emoji-table.mjs [--source <dir>] [--update-pin] [--check]
//                                    [--pin <file>] [--out <dir>]
//
//   --source <dir>  read emoji-data.txt and emoji-sequences.txt from <dir> (no network)
//   --update-pin    write the SHA-256 of both source files into the pin file
//   --check         regenerate in memory; exit non-zero if a committed file differs
//   --pin <file>    pin file path (default: scripts/emoji-data.pin.json)
//   --out <dir>     output directory (default: src/possession)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CORE_DIR = resolve(SCRIPT_DIR, '..');

const EMOJI_DATA_FILE = 'emoji-data.txt';
const EMOJI_SEQUENCES_FILE = 'emoji-sequences.txt';
const EMOJI_TABLE_FILE = 'emoji-table.generated.ts';
const TAG_TABLE_FILE = 'tag-sequence-table.generated.ts';

const TAG_BASE = 0x1f3f4;
const CANCEL_TAG = 0xe007f;
const TAG_INNER_LO = 0xe0020;
const TAG_INNER_HI = 0xe007e;

const LICENSE_URL = 'https://www.unicode.org/license.txt';

class GenError extends Error {}

function fail(message) {
  throw new GenError(message);
}

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function parseArgs(argv) {
  const opts = { source: null, updatePin: false, check: false, pin: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--update-pin') opts.updatePin = true;
    else if (arg === '--check') opts.check = true;
    else if (arg === '--source' || arg === '--pin' || arg === '--out') {
      const value = argv[++i];
      if (value === undefined) fail('missing value for ' + arg);
      if (arg === '--source') opts.source = value;
      else if (arg === '--pin') opts.pin = value;
      else opts.out = value;
    } else {
      fail('unknown argument: ' + arg);
    }
  }
  if (opts.check && opts.updatePin) fail('--check and --update-pin cannot be combined');
  return opts;
}

function readPin(pinPath) {
  let pin;
  try {
    pin = JSON.parse(readFileSync(pinPath, 'utf8'));
  } catch (err) {
    fail('cannot read pin file ' + pinPath + ': ' + err.message);
  }
  const okEntry = (e) =>
    e !== null &&
    typeof e === 'object' &&
    typeof e.url === 'string' &&
    (e.sha256 === null || e.sha256 === '' || /^[0-9a-f]{64}$/.test(e.sha256));
  if (
    typeof pin.unicodeVersion !== 'string' ||
    typeof pin.emojiVersion !== 'string' ||
    !okEntry(pin.emojiData) ||
    !okEntry(pin.emojiSequences)
  ) {
    fail('pin file has an invalid shape: ' + pinPath);
  }
  return pin;
}

async function loadSource(opts, name, url) {
  if (opts.source !== null) {
    const path = join(opts.source, name);
    if (!existsSync(path)) fail('source file not found: ' + path);
    return readFileSync(path);
  }
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    fail('fetch failed for ' + url + ': ' + err.message);
  }
  if (!res.ok) fail('fetch failed for ' + url + ': HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

function stripComment(line) {
  const idx = line.indexOf('#');
  return (idx >= 0 ? line.slice(0, idx) : line).trim();
}

function parseHex(token, where) {
  if (!/^[0-9A-Fa-f]{1,6}$/.test(token)) fail('bad hex value "' + token + '" at ' + where);
  const value = parseInt(token, 16);
  if (value > 0x10ffff) fail('code point out of range "' + token + '" at ' + where);
  return value;
}

export function parseExtendedPictographic(text) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const body = stripComment(lines[n]);
    if (body === '') continue;
    const fields = body.split(';').map((f) => f.trim());
    if (fields.length < 2 || fields[1] !== 'Extended_Pictographic') continue;
    const where = EMOJI_DATA_FILE + ':' + (n + 1);
    const parts = fields[0].split('..');
    if (parts.length > 2) fail('bad range "' + fields[0] + '" at ' + where);
    const lo = parseHex(parts[0], where);
    const hi = parts.length === 2 ? parseHex(parts[1], where) : lo;
    if (hi < lo) fail('inverted range "' + fields[0] + '" at ' + where);
    ranges.push([lo, hi]);
  }
  if (ranges.length === 0) fail('no Extended_Pictographic entries found in ' + EMOJI_DATA_FILE);
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [lo, hi] of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && lo <= last[1] + 1) {
      if (hi > last[1]) last[1] = hi;
    } else {
      merged.push([lo, hi]);
    }
  }
  return merged;
}

function compareLists(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export function parseTagSequences(text) {
  const seqs = [];
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const body = stripComment(lines[n]);
    if (body === '') continue;
    const fields = body.split(';').map((f) => f.trim());
    if (fields.length < 2 || fields[1] !== 'RGI_Emoji_Tag_Sequence') continue;
    const where = EMOJI_SEQUENCES_FILE + ':' + (n + 1);
    const seq = fields[0].split(/\s+/).map((t) => parseHex(t, where));
    if (seq.length < 3) fail('tag sequence shorter than three code points at ' + where);
    if (seq[0] !== TAG_BASE) fail('tag sequence does not start with U+1F3F4 at ' + where);
    if (seq[seq.length - 1] !== CANCEL_TAG) fail('tag sequence does not end with U+E007F at ' + where);
    for (let i = 1; i < seq.length - 1; i++) {
      if (seq[i] < TAG_INNER_LO || seq[i] > TAG_INNER_HI) {
        fail('tag sequence has an out-of-range inner code point at ' + where);
      }
    }
    seqs.push(seq);
  }
  seqs.sort(compareLists);
  for (let i = 1; i < seqs.length; i++) {
    if (compareLists(seqs[i - 1], seqs[i]) === 0) fail('duplicate tag sequence in ' + EMOJI_SEQUENCES_FILE);
  }
  return seqs;
}

function hex(n) {
  return '0x' + n.toString(16).toUpperCase();
}

function lowerHex(n) {
  return n.toString(16);
}

export function emojiTableChecksum(ranges) {
  return sha256Hex(ranges.map(([lo, hi]) => lowerHex(lo) + '-' + lowerHex(hi) + '\n').join(''));
}

export function tagTableChecksum(seqs) {
  return sha256Hex(seqs.map((s) => s.map(lowerHex).join(' ') + '\n').join(''));
}

function renderEmojiTable(ranges, info) {
  const flat = [];
  for (const [lo, hi] of ranges) flat.push(hex(lo), hex(hi));
  const rows = [];
  for (let i = 0; i < flat.length; i += 8) rows.push('  ' + flat.slice(i, i + 8).join(', ') + ',');
  return [
    '// GENERATED by core/scripts/gen-emoji-table.mjs. Do not edit.',
    '// Data: Unicode emoji-data.txt, Unicode ' + info.unicodeVersion + ', Unicode License v3 (' + LICENSE_URL + ').',
    "export const EMOJI_DATA_UNICODE_VERSION = '" + info.unicodeVersion + "';",
    "export const EMOJI_DATA_SOURCE_URL = '" + info.url + "';",
    "export const EMOJI_DATA_SOURCE_SHA256 = '" + info.sourceSha + "';",
    "export const EXTENDED_PICTOGRAPHIC_TABLE_SHA256 = '" + emojiTableChecksum(ranges) + "';",
    '/** Flattened inclusive ranges [lo0, hi0, lo1, hi1, ...], ascending, merged. */',
    'export const EXTENDED_PICTOGRAPHIC_RANGES: readonly number[] = [',
    ...rows,
    '];',
    '',
  ].join('\n');
}

function renderTagTable(seqs, info) {
  const rows = seqs.map((s) => '  [' + s.map(hex).join(', ') + '],');
  return [
    '// GENERATED by core/scripts/gen-emoji-table.mjs. Do not edit.',
    '// Data: Unicode emoji-sequences.txt, Emoji ' +
      info.emojiVersion +
      ' (Unicode ' +
      info.unicodeVersion +
      '), Unicode License v3 (' +
      LICENSE_URL +
      ').',
    "export const TAG_SEQUENCE_UNICODE_VERSION = '" + info.unicodeVersion + "';",
    "export const TAG_SEQUENCE_EMOJI_VERSION = '" + info.emojiVersion + "';",
    "export const TAG_SEQUENCE_SOURCE_URL = '" + info.url + "';",
    "export const TAG_SEQUENCE_SOURCE_SHA256 = '" + info.sourceSha + "';",
    "export const RGI_TAG_SEQUENCES_TABLE_SHA256 = '" + tagTableChecksum(seqs) + "';",
    '/** Listed RGI_Emoji_Tag_Sequence entries, ascending by code point list. */',
    'export const RGI_TAG_SEQUENCES: readonly (readonly number[])[] = [',
    ...rows,
    '];',
    '',
  ].join('\n');
}

function assertAscii(name, text) {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7e || (text.charCodeAt(i) < 0x20 && text[i] !== '\n')) {
      fail('generated file ' + name + ' contains a non-ASCII or control character at index ' + i);
    }
  }
}

function checkPinned(label, entry, actual) {
  if (typeof entry.sha256 === 'string' && entry.sha256 !== '' && entry.sha256 !== actual) {
    fail(
      'SHA-256 mismatch for ' + label + ': pinned ' + entry.sha256 + ', got ' + actual +
        '. Re-run with --update-pin only after reviewing the source change.',
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pinPath = opts.pin !== null ? resolve(opts.pin) : join(SCRIPT_DIR, 'emoji-data.pin.json');
  const outDir = opts.out !== null ? resolve(opts.out) : join(CORE_DIR, 'src', 'possession');
  const pin = readPin(pinPath);

  const dataBytes = await loadSource(opts, EMOJI_DATA_FILE, pin.emojiData.url);
  const seqBytes = await loadSource(opts, EMOJI_SEQUENCES_FILE, pin.emojiSequences.url);
  const dataSha = sha256Hex(dataBytes);
  const seqSha = sha256Hex(seqBytes);

  if (!opts.updatePin) {
    checkPinned(EMOJI_DATA_FILE, pin.emojiData, dataSha);
    checkPinned(EMOJI_SEQUENCES_FILE, pin.emojiSequences, seqSha);
  }

  const ranges = parseExtendedPictographic(dataBytes.toString('utf8'));
  const seqs = parseTagSequences(seqBytes.toString('utf8'));

  const emojiText = renderEmojiTable(ranges, {
    unicodeVersion: pin.unicodeVersion,
    url: pin.emojiData.url,
    sourceSha: dataSha,
  });
  const tagText = renderTagTable(seqs, {
    unicodeVersion: pin.unicodeVersion,
    emojiVersion: pin.emojiVersion,
    url: pin.emojiSequences.url,
    sourceSha: seqSha,
  });
  assertAscii(EMOJI_TABLE_FILE, emojiText);
  assertAscii(TAG_TABLE_FILE, tagText);

  const emojiPath = join(outDir, EMOJI_TABLE_FILE);
  const tagPath = join(outDir, TAG_TABLE_FILE);

  if (opts.check) {
    const stale = [];
    for (const [path, text] of [[emojiPath, emojiText], [tagPath, tagText]]) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== text) stale.push(path);
    }
    if (stale.length > 0) fail('generated file(s) differ from regenerated output: ' + stale.join(', '));
    console.log('gen-emoji-table: committed tables are up to date');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(emojiPath, emojiText);
  writeFileSync(tagPath, tagText);
  if (opts.updatePin) {
    pin.emojiData.sha256 = dataSha;
    pin.emojiSequences.sha256 = seqSha;
    writeFileSync(pinPath, JSON.stringify(pin, null, 2) + '\n');
  }
  console.log(
    'gen-emoji-table: wrote ' + ranges.length + ' ranges and ' + seqs.length + ' tag sequence(s)' +
      (opts.updatePin ? ' and updated the pin file' : ''),
  );
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('gen-emoji-table: ' + (err instanceof GenError ? err.message : err.stack));
    process.exit(1);
  });
}
