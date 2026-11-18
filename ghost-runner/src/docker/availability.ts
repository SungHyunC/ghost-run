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
import { dirname, join, relative, resolve } from 'node:path';
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

/** Name of the environment variable that names the box folder. */
export const BOX_DIR_ENV = 'GHOST_RUN_BOX_DIR';

export interface BoxDirSources {
  /** Explicit box folder. Used as given; no search happens when it is set. */
  readonly boxDir?: string;
  /** Environment map; the value of `GHOST_RUN_BOX_DIR` is used when `boxDir` is not set. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Folder to search upward from when the module location finds nothing (the original or the cwd). */
  readonly workspace?: string;
  /** Folder where the module search starts. Default: the folder of this module. Tests set it. */
  readonly moduleDir?: string;
}

const SEARCH_DEPTH = 32;

/** First folder on the way up from `start` whose `box/` or `ghost-runner/box/` holds a Dockerfile. */
function searchUp(start: string, layouts: readonly (readonly string[])[]): string | undefined {
  let dir = start;
  for (let i = 0; i < SEARCH_DEPTH; i++) {
    for (const parts of layouts) {
      const candidate = join(dir, ...parts);
      if (existsSync(join(candidate, 'Dockerfile'))) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Box folder from the module location, at most 6 levels up (works from `src/` and `dist/`; not from a bundle). */
function boxDirFromModule(start?: string): string | undefined {
  let dir = start ?? dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'box');
    if (existsSync(join(candidate, 'Dockerfile'))) return candidate;
    dir = dirname(dir);
  }
  return undefined;
}

/**
 * Finds the box folder, in this order: `sources.boxDir`, `GHOST_RUN_BOX_DIR`, upward from this module,
 * upward from `sources.workspace` (each level tries `ghost-runner/box`, then `box`). An explicit folder or
 * environment value is returned as given, even if it holds no Dockerfile: the caller then reports
 * `box-image-missing` when it reads the sources. Returns undefined when nothing is found.
 */
export function findBoxDir(sources: BoxDirSources = {}): string | undefined {
  if (sources.boxDir !== undefined && sources.boxDir !== '') return sources.boxDir;
  const fromEnv = sources.env?.[BOX_DIR_ENV];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const fromModule = boxDirFromModule(sources.moduleDir);
  if (fromModule !== undefined) return fromModule;
  if (sources.workspace !== undefined && sources.workspace !== '') {
    return searchUp(resolve(sources.workspace), [['ghost-runner', 'box'], ['box']]);
  }
  return undefined;
}

/** Same as `findBoxDir`, but throws when no folder is found. */
export function resolveBoxDir(sources: BoxDirSources = {}): string {
  const found = findBoxDir(sources);
  if (found === undefined) throw new Error('box/ directory not found');
  return found;
}

export function boxImageTag(hash: string): string {
  return `${BOX_IMAGE_REPO}:${hash}`;
}

export interface AvailabilityOptions extends BoxDirSources {
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
      const found = findBoxDir(opts);
      if (found === undefined) throw new Error('box/ directory not found');
      expectedHash = computeBoxHash(found);
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
