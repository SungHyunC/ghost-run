import { spawnSync } from 'node:child_process';
import { describe } from 'vitest';
import { boxImageTag, computeBoxHash } from '../src/docker/availability.js';
import { DOCKER_EXAMPLES_META, DOCKER_SKIPPED_LABEL, skippedSuiteName } from './docker-label.js';

/** Product limit for the availability check (Requirement 1.1); the product code enforces it. */
export const DOCKER_CHECK_LIMIT_MS = 2_000;

/**
 * Probe limit used by the test helper only. Test runs execute many files in
 * parallel, so the daemon can answer slower than the product limit; a tight
 * probe would silently skip Docker suites while Docker is running.
 */
export const TEST_PROBE_LIMIT_MS = 20_000;

function defaultBoxImage(): string {
  try {
    return boxImageTag(computeBoxHash());
  } catch {
    return 'ghost-run/box:unknown';
  }
}

/** Content-addressed box image tag (ghost-run/box:<hash>); override with GHOST_BOX_IMAGE. */
export const BOX_IMAGE: string = process.env['GHOST_BOX_IMAGE'] ?? defaultBoxImage();

/** Daemon reachable and box image present, within `limitMs` in total. */
export function checkDockerAvailable(
  image: string = BOX_IMAGE,
  limitMs: number = TEST_PROBE_LIMIT_MS,
): boolean {
  const deadline = Date.now() + limitMs;
  const remaining = (): number => deadline - Date.now();
  try {
    const info = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: Math.max(1, remaining()),
      stdio: 'ignore',
    });
    if (info.error !== undefined || info.status !== 0) return false;
    if (remaining() <= 0) return false;
    const img = spawnSync('docker', ['image', 'inspect', image], {
      timeout: Math.max(1, remaining()),
      stdio: 'ignore',
    });
    return img.error === undefined && img.status === 0;
  } catch {
    return false;
  }
}

export const dockerAvailable: boolean = checkDockerAvailable();

/**
 * `describe` for [docker] suites. Skips (never passes) when Docker or the box
 * image is unavailable and prints `skipped (docker unavailable)`.
 */
export function describeDocker(name: string, fn: () => void): void {
  if (!dockerAvailable) {
    console.info(`${name}: ${DOCKER_SKIPPED_LABEL}`);
    // The suffix lets docker-reporter.ts list the suite in the summary.
    describe.skip(skippedSuiteName(name), fn);
    return;
  }
  describe(name, fn);
}

/**
 * A Docker property calls this with its test context's `task` after `fc.assert` returns (also
 * when interrupted) so the reporter can print `partial (n of 20 examples)` for runs below 20.
 */
export function recordDockerExamples(task: { meta: object }, completedExamples: number): void {
  (task.meta as Record<string, unknown>)[DOCKER_EXAMPLES_META] = completedExamples;
}
