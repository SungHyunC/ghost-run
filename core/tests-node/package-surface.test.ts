import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { dependencies?: unknown; exports?: Record<string, unknown> };

describe('core package surface', () => {
  it('lists no runtime dependencies (Requirement 1.1)', () => {
    expect(pkg).not.toHaveProperty('dependencies');
  });

  it('exports the Requirement 1.8 names plus the pure entry functions, and not scanFiles (1.7, 1.8)', () => {
    const names = [
      'scanText',
      'sanitizeText',
      'collectNeedles',
      'traceRedThread',
      'serializeProvenanceLog',
      'parseProvenanceLog',
      'scanTexts',
      'exitCodeFor',
      'formatReport',
    ];
    for (const name of names) {
      expect(typeof (core as Record<string, unknown>)[name], name).toBe('function');
    }
    expect(core).not.toHaveProperty('scanFiles');
  });

  it('declares the ./possession-node export (Requirement 1.7)', () => {
    expect(pkg.exports).toHaveProperty('./possession-node');
  });
});
