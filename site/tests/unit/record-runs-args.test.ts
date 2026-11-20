import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The script is plain JavaScript without a declaration file.
import { parseArgs } from '../../scripts/record-runs.mjs';

interface Args {
  out: string;
  check: boolean;
}

describe('record-runs.mjs arguments', () => {
  it('defaults to src/data/runs.json without --check', () => {
    const args = parseArgs([]) as Args;
    expect(args.check).toBe(false);
    expect(args.out.replaceAll('\\', '/').endsWith('site/src/data/runs.json')).toBe(true);
  });

  it('reads --out and --check', () => {
    const args = parseArgs(['--out', 'tmp/x.json', '--check']) as Args;
    expect(args.check).toBe(true);
    expect(isAbsolute(args.out)).toBe(true);
    expect(args.out.replaceAll('\\', '/').endsWith('tmp/x.json')).toBe(true);
  });

  it('rejects a missing --out value and unknown flags', () => {
    expect(() => parseArgs(['--out'])).toThrow();
    expect(() => parseArgs(['--nope'])).toThrow();
  });
});
