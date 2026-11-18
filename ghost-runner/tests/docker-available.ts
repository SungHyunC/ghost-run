import { spawnSync } from 'node:child_process';
import { describe } from 'vitest';
import { boxImageTag, computeBoxHash } from '../src/docker/availability.js';

/** Absolute limit for the whole availability check (Requirement 1.1). */
export const DOCKER_CHECK_LIMIT_MS = 2_000;

function defaultBoxImage(): string {
  try {
    return boxImageTag(computeBoxHash());
  } catch {
    return 'ghost-run/box:unknown';
  }
}

/** Content-addressed box image tag (ghost-run/box:<hash>); override with GHOST_BOX_IMAGE. */
export const BOX_IMAGE: string = process.env['GHOST_BOX_IMAGE'] ?? defaultBoxImage();

/** Daemon reachable and box image present, all within 2.0 s total. */
export function checkDockerAvailable(image: string = BOX_IMAGE): boolean {
  const deadline = Date.now() + DOCKER_CHECK_LIMIT_MS;
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
    console.info(`${name}: skipped (docker unavailable)`);
  }
  describe.skipIf(!dockerAvailable)(name, fn);
}
