// Pure builders for the hardened `docker run` / `docker exec` argv and the inspect audit.
// Resource limits come from config.ts (ResourceLimits, resolved via ResolvedRunnerOptions.limits).

import { DEFAULT_LIMITS, type ResolvedRunnerOptions, type ResourceLimits } from '../config.js';

const MIB = 1024 * 1024;

/** `--tmpfs` size in whole MiB (rounded up so the configured size is never reduced). */
function tmpMiB(limits: ResourceLimits): number {
  return Math.ceil(limits.tmpBytes / MIB);
}

export const BOX_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

/** The only environment variables a box receives (Req 5.8). */
export const BOX_ENV: Readonly<Record<string, string>> = {
  PATH: BOX_PATH,
  HOME: '/tmp/home',
  CI: 'true',
  NPM_CONFIG_UPDATE_NOTIFIER: 'false',
};

export const WORK_DIR = '/work';
export const REC_DIR = '/ghost-rec';

export const LABEL_RUN_ID = 'ghost-run.run-id';
export const LABEL_POOL = 'ghost-run.pool';
export const LABEL_POOL_OWNER = 'ghost-run.pool-owner';

/**
 * Self-expiry of a box (defense in depth against leaks). `ghost-init` exits after this many
 * seconds, so a box whose host process was killed does not stay `Up`. A run is bounded by the
 * 55 s pipeline deadline plus collect and cleanup, so 120 s never cuts a live run.
 */
export const BOX_MAX_LIFETIME_SEC = 120;
/** Pool slots idle until acquired, so they live longer; the pool exit handlers still remove them. */
export const POOL_BOX_MAX_LIFETIME_SEC = 3_600;

export interface HardeningOptions {
  readonly image: string;
  /** Usually `ResolvedRunnerOptions['limits']`; defaults to DEFAULT_LIMITS. */
  readonly limits?: ResolvedRunnerOptions['limits'];
  readonly uid: number;
  readonly gid: number;
  /** Set for pool slots. */
  readonly poolOwner?: string;
  /** Seconds until `ghost-init` exits on its own. Default BOX_MAX_LIFETIME_SEC. */
  readonly maxLifetimeSec?: number;
}

export interface ReadonlyMount {
  /** Absolute host path (the Original sub-directory). */
  readonly source: string;
  /** Absolute path inside the box, below /work. */
  readonly destination: string;
}

export interface BoxMounts {
  /** Real path of the Copy directory (the only read-write host path). */
  readonly copyDir: string;
  readonly readonlyMounts?: readonly ReadonlyMount[];
}

export function containerName(runId: string): string {
  return `ghost-${runId}`;
}

function assertNoComma(label: string, value: string): void {
  // `--mount` is a comma separated list; a comma in a path would inject extra mount keys.
  if (value.includes(',') || value.includes('\0') || value.includes('\n')) {
    throw new Error(`${label} contains a character that cannot be passed to --mount`);
  }
}

export function buildRunArgs(opts: HardeningOptions, runId: string, mounts: BoxMounts): string[] {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  assertNoComma('copy directory', mounts.copyDir);
  assertNoComma('run id', runId);
  const args: string[] = [
    'run',
    '-d',
    '--name', containerName(runId),
    '--label', `${LABEL_RUN_ID}=${runId}`,
  ];
  if (opts.poolOwner !== undefined) {
    args.push('--label', `${LABEL_POOL}=1`, '--label', `${LABEL_POOL_OWNER}=${opts.poolOwner}`);
  }
  args.push(
    '--network', 'none',
    '--dns', '127.0.0.1',
    // PID 1 of the box is Node (`ghost-init`), which does not reap orphans; `--init` puts a
    // reaping init in front so orphaned children of an action cannot pile up as zombies
    // and exhaust --pids-limit.
    '--init',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', String(limits.pids),
    '--memory', limits.memory,
    '--memory-swap', limits.memory,
    '--cpus', String(limits.cpus),
    '--read-only',
    '--tmpfs', `/tmp:rw,exec,nosuid,nodev,size=${tmpMiB(limits)}m`,
    '--user', `${opts.uid}:${opts.gid}`,
    '--workdir', WORK_DIR,
    '--mount', `type=bind,src=${mounts.copyDir},dst=${WORK_DIR}`,
    // Anonymous recorder volume (removed by `rm -v`). Anonymous volumes do not inherit container
    // labels, so the run-id label is set on the volume too; leak checks can then find it.
    '--mount', `type=volume,dst=${REC_DIR},volume-label=${LABEL_RUN_ID}=${runId}`,
  );
  for (const m of mounts.readonlyMounts ?? []) {
    assertNoComma('read-only mount source', m.source);
    assertNoComma('read-only mount destination', m.destination);
    args.push('--mount', `type=bind,src=${m.source},dst=${m.destination},readonly`);
  }
  for (const [k, v] of Object.entries(BOX_ENV)) args.push('-e', `${k}=${v}`);
  args.push('--entrypoint', 'ghost-init', opts.image, '--max-lifetime', String(opts.maxLifetimeSec ?? BOX_MAX_LIFETIME_SEC));
  return args;
}

/**
 * argv for `docker exec` of one action. The action text is a single element and is never
 * split, quoted, or interpolated (Req 5.9). `cwd` is relative to the Copy root.
 */
