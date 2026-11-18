import type { WardSet } from '@ghost-run/core';
import { ConfigError, PlanBoundsError } from './errors.js';

/** Fixed bounds and defaults. Changing them needs a spec change. */
export const MIN_PLAN_ACTIONS = 1;
export const MAX_PLAN_ACTIONS = 50;
export const MIN_EXEC_LIMIT_SEC = 1;
export const MAX_EXEC_LIMIT_SEC = 30;
export const DEFAULT_EXEC_LIMIT_SEC = 25;
/** Absolute_Limit and default of `RunnerOptions.pipelineDeadlineSec` (Req 7.5). */
export const PIPELINE_DEADLINE_SEC = 55;
export const MIN_PIPELINE_DEADLINE_SEC = 1;
export const COPY_LIMIT_SEC = 20;
export const MIN_POOL_SIZE = 1;
export const MAX_POOL_SIZE = 8;

/** Most egress-ward secret files read into `secretValues` per run (Req 9.15). */
export const MAX_SECRET_FILES = 16;
/** Most bytes kept per secret file (Req 9.15): 64 KiB. */
export const MAX_SECRET_FILE_BYTES = 65_536;

export const DEFAULT_EXCLUDE_DIRS: readonly string[] = Object.freeze(['node_modules']);
export const DEFAULT_SECRET_PATTERNS: readonly string[] = Object.freeze([
  '.env',
  '.env.*',
  '**/*.pem',
  '**/id_rsa*',
]);

export type ExcludedDirMode = 'omit' | 'readonly-mount';

export interface ResourceLimits {
  readonly pids: number;
  /** Docker memory string, e.g. "1g". Swap is set to the same value. */
  readonly memory: string;
  readonly cpus: number;
  readonly tmpBytes: number;
}

export interface PoolOptions {
  readonly size: number;
}

export interface RunnerOptions {
  /** Existing directory to rehearse against. Required. */
  readonly original: string;
  readonly excludeDirs?: readonly string[];
  readonly excludedDirMode?: ExcludedDirMode;
  readonly execLimitSec?: number;
  /** Overall pipeline deadline in seconds, 1 to 55, default 55 (Req 7.5). Never above the Absolute_Limit. */
  readonly pipelineDeadlineSec?: number;
  readonly pool?: PoolOptions;
  readonly limits?: Partial<ResourceLimits>;
  readonly secretPatterns?: readonly string[];
  readonly wardSet?: WardSet;
  /** Box image, `<name>@sha256:<64 hex>` only. Default: content-addressed local tag. */
  readonly image?: string;
  /**
   * Caller-chosen run id, `^[A-Za-z0-9_-]{1,64}$`. Becomes the `ghost-run.run-id` label value
   * and the container name suffix, so a watchdog can remove the box by label. Default: random UUID.
   */
  readonly runId?: string;
}

export interface ResolvedRunnerOptions {
  readonly original: string;
  readonly excludeDirs: readonly string[];
  readonly excludedDirMode: ExcludedDirMode;
  readonly execLimitSec: number;
  readonly pipelineDeadlineSec: number;
  readonly copyLimitSec: number;
  readonly pool: PoolOptions | undefined;
  readonly limits: ResourceLimits;
  readonly secretPatterns: readonly string[];
  readonly wardSet: WardSet;
  readonly image: string | undefined;
  /** Validated caller-chosen run id; undefined means the runner makes a random UUID. */
  readonly runId?: string;
}

export const DEFAULT_LIMITS: ResourceLimits = Object.freeze({
  pids: 256,
  memory: '1g',
  cpus: 2,
  tmpBytes: 64 * 1024 * 1024,
});

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const MEMORY_RE = /^[1-9][0-9]*[bkmg]$/i;
export const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Accepts only `<name>@sha256:<64 hex>`. Tags (`name:tag`, `name:tag@sha256:...`)
 * and bare names are rejected. A registry port (`host:5000/img@sha256:...`) is fine.
 */
export function validateImageRef(image: string, option = 'image'): string {
  const bound = 'image must be <name>@sha256:<64 hex digest> (tags are not accepted)';
  const at = image.indexOf('@');
  if (at <= 0 || image.indexOf('@', at + 1) !== -1) throw new ConfigError(option, bound, image);
  const name = image.slice(0, at);
  const digest = image.slice(at + 1);
  const lastSegment = name.slice(name.lastIndexOf('/') + 1);
  if (
    !DIGEST_RE.test(digest) ||
    /[\s\0]/.test(name) ||
    lastSegment.length === 0 ||
    lastSegment.includes(':') ||
    name.startsWith('-')
  ) {
    throw new ConfigError(option, bound, image);
  }
  return image;
}

