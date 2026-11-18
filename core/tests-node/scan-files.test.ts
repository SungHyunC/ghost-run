// Task 11.6: scanFiles example tests. Validates: Requirements 11.1, 11.5, 11.8, 14.5.
// Hidden characters are built from code points or bytes; none appear literally here.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanFiles } from '../possession-node.js';

const ZWSP = String.fromCodePoint(0x200b);
const OPENER = String.fromCodePoint(0x3c, 0x21, 0x2d, 0x2d);
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ghost-run-scan-files-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function put(name: string, data: string | Uint8Array): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, data);
  return path;
}

describe('scanFiles', () => {
  it('applies the markdown rule by extension and reports findings and clean', async () => {
    const md = await put('note.md', `hello ${OPENER} hidden --> world\n`);
    const txt = await put('note.txt', `hello ${OPENER} hidden --> world\n`);
    const report = await scanFiles([md, txt]);
    expect(report.outcome).toBe('findings');
    expect(report.files.map((f) => f.path)).toEqual([md, txt]);
    expect(report.files[0]?.findings.map((f) => f.category)).toEqual(['html-comment']);
    expect(report.files[1]?.findings).toEqual([]);
    expect(report.totalFindings).toBe(1);

    const clean = await scanFiles([txt]);
    expect(clean.outcome).toBe('clean');
    expect(clean.totalFindings).toBe(0);
  });

  it('reports a missing path as an error and still reports the readable file', async () => {
    const missing = join(dir, 'does-not-exist.txt');
    const ok = await put('ok.txt', `a${ZWSP}b\n`);
    const report = await scanFiles([missing, ok]);
    expect(report.outcome).toBe('error');
    expect(report.files).toHaveLength(2);
    expect(report.files[0]?.error).toContain(missing);
    expect(report.files[0]?.error).toContain('ENOENT');
    expect(report.files[1]?.error).toBeUndefined();
    expect(report.files[1]?.findings).toHaveLength(1);
    expect(report.files[1]?.findings[0]?.category).toBe('zero-width');
  });

  it('keeps the BOM and flags it at line 1, column 1', async () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, 0x61, 0x0a]);
    const path = await put('bom.txt', bytes);
    const report = await scanFiles([path]);
    expect(report.outcome).toBe('findings');
    const finding = report.files[0]?.findings[0];
    expect(finding?.line).toBe(1);
    expect(finding?.column).toBe(1);
  });

  it('decodes an invalid byte to U+FFFD without producing a Finding', async () => {
    const bytes = Uint8Array.from([0x61, 0xff, 0x62, 0x0a]);
    expect(new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(bytes)).toContain(
      String.fromCodePoint(0xfffd),
    );
    const path = await put('invalid.txt', bytes);
    const report = await scanFiles([path]);
    expect(report.outcome).toBe('clean');
    expect(report.files[0]?.findings).toEqual([]);
    expect(report.files[0]?.error).toBeUndefined();
  });

  it('never copies a hostile error message into the report', async () => {
    const hostile = `SECRET-${'x'.repeat(5000)}`;
    const withCode = await scanFiles(['a.txt'], {
      readFile: () => Promise.reject(Object.assign(new Error(hostile), { code: 'EACCES' })),
    });
    expect(withCode.outcome).toBe('error');
    expect(withCode.files[0]?.error).toBe('cannot read a.txt: EACCES');

    const withoutCode = await scanFiles(['b.txt'], {
      readFile: () => Promise.reject(new Error(hostile)),
    });
    expect(withoutCode.files[0]?.error).toBe('cannot read b.txt: unreadable');
    expect(JSON.stringify(withoutCode)).not.toContain('SECRET');
  });

  it('source of possession-node.ts contains no write, rename, or unlink', async () => {
    const source = await readFile(
      fileURLToPath(new URL('../possession-node.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/\b(writeFile|writeFileSync|rename|renameSync|unlink|unlinkSync)\b/);
  });
});
