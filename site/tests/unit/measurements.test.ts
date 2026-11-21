import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const DOC = readFileSync(resolve(here, '../../../docs/measurements.md'), 'utf8');

function section(title: string, level: '##' | '###', source: string = DOC): string {
  const start = source.indexOf(`\n${level} ${title}`);
  expect(start, `heading "${title}" missing`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + 1);
  const next = rest.slice(level.length + 1).search(new RegExp(`\\n${level} `));
  return next < 0 ? rest : rest.slice(0, next + level.length + 1);
}

describe('docs/measurements.md paged landing section', () => {
  const main = section('Paged landing and showcase measurements', '##');

  it('has the section and its subsections', () => {
    for (const h of [
      'Closure sizes',
      'Contrast changes',
      'Differences D1 to D14 and open questions O1 to O22',
      'Repairs made during the run',
      'Not yet measured',
    ]) {
      expect(main).toMatch(new RegExp(`\\n### ${h}`));
    }
  });

  it('records closure sizes for both pages', () => {
    const s = section('Closure sizes', '###', main);
    expect(s).toContain('Landing_Page');
    expect(s).toContain('Showcase');
    expect(s).toContain('346,648 B');
    expect(s).toContain('285,426 B');
  });

  it('records the applied repairs and the D/O differences', () => {
    expect(section('Differences D1 to D14 and open questions O1 to O22', '###', main)).toMatch(/D1\b.*D14/s);
    const r = section('Repairs made during the run', '###', main);
    expect(r).toContain('Paging model');
    expect(r).toContain('Pg2');
  });

  it('records the contrast changes', () => {
    const s = section('Contrast changes', '###', main);
    expect(s).toContain('.pg-dot i');
    expect(s).toContain('.frame');
  });

  it('lists the owner entries as not yet measured', () => {
    const s = section('Not yet measured', '###', main);
    expect(s).toContain('390 px, 920 px, and 1280 px');
    expect(s).toContain('Mockup_V6');
    expect(s).toContain('Mockup_Kit');
    expect(s).toMatch(/Chrome load of `\/` and `\/kit\/` under the root `_headers`/);
    expect(s).toMatch(/Keyboard and screen-reader pass/);
    expect(s).toMatch(/Browser load times of `\/` and `\/kit\/`/);
    expect(s.match(/not yet measured/g)?.length).toBe(4);
  });

  it('keeps the Sample-data spike section', () => {
    const s = section('Sample-data spike (site-pages task 1.2)', '##');
    expect(s).toContain('Result: works');
  });
});
