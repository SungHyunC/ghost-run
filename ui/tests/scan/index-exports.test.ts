import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as kit from '../../src/index';

// Public entry guard. Validates: Requirements 1.2, 1.4, 1.8, 11.3

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, unknown>;
};

describe('ui/src/index.ts', () => {
  it('exports the display rule as functions', () => {
    expect(typeof kit.escapeForDisplay).toBe('function');
    expect(typeof kit.isHiddenDisplay).toBe('function');
    expect(kit.escapeForDisplay('\u200B')).toBe('<U+200B>');
    expect(kit.isHiddenDisplay(0x200b)).toBe(true);
  });

  it('exports the six components, KitRoot, and theme tokens, and nothing internal', () => {
    for (const name of ['Candle', 'MirrorWorld', 'BlacklightView', 'RedThreadView', 'Graveyard', 'SeanceView', 'KitRoot']) {
      expect(typeof (kit as Record<string, unknown>)[name]).toBe('function');
    }
    expect(kit.THEMES).toBeDefined();
    const keys = Object.keys(kit);
    expect(keys).not.toContain('LightsToggle');
    expect(keys).not.toContain('IconId');
    expect(keys).not.toContain('ICON_IDS');
  });

  it('has no value import or non-type re-export from @ghost-run/core', () => {
    const lines = source.split('\n').filter((l) => l.includes('@ghost-run/core'));
    for (const line of lines) expect(line).toMatch(/^\s*(import|export) type\b/);
  });

  it('maps ./styles.css to the stylesheet entry', () => {
    expect(pkg.exports['./styles.css']).toBe('./src/styles/index.css');
  });
});
