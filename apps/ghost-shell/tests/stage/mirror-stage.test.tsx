/** @vitest-environment jsdom */
// DOM tests of the mirror stage picture with real runs of the bundled scenarios.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { InlineSqlExecutor } from '@ghost-run/playground-shell';
import { parseWards } from '@ghost-run/wards-config';
import { runPlayground } from '../../src/pipeline/run-playground';
import type { PlaygroundRun } from '../../src/pipeline/run-playground';
import { buildProject } from '../../src/scenarios/project';
import { SCENARIOS } from '../../src/scenarios/scenarios';
import { MirrorStage } from '../../src/stage/MirrorStage';

const here = dirname(fileURLToPath(import.meta.url));
const parsed = parseWards(readFileSync(resolve(here, '../../wards.yaml'), 'utf8'));
if (!parsed.ok) throw new Error('the Default_Wards_File does not parse');
const wardSet = parsed.wardSet;

let sql: InlineSqlExecutor;
beforeAll(async () => {
  sql = await initInlineSql();
});
afterEach(cleanup);

async function runScenario(id: number): Promise<PlaygroundRun> {
  const s = SCENARIOS.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no scenario ${id}`);
  const project = await buildProject(sql);
  return runPlayground({ project, plan: s.plan, wardSet, sql, ...(s.provenance === undefined ? {} : { provenance: s.provenance }) });
}

describe('MirrorStage', () => {
  it('hides the picture from assistive technology, uses no inline style, and plays at once without IntersectionObserver', async () => {
    const { container } = render(<MirrorStage run={await runScenario(1)} />);
    const stage = container.querySelector('.ms');
    expect(stage?.getAttribute('aria-hidden')).toBe('true');
    expect(stage?.getAttribute('data-play')).toBe('true');
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('Scenario 1: the copy shows 0 rows of users and the loss, reality shows 1,206', async () => {
    const { container } = render(<MirrorStage run={await runScenario(1)} />);
    const real = container.querySelector('.ms-real');
    const copy = container.querySelector('.ms-copy');
    expect(real?.textContent).toContain('1,206');
    expect(copy?.querySelector('.ms-table[data-lost="true"] .ms-num')?.textContent).toBe('0');
    expect(copy?.querySelector('.ms-lost')?.textContent).toBe('-1,206, table dropped');
    expect(container.querySelector('.ms')?.getAttribute('data-focus')).toBe('tables');
  });

  it('Scenario 2: every deleted path is marked in the copy and none in reality', async () => {
    const run = await runScenario(2);
    const deleted = run.report.changes.flat().filter((c) => c.kind === 'file-deleted').length;
    const { container } = render(<MirrorStage run={run} />);
    expect(container.querySelectorAll('.ms-copy .ms-entry[data-status="deleted"]')).toHaveLength(deleted);
    expect(container.querySelectorAll('.ms-real .ms-entry[data-status="deleted"]')).toHaveLength(0);
  });

  it('Scenario 3: the network attempt leaves the copy after the .env read and is stamped blocked', async () => {
    const { container } = render(<MirrorStage run={await runScenario(3)} />);
    expect(container.querySelector('.ms')?.getAttribute('data-egress')).toBe('true');
    expect(container.querySelector('.ms-copy .ms-entry[data-secret="true"] .ms-path')?.textContent).toBe('.env');
    expect(container.querySelector('.ms-dest')?.textContent).toBe('setup-check.example:443');
    expect(container.querySelector('.ms-stamp')?.textContent).toBe('Blocked by the wards');
  });

  it('Scenario 4: nothing differs and nothing leaves the copy', async () => {
    const { container } = render(<MirrorStage run={await runScenario(4)} />);
    expect(container.querySelectorAll('.ms-entry:not([data-status="same"])')).toHaveLength(0);
    expect(container.querySelector('.ms-outside')).toBeNull();
  });
});
