import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Make } from '../../src/components/Make';

const here = dirname(fileURLToPath(import.meta.url));
const README = readFileSync(resolve(here, '../../../README.md'), 'utf8');
const HEADING = 'Build a world with the `world-smith` agent';

function section(): string {
  const start = README.indexOf(`### ${HEADING}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = README.slice(start + 4);
  const next = rest.search(/^#{1,3} /m);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('world-smith command', () => {
  it('equals the command in the README section', () => {
    const html = renderToStaticMarkup(createElement(Make));
    const m = /<code class="cmd">([^<]*)<\/code>/.exec(html);
    expect(m).not.toBeNull();
    const cmd = m?.[1] ?? '';
    expect(cmd).toBe('kiro-cli chat --agent world-smith');
    expect(section()).toContain(`\`${cmd}\``);
  });
});