export function buildExecArgs(container: string, stepIndex: number, cwd: string | undefined, action: string): string[] {
  const rel = (cwd ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
  const workdir = rel === '' ? WORK_DIR : `${WORK_DIR}/${rel}`;
  return ['exec', '-w', workdir, container, 'ghost-step', String(stepIndex), rel, action];
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface ExpectedMount {
  readonly type: 'bind' | 'volume';
  /** Host source. Required for bind mounts; ignored for volumes (anonymous name). */
  readonly source?: string;
  readonly destination: string;
  readonly rw: boolean;
}

export interface ExpectedBox {
  /** Image id (sha256:...) or the exact image reference passed to `docker run`. */
  readonly image: string;
  readonly mounts: readonly ExpectedMount[];
  /** Variables baked into the image, allowed in addition to BOX_ENV. */
  readonly imageEnv?: readonly string[];
}

export type AuditResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 'isolation-violation'; readonly differences: readonly string[] };

export function expectedMounts(mounts: BoxMounts): ExpectedMount[] {
  const list: ExpectedMount[] = [
    { type: 'bind', source: mounts.copyDir, destination: WORK_DIR, rw: true },
    { type: 'volume', destination: REC_DIR, rw: true },
  ];
  for (const m of mounts.readonlyMounts ?? []) {
    list.push({ type: 'bind', source: m.source, destination: m.destination, rw: false });
  }
  return list;
}

type Json = Record<string, unknown>;

function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

function strList(v: unknown): string[] | undefined {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;
}

function mountKey(type: string, source: string, destination: string, rw: boolean): string {
  return JSON.stringify([type, source, destination, rw]);
}

/**
 * Compares `docker inspect` output (one container object, or the array Docker prints)
 * with the expected hardened configuration. Anything missing, malformed, or different is a
 * difference; a non-empty list means `isolation-violation`.
 */
export function auditInspect(expected: ExpectedBox, inspectJson: unknown): AuditResult {
  const diffs: string[] = [];
  const root = obj(Array.isArray(inspectJson) ? inspectJson[0] : inspectJson);
  const host = obj(root['HostConfig']);
  const config = obj(root['Config']);

  if (host['NetworkMode'] !== 'none') diffs.push('network mode is not "none"');
  if (host['Privileged'] !== false) diffs.push('container is privileged or privilege flag missing');

  const capAdd = strList(host['CapAdd']);
  if (capAdd === undefined || capAdd.length > 0) diffs.push('capabilities were added');
  const capDrop = strList(host['CapDrop']);
  if (capDrop === undefined || !capDrop.map((c) => c.toUpperCase()).includes('ALL')) diffs.push('capabilities are not all dropped');

  if (host['ReadonlyRootfs'] !== true) diffs.push('root file system is not read-only');

  const secOpt = strList(host['SecurityOpt']);
  if (secOpt === undefined || !secOpt.some((o) => o === 'no-new-privileges' || o === 'no-new-privileges=true' || o === 'no-new-privileges:true')) {
    diffs.push('no-new-privileges is not set');
  }

  const pid = host['PidMode'];
  const sharesNamespace = (v: unknown): boolean => typeof v === 'string' && (v === 'host' || v.startsWith('container:'));
  if (sharesNamespace(pid)) diffs.push(`PID mode is "${String(pid)}"`);
  const ipc = host['IpcMode'];
  if (sharesNamespace(ipc)) diffs.push(`IPC mode is "${String(ipc)}"`);

  const imageMatches = root['Image'] === expected.image || config['Image'] === expected.image;
  if (!imageMatches) diffs.push('image differs from the expected image');

  const env = strList(config['Env']);
  if (env === undefined) {
    diffs.push('environment is missing');
  } else {
    const allowed = new Set<string>([
      ...Object.entries(BOX_ENV).map(([k, v]) => `${k}=${v}`),
      ...(expected.imageEnv ?? []),
    ]);
    const actual = new Set(env);
    for (const e of actual) if (!allowed.has(e)) diffs.push(`unexpected environment entry ${e.split('=')[0] ?? ''}`);
    for (const [k, v] of Object.entries(BOX_ENV)) if (!actual.has(`${k}=${v}`)) diffs.push(`environment variable ${k} missing or changed`);
  }

  const rawMounts = root['Mounts'];
  if (!Array.isArray(rawMounts)) {
    diffs.push('mount list is missing');
  } else {
    const actualKeys = rawMounts.map((m) => {
      const mm = obj(m);
      const type = typeof mm['Type'] === 'string' ? mm['Type'] : '?';
      const source = type === 'volume' ? '' : typeof mm['Source'] === 'string' ? mm['Source'] : '?';
      const dest = typeof mm['Destination'] === 'string' ? mm['Destination'] : '?';
      return mountKey(type, source, dest, mm['RW'] === true);
    });
    const expectedKeys = expected.mounts.map((m) => mountKey(m.type, m.type === 'volume' ? '' : (m.source ?? '?'), m.destination, m.rw));
    const remaining = [...actualKeys];
    for (const k of expectedKeys) {
      const i = remaining.indexOf(k);
      if (i === -1) diffs.push(`expected mount missing: ${(JSON.parse(k) as string[])[2] ?? ''}`);
      else remaining.splice(i, 1);
    }
    for (const k of remaining) diffs.push(`unexpected mount: ${(JSON.parse(k) as string[])[2] ?? ''}`);
  }

  return diffs.length === 0 ? { ok: true } : { ok: false, status: 'isolation-violation', differences: diffs };
}
