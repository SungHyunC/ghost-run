import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('@ghost-run/mcp scaffold', () => {
  it('declares the package name and the bin entry', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    expect(pkg.name).toBe('@ghost-run/mcp');
    expect(pkg.bin['ghost-run-mcp']).toBe('bin/ghost-run-mcp.mjs');
  });
});
