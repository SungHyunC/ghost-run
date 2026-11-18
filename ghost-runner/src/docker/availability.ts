/**
 * Docker availability check (Req 3.1, 3.2).
 *
 * One `docker image inspect` of the content-addressed tag `ghost-run/box:<hash>` answers both
 * questions: is the daemon reachable, and is the box image present. The image id read from the
 * inspect output is what the box is later started with (the audit compares against it), and the
 * image's build label `ghost-run.box.hash` must equal the hash computed from the repository.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOX_ENV } from './hardening.js';
import type { DeadlineClock, DockerClient } from './cli.js';

/** Absolute limit of the availability check (Req 3.1). */
export const AVAILABILITY_LIMIT_MS = 2_000;

export const BOX_IMAGE_REPO = 'ghost-run/box';
export const BOX_HASH_LABEL = 'ghost-run.box.hash';

export type AvailabilityReason = 'docker-unavailable' | 'box-image-missing';

export type DockerAvailability =
  | {
      readonly available: true;
      /** Reference to pass to `docker run`: the image id, or the pinned digest reference. */
      readonly imageRef: string;
      readonly imageId: string;
      /** Content-addressed tag, or the configured digest reference. */
      readonly tag: string;
      /** Environment baked into the image, minus the variables the runner sets itself. */
      readonly imageEnv: readonly string[];
    }
  | { readonly available: false; readonly reason: AvailabilityReason; readonly detail?: string };

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/**
 * Hash of the box sources: sha256 over Dockerfile, BASE_DIGEST, and `recorder/*`.
 * Must stay byte-for-byte identical to `computeBoxHash` in `box/build.mjs`.
 */
export function computeBoxHash(boxDir: string = resolveBoxDir()): string {
  const recorderDir = join(boxDir, 'recorder');
  const h = createHash('sha256');
  const add = (label: string, buf: Buffer): void => {
    h.update(`${label}\0${buf.length}\0`);
    h.update(buf);
    h.update('\0');
  };
  add('Dockerfile', readFileSync(join(boxDir, 'Dockerfile')));
  add('BASE_DIGEST', readFileSync(join(boxDir, 'BASE_DIGEST')));
  for (const f of listFiles(recorderDir)) {
    if (f.endsWith('.gitkeep')) continue;
    add(`recorder/${relative(recorderDir, f).split('\\').join('/')}`, readFileSync(f));
  }
  return h.digest('hex');
}

/** Finds the package's `box/` directory from this module (works from `src/` and from `dist/`). */
export function resolveBoxDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'box');
    if (existsSync(join(candidate, 'Dockerfile'))) return candidate;
    dir = dirname(dir);
  }
  throw new Error('box/ directory not found');
}

export function boxImageTag(hash: string): string {
  return `${BOX_IMAGE_REPO}:${hash}`;
}

export interface AvailabilityOptions {
  /** Directory with Dockerfile, BASE_DIGEST, recorder/. Default: the package's `box/`. */
  readonly boxDir?: string;
  /** Pinned `<name>@sha256:<digest>` reference (option `image`). Skips the hash and label check. */
  readonly image?: string;
  /** Default 2000 ms. */
  readonly limitMs?: number;
  readonly clock?: DeadlineClock;
}

type Json = Record<string, unknown>;

function asObj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

const NO_SUCH = /no such (image|object)/i;

export async function checkDockerAvailability(
  client: DockerClient,
  opts: AvailabilityOptions = {},
): Promise<DockerAvailability> {
  const limitMs = opts.limitMs ?? AVAILABILITY_LIMIT_MS;
  let tag: string;
  let expectedHash: string | undefined;
  if (opts.image !== undefined) {
    tag = opts.image;
  } else {
    try {
      expectedHash = computeBoxHash(opts.boxDir);
    } catch (e) {
      return { available: false, reason: 'box-image-missing', detail: `box sources unreadable: ${(e as Error).message}` };
    }
    tag = boxImageTag(expectedHash);
  }

  const startedAt = (opts.clock ?? { now: () => Date.now() }).now();
  const res = await client.run(['image', 'inspect', tag], {
    timeoutMs: limitMs,
    deadlineAt: startedAt + limitMs,
  });
  if (res.spawnError !== undefined) return { available: false, reason: 'docker-unavailable', detail: res.spawnError };
  if (res.timedOut) return { available: false, reason: 'docker-unavailable', detail: 'availability check timed out' };
  if (res.code !== 0) {
    const err = res.stderr.toString('utf8');
    if (NO_SUCH.test(err)) return { available: false, reason: 'box-image-missing', detail: 'box image not found' };
    return { available: false, reason: 'docker-unavailable', detail: err.trim().slice(0, 200) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout.toString('utf8'));
  } catch {
    return { available: false, reason: 'box-image-missing', detail: 'image inspect output unreadable' };
  }
  const image = asObj(Array.isArray(parsed) ? parsed[0] : parsed);
  const id = image['Id'];
  if (typeof id !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(id)) {
    return { available: false, reason: 'box-image-missing', detail: 'image id missing' };
  }
  const config = asObj(image['Config']);
  if (expectedHash !== undefined) {
    const labels = asObj(config['Labels']);
    if (labels[BOX_HASH_LABEL] !== expectedHash) {
      return { available: false, reason: 'box-image-missing', detail: 'box image label does not match the box sources' };
    }
  }
  const env = Array.isArray(config['Env']) ? (config['Env'] as unknown[]).filter((e): e is string => typeof e === 'string') : [];
  const imageEnv = env.filter((e) => !Object.prototype.hasOwnProperty.call(BOX_ENV, e.split('=')[0] ?? ''));
  return {
    available: true,
    imageRef: opts.image ?? id,
    imageId: id,
    tag,
    imageEnv,
  };
}
