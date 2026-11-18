/**
 * Canary extraction: turns the bytes of one secret file into Canary candidates.
 * Pure, byte-based, no dependencies. Requirements 9.4 and 9.5.
 */

export interface CanaryExtraction {
  readonly candidates: readonly Uint8Array[];
  readonly discarded: {
    readonly tooShort: number;
    readonly tooLong: number;
    readonly tooMany: number;
  };
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 16384;
const MAX_CANDIDATES = 256;

const CR = 0x0d;
const LF = 0x0a;
const SPACE = 0x20;
const TAB = 0x09;
const HASH = 0x23;
const EQUALS = 0x3d;
const SINGLE_QUOTE = 0x27;
const DOUBLE_QUOTE = 0x22;
const UNDERSCORE = 0x5f;

function isBlank(b: number): boolean {
  return b === SPACE || b === TAB;
}

function isKeyStart(b: number): boolean {
  return (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || b === UNDERSCORE;
}

function isKeyPart(b: number): boolean {
  return isKeyStart(b) || (b >= 0x30 && b <= 0x39);
}

/** True when the ASCII-folded base name of the path is `.env` or starts with `.env.`. */
function isEnvFileName(secretPath: string): boolean {
  const cut = Math.max(secretPath.lastIndexOf('/'), secretPath.lastIndexOf('\\'));
  const base = secretPath.slice(cut + 1).replace(/[A-Z]/g, (c) => c.toLowerCase());
  return base === '.env' || base.startsWith('.env.');
}

/** Stable map key for byte equality. */
function byteKey(bytes: Uint8Array): string {
  let key = '';
  const chunk = 4096;
  for (let i = 0; i < bytes.length; i += chunk) {
    key += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return key;
}

/** Extract the VALUE of one `KEY=VALUE` / `export KEY=VALUE` line, or undefined. */
function parseEnvLine(content: Uint8Array, start: number, end: number): Uint8Array | undefined {
  let i = start;
  if (end > i && content[end - 1] === CR) end -= 1;
  while (i < end && isBlank(content[i] as number)) i += 1;
  if (i >= end || content[i] === HASH) return undefined;

  // Optional `export` followed by at least one blank.
  if (
    end - i > 6 &&
    content[i] === 0x65 && // e
    content[i + 1] === 0x78 && // x
    content[i + 2] === 0x70 && // p
    content[i + 3] === 0x6f && // o
    content[i + 4] === 0x72 && // r
    content[i + 5] === 0x74 && // t
    isBlank(content[i + 6] as number)
  ) {
    i += 6;
    while (i < end && isBlank(content[i] as number)) i += 1;
  }

  if (i >= end || !isKeyStart(content[i] as number)) return undefined;
  i += 1;
  while (i < end && isKeyPart(content[i] as number)) i += 1;
  if (i >= end || content[i] !== EQUALS) return undefined;
  i += 1;

  let vs = i;
  let ve = end;
  while (vs < ve && isBlank(content[vs] as number)) vs += 1;
  while (ve > vs && isBlank(content[ve - 1] as number)) ve -= 1;
  if (ve - vs >= 2) {
    const first = content[vs] as number;
    if ((first === SINGLE_QUOTE || first === DOUBLE_QUOTE) && content[ve - 1] === first) {
      vs += 1;
      ve -= 1;
    }
  }
  return content.slice(vs, ve);
}

export function extractCanariesDetailed(secretPath: string, content: Uint8Array): CanaryExtraction {
  const raw: Uint8Array[] = [];

  // (a) whole content without trailing CR / LF bytes.
  let wholeEnd = content.length;
  while (wholeEnd > 0 && (content[wholeEnd - 1] === CR || content[wholeEnd - 1] === LF)) wholeEnd -= 1;
  raw.push(content.slice(0, wholeEnd));

  // (b) env-file values.
  if (isEnvFileName(secretPath)) {
    let lineStart = 0;
    for (let i = 0; i <= content.length; i += 1) {
      if (i === content.length || content[i] === LF) {
        const value = parseEnvLine(content, lineStart, i);
        if (value !== undefined) raw.push(value);
        lineStart = i + 1;
      }
    }
  }

  let tooShort = 0;
  let tooLong = 0;
  let tooMany = 0;
  const seen = new Set<string>();
  const candidates: Uint8Array[] = [];
  for (const candidate of raw) {
    if (candidate.length < MIN_LENGTH) {
      tooShort += 1;
      continue;
    }
    if (candidate.length > MAX_LENGTH) {
      tooLong += 1;
      continue;
    }
    const key = byteKey(candidate);
    if (seen.has(key)) continue;
    if (candidates.length >= MAX_CANDIDATES) {
      tooMany += 1;
      continue;
    }
    seen.add(key);
    candidates.push(candidate);
  }

  return { candidates, discarded: { tooShort, tooLong, tooMany } };
}

export function extractCanaries(secretPath: string, content: Uint8Array): readonly Uint8Array[] {
  return extractCanariesDetailed(secretPath, content).candidates;
}
