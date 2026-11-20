import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from '../../src/components/art/Icon';
import { Sprite, SYMBOL_IDS } from '../../src/components/art/Sprite';

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles');

function cssRules(): { selectors: string[]; body: string }[] {
  const rules: { selectors: string[]; body: string }[] = [];
  for (const f of readdirSync(stylesDir).filter((n) => n.endsWith('.css'))) {
    const text = readFileSync(join(stylesDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const prelude = (m[1] ?? '').trim();
      if (prelude.startsWith('@')) continue;
      rules.push({
        selectors: prelude.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
        body: m[2] ?? '',
      });
    }
  }
  return rules;
}

function fixturePage() {
  return render(
    <div className="site">
      <Sprite />
      {SYMBOL_IDS.map((id) => (
        <Icon key={id} id={id} viewBox="0 0 40 40" />
      ))}
    </div>,
  );
}

afterEach(cleanup);

describe('T-sprite', () => {
  it('defines the 16 symbols with unique ids', () => {
    const { container } = fixturePage();
    const ids = [...container.querySelectorAll('symbol')].map((s) => s.id);
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...SYMBOL_IDS].sort());
  });

  it('gives every <use href="#x"> a <symbol id="x">', () => {
    const { container } = fixturePage();
    const uses = [...container.querySelectorAll('use')];
    expect(uses).toHaveLength(SYMBOL_IDS.length);
    for (const u of uses) {
      const href = u.getAttribute('href') ?? '';
      expect(href.startsWith('#')).toBe(true);
      expect(container.querySelectorAll(`symbol[id="${href.slice(1)}"]`)).toHaveLength(1);
    }
  });

  it('marks every svg with a <use>, and the Sprite svg, aria-hidden; the Sprite is not focusable', () => {
    const { container } = fixturePage();
    const sprite = container.querySelector('svg.sprite');
    expect(sprite?.getAttribute('aria-hidden')).toBe('true');
    expect(sprite?.getAttribute('focusable')).toBe('false');
    for (const u of container.querySelectorAll('use')) {
      expect(u.closest('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('has no CSS descendant selector that ends in .bf or .bs', () => {
    for (const { selectors } of cssRules()) {
      for (const s of selectors) {
        expect(/[\s>+~]\S*\.(bf|bs)(?=$|[:[])/.test(s), s).toBe(false);
      }
    }
  });

  it('declares --bone-c only on .fig and .xray .fig', () => {
    const owners = cssRules()
      .filter((r) => /--bone-c\s*:/.test(r.body))
      .flatMap((r) => r.selectors);
    expect(owners.length).toBeGreaterThan(0);
    for (const s of owners) expect(['.fig', '.xray .fig']).toContain(s);
  });
});
