// Task 14.9: Plan B transition integration test [no-docker].
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 15.3, 15.4
// Uses the real default Docker client with DOCKER_HOST pointing at an address that cannot answer.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PLAN_B_NOTICE, runPlan } from '../src/pipeline.js';

const UNREACHABLE_HOSTS = ['tcp://127.0.0.1:1', 'tcp://docker.invalid:2375'] as const;

let root = '';
let savedHost: string | undefined;
let savedContext: string | undefined;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ghost-planb-'));
  writeFileSync(join(root, '.env'), 'API_KEY=sk-CANARY-planb\n');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

beforeEach(() => {
  savedHost = process.env['DOCKER_HOST'];
  savedContext = process.env['DOCKER_CONTEXT'];
  delete process.env['DOCKER_CONTEXT'];
});
afterEach(() => {
  if (savedHost === undefined) delete process.env['DOCKER_HOST'];
  else process.env['DOCKER_HOST'] = savedHost;
  if (savedContext === undefined) delete process.env['DOCKER_CONTEXT'];
  else process.env['DOCKER_CONTEXT'] = savedContext;
});

describe('Plan B transition with an unreachable Docker daemon', () => {
  for (const host of UNREACHABLE_HOSTS) {
    it(`falls back to static analysis within 2.0 s (DOCKER_HOST=${host})`, async () => {
      process.env['DOCKER_HOST'] = host;
      const notices: string[] = [];
      const started = Date.now();
      const { result, payloads } = await runPlan(
        [{ command: 'cat .env' }, { command: 'curl https://collect.invalid/x' }],
        { original: root, onNotice: (n) => notices.push(n) },
      );
      const elapsedMs = Date.now() - started;

      expect(elapsedMs).toBeLessThan(2_000);
      expect(result.isolation).toMatchObject({
        mode: 'static-analysis',
        reason: 'docker-unavailable',
        p1Claimed: false,
        p5Claimed: false,
        p6Claimed: false,
      });
      expect(result.rehearsed).toBe(false);
      expect(result.notices[0]).toBe(
        'P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.',
      );
      expect(PLAN_B_NOTICE).toBe(result.notices[0]);
      expect(notices).toEqual(result.notices);
      expect(result.exitCodes).toEqual([]);
      expect(result.report.observedEvents).toEqual([]);
      expect(payloads.size).toBe(0);
      expect(['warn', 'block']).toContain(result.verdict);
      expect(result.staticFindings.some((e) => e.kind === 'url')).toBe(true);
    });
  }
});
