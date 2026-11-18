// Feature: possession, generator integration test for scripts/gen-emoji-table.mjs.
// Validates: Requirements 4.6, 4.7
// Runs the committed script offline (--source) with --pin and --out redirected into a
// temporary directory, so the committed tables and pin file are never touched.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'gen-emoji-table.mjs');

const EMOJI_FILE = 'emoji-table.generated.ts';
const TAG_FILE = 'tag-sequence-table.generated.ts';

const EMOJI_DATA = [
  '# synthetic emoji-data.txt',
  '00A9          ; Extended_Pictographic # copyright',
  '00AE          ; Extended_Pictographic # registered',
  '1F300..1F302  ; Extended_Pictographic # range',
  '1F303         ; Extended_Pictographic # adjacent, merges',
  '1F600         ; Emoji_Presentation    # not Extended_Pictographic',
  '',
].join('\n');

// Deliberately unsorted: Scotland before England.
const ENGLAND = '1F3F4 E0067 E0062 E0065 E006E E0067 E007F';
const SCOTLAND = '1F3F4 E0067 E0062 E0073 E0063 E0074 E007F';
const EMOJI_SEQUENCES = [
  '# synthetic emoji-sequences.txt',
  SCOTLAND + ' ; RGI_Emoji_Tag_Sequence ; flag: Scotland',
  ENGLAND + ' ; RGI_Emoji_Tag_Sequence ; flag: England',
  '1F1E6 1F1E8 ; RGI_Emoji_Flag_Sequence ; flag: Ascension Island',
  '',
].join('\n');

const INVALID_SEQUENCES = [
  '1F3F4 E0067 E0062 E0065 E006E E0067 ; RGI_Emoji_Tag_Sequence ; missing cancel tag',
  '',
].join('\n');

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function pinFor(dataSha: string | null, seqSha: string | null): string {
  return JSON.stringify({
    unicodeVersion: '16.0.0',
    emojiVersion: '16.0',
    emojiData: { url: 'https://data.example/emoji-data.txt', sha256: dataSha },
    emojiSequences: { url: 'https://data.example/emoji-sequences.txt', sha256: seqSha },
  });
}

let root = '';
let counter = 0;

interface Case {
  readonly source: string;
  readonly out: string;
  readonly pin: string;
}

function makeCase(opts: { data?: string; sequences?: string; pinData?: string; pinSeq?: string }): Case {
  const dir = join(root, 'case-' + String(counter++));
  const source = join(dir, 'source');
  mkdirSync(source, { recursive: true });
  const data = opts.data ?? EMOJI_DATA;
  const sequences = opts.sequences ?? EMOJI_SEQUENCES;
  writeFileSync(join(source, 'emoji-data.txt'), data);
  writeFileSync(join(source, 'emoji-sequences.txt'), sequences);
  const pin = join(dir, 'pin.json');
  writeFileSync(pin, pinFor(opts.pinData ?? sha256(data), opts.pinSeq ?? sha256(sequences)));
  return { source, out: join(dir, 'out'), pin };
}

function run(c: Case, extra: string[] = []) {
  const res = spawnSync(
    process.execPath,
    [SCRIPT, '--source', c.source, '--pin', c.pin, '--out', c.out, ...extra],
    { encoding: 'utf8', timeout: 30_000 },
  );
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'gen-emoji-table-test-'));
});

afterAll(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true });
});

describe('gen-emoji-table.mjs (offline, redirected output)', () => {
  it('generates the merged Extended_Pictographic and sorted tag tables', () => {
    const c = makeCase({});
    const res = run(c);
    expect(res.code, res.stderr).toBe(0);

    const emoji = readFileSync(join(c.out, EMOJI_FILE), 'utf8');
    expect(emoji).toContain('  0xA9, 0xA9, 0xAE, 0xAE, 0x1F300, 0x1F303,\n');
    expect(emoji).not.toContain('0x1F600');
    expect(emoji).toContain("EMOJI_DATA_SOURCE_SHA256 = '" + sha256(EMOJI_DATA) + "'");
    expect(emoji).toContain("EMOJI_DATA_UNICODE_VERSION = '16.0.0'");

    const tags = readFileSync(join(c.out, TAG_FILE), 'utf8');
    const england = '  [0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F],';
    const scotland = '  [0x1F3F4, 0xE0067, 0xE0062, 0xE0073, 0xE0063, 0xE0074, 0xE007F],';
    expect(tags).toContain(england);
    expect(tags).toContain(scotland);
    expect(tags.indexOf(england)).toBeLessThan(tags.indexOf(scotland));
    expect(tags).not.toContain('0x1F1E6');
    expect(tags).toContain("TAG_SEQUENCE_SOURCE_SHA256 = '" + sha256(EMOJI_SEQUENCES) + "'");
    expect(tags).toContain("TAG_SEQUENCE_EMOJI_VERSION = '16.0'");

    for (const text of [emoji, tags]) {
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        expect(code === 0x0a || (code >= 0x20 && code <= 0x7e)).toBe(true);
      }
    }
  });

  it('exits non-zero and writes nothing on a hash mismatch against the pin', () => {
    const c = makeCase({ pinData: '0'.repeat(64) });
    const res = run(c);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain('SHA-256 mismatch');
    expect(existsSync(join(c.out, EMOJI_FILE))).toBe(false);
    expect(existsSync(join(c.out, TAG_FILE))).toBe(false);
  });

  it('exits non-zero and writes nothing on a sequences hash mismatch', () => {
    const c = makeCase({ pinSeq: 'f'.repeat(64) });
    const res = run(c);
    expect(res.code).not.toBe(0);
    expect(existsSync(c.out)).toBe(false);
  });

  it('exits non-zero and writes nothing on an invalid tag sequence entry', () => {
    const c = makeCase({ sequences: INVALID_SEQUENCES });
    const res = run(c);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain('does not end with U+E007F');
    expect(existsSync(join(c.out, EMOJI_FILE))).toBe(false);
    expect(existsSync(join(c.out, TAG_FILE))).toBe(false);
  });

  it('--check passes on matching files and detects a differing committed file', () => {
    const c = makeCase({});
    expect(run(c).code).toBe(0);

    const clean = run(c, ['--check']);
    expect(clean.code, clean.stderr).toBe(0);

    const target = join(c.out, TAG_FILE);
    writeFileSync(target, readFileSync(target, 'utf8') + '// drift\n');
    const drift = run(c, ['--check']);
    expect(drift.code).not.toBe(0);
    expect(drift.stderr).toContain(TAG_FILE);
    // --check must not rewrite the file.
    expect(readFileSync(target, 'utf8').endsWith('// drift\n')).toBe(true);
  });

  it('--check fails when the committed file is missing', () => {
    const c = makeCase({});
    const res = run(c, ['--check']);
    expect(res.code).not.toBe(0);
    expect(existsSync(c.out)).toBe(false);
  });
});