/** Reads GHOST_BOX_IMAGE from an environment map; undefined when unset or empty. */
export function imageFromEnv(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const v = env['GHOST_BOX_IMAGE'];
  if (v === undefined || v === '') return undefined;
  return validateImageRef(v, 'GHOST_BOX_IMAGE');
}

/** Throws PlanBoundsError unless the plan has 1..50 actions. */
export function validatePlanSize(size: number): void {
  if (!Number.isInteger(size) || size < MIN_PLAN_ACTIONS || size > MAX_PLAN_ACTIONS) {
    throw new PlanBoundsError(`${MIN_PLAN_ACTIONS}..${MAX_PLAN_ACTIONS} actions`, size);
  }
}

function positiveInt(option: string, v: number): void {
  if (!Number.isInteger(v) || v < 1) throw new ConfigError(option, 'positive integer', v);
}

/** Validates options and fills defaults. Throws ConfigError naming the violated bound. */
export function resolveRunnerOptions(opts: RunnerOptions): ResolvedRunnerOptions {
  if (typeof opts.original !== 'string' || opts.original === '') {
    throw new ConfigError('original', 'non-empty directory path', opts.original);
  }

  const excludeDirs = opts.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
  for (const d of excludeDirs) {
    if (typeof d !== 'string' || d === '' || d.includes('/')) {
      throw new ConfigError('excludeDirs', 'non-empty names without "/"', d);
    }
  }

  const excludedDirMode = opts.excludedDirMode ?? 'omit';
  if (excludedDirMode !== 'omit' && excludedDirMode !== 'readonly-mount') {
    throw new ConfigError('excludedDirMode', '"omit" or "readonly-mount"', excludedDirMode);
  }

  const execLimitSec = opts.execLimitSec ?? DEFAULT_EXEC_LIMIT_SEC;
  if (
    typeof execLimitSec !== 'number' ||
    !Number.isFinite(execLimitSec) ||
    execLimitSec < MIN_EXEC_LIMIT_SEC ||
    execLimitSec > MAX_EXEC_LIMIT_SEC
  ) {
    throw new ConfigError('execLimitSec', `${MIN_EXEC_LIMIT_SEC}..${MAX_EXEC_LIMIT_SEC}`, execLimitSec);
  }

  const pipelineDeadlineSec = opts.pipelineDeadlineSec ?? PIPELINE_DEADLINE_SEC;
  if (
    typeof pipelineDeadlineSec !== 'number' ||
    !Number.isFinite(pipelineDeadlineSec) ||
    pipelineDeadlineSec < MIN_PIPELINE_DEADLINE_SEC ||
    pipelineDeadlineSec > PIPELINE_DEADLINE_SEC
  ) {
    throw new ConfigError(
      'pipelineDeadlineSec',
      `${MIN_PIPELINE_DEADLINE_SEC}..${PIPELINE_DEADLINE_SEC}`,
      pipelineDeadlineSec,
    );
  }

  let pool: PoolOptions | undefined;
  if (opts.pool !== undefined) {
    const size = opts.pool.size;
    if (!Number.isInteger(size) || size < MIN_POOL_SIZE || size > MAX_POOL_SIZE) {
      throw new ConfigError('pool.size', `integer ${MIN_POOL_SIZE}..${MAX_POOL_SIZE}`, size);
    }
    pool = { size };
  }

  const limits: ResourceLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  positiveInt('limits.pids', limits.pids);
  positiveInt('limits.tmpBytes', limits.tmpBytes);
  if (!Number.isFinite(limits.cpus) || limits.cpus <= 0) {
    throw new ConfigError('limits.cpus', 'positive number', limits.cpus);
  }
  if (typeof limits.memory !== 'string' || !MEMORY_RE.test(limits.memory)) {
    throw new ConfigError('limits.memory', 'positive size such as "1g"', limits.memory);
  }

  const image = opts.image === undefined ? undefined : validateImageRef(opts.image);

  if (opts.runId !== undefined && (typeof opts.runId !== 'string' || !RUN_ID_RE.test(opts.runId))) {
    throw new ConfigError('runId', 'string matching ^[A-Za-z0-9_-]{1,64}$', opts.runId);
  }
  return {
    original: opts.original,
    excludeDirs: [...excludeDirs],
    excludedDirMode,
    execLimitSec,
    pipelineDeadlineSec,
    copyLimitSec: COPY_LIMIT_SEC,
    pool,
    limits,
    secretPatterns: [...(opts.secretPatterns ?? DEFAULT_SECRET_PATTERNS)],
    wardSet: opts.wardSet ?? { wards: [] },
    image,
    ...(opts.runId !== undefined ? { runId: opts.runId } : {}),
  };
}
