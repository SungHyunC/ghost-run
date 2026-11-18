import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guard: every test that calls the property runner passes the shared PBT_TIMEOUT, so the Nightly run
// (timeout 0) is never cut by vitest's 5 s default. Validates: Requirements 15.1, 15.2

const testsRoot = fileURLToPath(new URL('../', import.meta.url));
const RUNNER = ['fc', 'assert'].join('.');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}${e.name}`;
    return e.isDirectory() ? walk(`${p}/`) : [p];
  });
}

const files = walk(testsRoot).filter(
  (f) =>
    /\.test\.tsx?$/.test(f) &&
    !f.includes('/tests/scan/') &&
    readFileSync(f, 'utf8').includes(RUNNER),
);

describe('shared PBT timeout', () => {
  it('finds the property test files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [f.slice(testsRoot.length), f] as const))('%s passes PBT_TIMEOUT to every test with a property', (_name, file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toMatch(/import \{[^}]*\bPBT_TIMEOUT\b[^}]*\} from '\.\.\/support\/pbt-config'/);
    expect(src).not.toMatch(/PBT_TIMEOUT\s*\?\?/);
    // Split into test bodies; every body that runs a property must use the shared timeout.
    const bodies = src.split(/\n\s*(?:it|test)(?:\.\w+)?\(/).slice(1);
    const bad = bodies.filter((b) => b.includes(RUNNER) && !b.includes('PBT_TIMEOUT'));
    expect(bad.map((b) => b.slice(0, 80))).toEqual([]);
  });
});
