// [no-docker] Observed events and static Effects are reported side by side, never deduplicated.
// Validates: Requirements 8.10, 9.2, 15.2, 15.5
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runPlan } from '../src/pipeline.js';
import { cleanRecorderFiles, createFakeDocker } from './fixtures/fake-docker.js';

const dirs: string[] = [];

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-nodedup-'));
  dirs.push(root);
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data', 'seed.txt'), 'seed\n');
  return root;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const dnsLine = (step: number): string => `${JSON.stringify({ host: 'setup-check.example', ip: '127.1.2.3', step })}\n`;

describe('no deduplication of observed events and static Effects', () => {
  it('reports both the static Effect and the observed network attempt', async () => {
    const files = cleanRecorderFiles(1, { 'dns.jsonl': dnsLine(0) });
    const client = createFakeDocker({ recorder: { files } });
    const { result } = await runPlan([{ command: 'curl https://setup-check.example/x' }], { original: repo(), client });

    expect(result.report.effectsOutside).toEqual([[{ kind: 'url', destination: 'https://setup-check.example/x' }]]);
    expect(result.report.observedEvents).toEqual([{ kind: 'network-attempt', destination: 'setup-check.example', stepIndex: 0 }]);
  });

  it('keeps repeated identical destinations across steps in both lists', async () => {
    const files = cleanRecorderFiles(2, { 'dns.jsonl': dnsLine(0) + dnsLine(1) });
    const client = createFakeDocker({ recorder: { files } });
    const plan = [{ command: 'curl https://setup-check.example/x' }, { command: 'curl https://setup-check.example/x' }];
    const { result } = await runPlan(plan, { original: repo(), client });

    const effect = { kind: 'url', destination: 'https://setup-check.example/x' };
    expect(result.report.effectsOutside).toEqual([[effect], [effect]]);
    expect(result.report.observedEvents).toEqual([
      { kind: 'network-attempt', destination: 'setup-check.example', stepIndex: 0 },
      { kind: 'network-attempt', destination: 'setup-check.example', stepIndex: 1 },
    ]);
  });
});
