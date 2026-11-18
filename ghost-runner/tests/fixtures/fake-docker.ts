// In-memory Docker double for pipeline tests (no Docker needed).
//
// - Implements `DockerClient` from src/docker/cli.ts and interprets the argv the runner builds
//   (`run`, `inspect`, `exec`, `cp`, `stop`, `kill`, `rm`, `ps`, `volume ls|rm`).
// - `FakeClock` is a manual clock. Latencies and timeouts advance it instead of waiting.
// - One failure can be injected at a chosen phase. `create`, `audit`, `exec`, `collect` are
//   docker calls. `copy`, `fingerprint`, `diff` happen on the host, so tests call
//   `await fake.enter(phase)` at that point of the pipeline double and it throws
//   `InjectedFailure` when armed.
// - Inventory of containers and volumes per run id, to check cleanup (Req 7.8, 16.2, 16.4).
// - Scripted recorder output is served as a tar stream for `docker cp <ctr>:/ghost-rec -`.

import { effectiveTimeoutMs, type DeadlineClock, type DockerCallOptions, type DockerClient, type DockerResult } from '../../src/docker/cli.js';
import { LABEL_RUN_ID } from '../../src/docker/hardening.js';

export type FakePhase = 'copy' | 'create' | 'audit' | 'exec' | 'collect' | 'fingerprint' | 'diff';

export const DOCKER_PHASES: readonly FakePhase[] = ['create', 'audit', 'exec', 'collect'];
export const HOST_PHASES: readonly FakePhase[] = ['copy', 'fingerprint', 'diff'];

export class FakeClock implements DeadlineClock {
  private t: number;
  constructor(start = 1_000_000) {
    this.t = start;
  }
  readonly now = (): number => this.t;
  advance(ms: number): void {
    this.t += Math.max(0, ms);
  }
}

export class InjectedFailure extends Error {
  constructor(readonly phase: FakePhase) {
    super(`injected failure at phase ${phase}`);
    this.name = 'InjectedFailure';
  }
}

/** How an injected failure shows up. Host phases always throw `InjectedFailure`. */
export type FailureMode = 'exit' | 'timeout' | 'spawn-error' | 'corrupt';

export interface InjectedFault {
  readonly phase: FakePhase;
  /** Default 'exit' (non-zero exit code, stderr text). 'corrupt' only affects `collect`. */
  readonly mode?: FailureMode;
}

export interface ExecScript {
  readonly code?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  /** Clock time the step takes. Default 0. */
  readonly durationMs?: number;
  /** The step runs into the execution timeout. */
  readonly timeout?: boolean;
}

export interface RecorderScript {
  /** Files of `/ghost-rec`: step-<i>.strace, steps.jsonl, dns.jsonl, http.jsonl, tls.jsonl. */
  readonly files: Readonly<Record<string, string | Uint8Array>>;
}

export interface FakeDockerOptions {
  readonly clock?: FakeClock;
  readonly fault?: InjectedFault;
  /** Script by action index (the `ghost-step` index argument). Missing index: exit 0. */
  readonly exec?: readonly ExecScript[] | ((stepIndex: number) => ExecScript | undefined);
  readonly recorder?: RecorderScript;
  /** Latency of every docker call (ms of fake time). Default 0. */
  readonly latencyMs?: number;
  /** Edit the inspect object before it is returned, to script an isolation violation. */
  readonly mutateInspect?: (inspect: Record<string, unknown>) => void;
  /** Make `docker run` hand out this container id instead of a generated one. */
  readonly containerId?: string;
}

export interface FakeContainer {
  readonly id: string;
  readonly name: string;
  readonly runId: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly volume: string;
  readonly runArgs: readonly string[];
  running: boolean;
}

export interface FakeVolume {
  readonly name: string;
  readonly runId: string;
}

export interface FakeCall {
  readonly args: readonly string[];
  readonly phase: FakePhase | undefined;
  readonly at: number;
}

// ---------------------------------------------------------------------------
// tar writer (ustar, flat `ghost-rec/` directory)
// ---------------------------------------------------------------------------

function tarHeader(name: string, size: number, type: '0' | '5'): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : (h[i] as number);
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

/** Tar stream as `docker cp <ctr>:/ghost-rec -` prints it. */
export function buildRecorderTar(files: Readonly<Record<string, string | Uint8Array>>): Buffer {
  const parts: Buffer[] = [tarHeader('ghost-rec/', 0, '5')];
  for (const [name, content] of Object.entries(files)) {
    const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
    parts.push(tarHeader(`ghost-rec/${name}`, body.length, '0'), body);
    const pad = (512 - (body.length % 512)) % 512;
    if (pad > 0) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

/**
 * Recorder files for a run in which `steps` actions completed with a live probe and no
 * observations. Extra files (strace text, log lines) can be merged in by the caller.
 */
export function cleanRecorderFiles(
  steps: number,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const files: Record<string, string> = {};
  const markers: string[] = [];
  for (let i = 0; i < steps; i++) {
    files[`step-${i}.strace`] = '';
    markers.push(JSON.stringify({ end: i, exit: 0, probe: true }));
  }
  files['steps.jsonl'] = markers.length === 0 ? '' : `${markers.join('\n')}\n`;
  return { ...files, ...extra };
}

// ---------------------------------------------------------------------------
// the fake client
// ---------------------------------------------------------------------------

const EMPTY = Buffer.alloc(0);

function ok(stdout: string | Buffer = ''): DockerResult {
  return { code: 0, stdout: typeof stdout === 'string' ? Buffer.from(stdout) : stdout, stderr: EMPTY, timedOut: false };
}

function fail(stderr: string, code = 1): DockerResult {
  return { code, stdout: EMPTY, stderr: Buffer.from(stderr), timedOut: false };
}

function phaseOf(args: readonly string[]): FakePhase | undefined {
  switch (args[0]) {
    case 'run':
      return 'create';
    case 'inspect':
      return 'audit';
    case 'exec':
      return 'exec';
    case 'cp':
      return 'collect';
    default:
      return undefined;
  }
}

function valuesOf(args: readonly string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length - 1; i++) if (args[i] === flag) out.push(args[i + 1] as string);
  return out;
}

export class FakeDocker implements DockerClient {
  readonly clock: FakeClock;
  readonly calls: FakeCall[] = [];
  private readonly containers = new Map<string, FakeContainer>();
  private readonly volumes = new Map<string, FakeVolume>();
  private fault: InjectedFault | undefined;
  private seq = 0;

  constructor(private readonly opts: FakeDockerOptions = {}) {
    this.clock = opts.clock ?? new FakeClock();
    this.fault = opts.fault;
  }

  /** Arm (or clear) the single injectable failure. */
  inject(fault: InjectedFault | undefined): void {
    this.fault = fault;
  }

  get pendingFault(): InjectedFault | undefined {
    return this.fault;
  }

  /** Host-side phase hook: throws `InjectedFailure` once when armed for `phase`. */
  async enter(phase: FakePhase, costMs = 0): Promise<void> {
    this.clock.advance(costMs);
    if (this.fault?.phase === phase) {
      this.fault = undefined;
      throw new InjectedFailure(phase);
    }
  }

  containersFor(runId: string): FakeContainer[] {
    return [...this.containers.values()].filter((c) => c.runId === runId);
  }

  volumesFor(runId: string): FakeVolume[] {
    return [...this.volumes.values()].filter((v) => v.runId === runId);
  }

  /** Run ids that still own a container or a volume. */
  leakedRunIds(): string[] {
    return [...new Set([...this.containers.values()].map((c) => c.runId).concat([...this.volumes.values()].map((v) => v.runId)))].sort();
  }

  callsFor(phase: FakePhase): FakeCall[] {
    return this.calls.filter((c) => c.phase === phase);
  }

  async run(args: readonly string[], callOpts: DockerCallOptions = {}): Promise<DockerResult> {
    const phase = phaseOf(args);
    this.calls.push({ args: [...args], phase, at: this.clock.now() });

    const timeoutMs = effectiveTimeoutMs(callOpts, this.clock);
    if (timeoutMs <= 0) return { code: null, stdout: EMPTY, stderr: EMPTY, timedOut: true };

    // Injected fault for this docker call (consumed once).
    if (phase !== undefined && this.fault?.phase === phase) {
      const mode = this.fault.mode ?? 'exit';
      if (mode !== 'corrupt' || phase === 'collect') {
        this.fault = undefined;
        if (mode === 'timeout') {
          this.clock.advance(timeoutMs);
          return { code: null, stdout: EMPTY, stderr: EMPTY, timedOut: true };
        }
        if (mode === 'spawn-error') {
          return { code: null, stdout: EMPTY, stderr: EMPTY, timedOut: false, spawnError: 'spawn docker ENOENT' };
        }
        if (mode === 'corrupt') {
          this.clock.advance(this.opts.latencyMs ?? 0);
          return ok(Buffer.from('this is not a tar stream'));
        }
        this.clock.advance(this.opts.latencyMs ?? 0);
        return fail(`injected failure at phase ${phase}`);
      }
    }

    this.clock.advance(this.opts.latencyMs ?? 0);
    switch (args[0]) {
      case 'run':
        return this.doRun(args);
      case 'inspect':
        return this.doInspect(args);
      case 'exec':
        return this.doExec(args, timeoutMs);
      case 'cp':
        return this.doCp(args);
      case 'stop':
      case 'kill':
        return this.doStop(args);
      case 'rm':
        return this.doRm(args);
      case 'ps':
        return this.doPs(args);
      case 'volume':
        return this.doVolume(args);
      default:
        return ok();
    }
  }

  private doRun(args: readonly string[]): DockerResult {
    const labels: Record<string, string> = {};
    for (const l of valuesOf(args, '--label')) {
      const eq = l.indexOf('=');
      if (eq > 0) labels[l.slice(0, eq)] = l.slice(eq + 1);
    }
    const runId = labels[LABEL_RUN_ID];
    const name = valuesOf(args, '--name')[0];
    if (runId === undefined || name === undefined) return fail('fake docker: run without run-id label or name', 125);
    if ([...this.containers.values()].some((c) => c.name === name)) return fail(`Conflict. The container name "${name}" is already in use`, 125);
    this.seq += 1;
    const id = this.opts.containerId ?? `fakectr${String(this.seq).padStart(4, '0')}${'0'.repeat(52)}`.slice(0, 64);
    const volume = `fakevol${String(this.seq).padStart(4, '0')}`;
    this.containers.set(id, { id, name, runId, labels, volume, runArgs: [...args], running: true });
    this.volumes.set(volume, { name: volume, runId });
    return ok(`${id}\n`);
  }

  private find(ref: string | undefined): FakeContainer | undefined {
    if (ref === undefined) return undefined;
    return this.containers.get(ref) ?? [...this.containers.values()].find((c) => c.name === ref || c.id.startsWith(ref));
  }

  private doInspect(args: readonly string[]): DockerResult {
    const c = this.find(args[args.length - 1]);
    if (c === undefined) return fail('Error: No such object', 1);
    const a = c.runArgs;
    const image = a[a.length - 1] as string;
    const mounts: Record<string, unknown>[] = [];
    for (const m of valuesOf(a, '--mount')) {
      const kv = new Map(m.split(',').map((p) => { const i = p.indexOf('='); return i < 0 ? [p, ''] as const : [p.slice(0, i), p.slice(i + 1)] as const; }));
      const type = kv.get('type') ?? 'bind';
      const dst = kv.get('dst') ?? '';
      const ro = kv.has('readonly');
      mounts.push(type === 'volume'
        ? { Type: 'volume', Name: c.volume, Source: `/var/lib/docker/volumes/${c.volume}/_data`, Destination: dst, RW: !ro }
        : { Type: 'bind', Source: kv.get('src') ?? '', Destination: dst, RW: !ro });
    }
    const secOpt = valuesOf(a, '--security-opt');
    const inspect: Record<string, unknown> = {
      Id: c.id,
      Name: `/${c.name}`,
      Image: image,
      Config: { Image: image, Env: valuesOf(a, '-e'), Labels: c.labels },
      HostConfig: {
        NetworkMode: valuesOf(a, '--network')[0] ?? 'default',
        Privileged: a.includes('--privileged'),
        CapAdd: valuesOf(a, '--cap-add'),
        CapDrop: valuesOf(a, '--cap-drop'),
        ReadonlyRootfs: a.includes('--read-only'),
        SecurityOpt: secOpt,
        PidMode: valuesOf(a, '--pid')[0] ?? '',
        IpcMode: valuesOf(a, '--ipc')[0] ?? 'private',
      },
      Mounts: mounts,
    };
    this.opts.mutateInspect?.(inspect);
    return ok(`${JSON.stringify([inspect])}\n`);
  }

  private doExec(args: readonly string[], timeoutMs: number): DockerResult {
    const stepAt = args.indexOf('ghost-step');
    const index = stepAt >= 0 ? Number(args[stepAt + 1]) : 0;
    const container = args[args.indexOf('ghost-step') - 1] ?? args[1];
    const c = this.find(container);
    if (c === undefined || !c.running) return fail('Error response from daemon: container is not running', 1);
    const script = typeof this.opts.exec === 'function' ? this.opts.exec(index) : this.opts.exec?.[index];
    if (script?.timeout === true) {
      this.clock.advance(timeoutMs);
      return { code: null, stdout: Buffer.from(script.stdout ?? ''), stderr: Buffer.from(script.stderr ?? ''), timedOut: true };
    }
    const duration = script?.durationMs ?? 0;
    if (duration >= timeoutMs) {
      this.clock.advance(timeoutMs);
      return { code: null, stdout: EMPTY, stderr: EMPTY, timedOut: true };
    }
    this.clock.advance(duration);
    return {
      code: script?.code === undefined ? 0 : script.code,
      stdout: Buffer.from(script?.stdout ?? ''),
      stderr: Buffer.from(script?.stderr ?? ''),
      timedOut: false,
    };
  }

  private doCp(args: readonly string[]): DockerResult {
    const src = args[1] ?? '';
    const colon = src.indexOf(':');
    const c = this.find(colon < 0 ? undefined : src.slice(0, colon));
    if (c === undefined) return fail('Error response from daemon: No such container', 1);
    return ok(buildRecorderTar(this.opts.recorder?.files ?? cleanRecorderFiles(0)));
  }

  private doStop(args: readonly string[]): DockerResult {
    const c = this.find(args[args.length - 1]);
    if (c === undefined) return fail('Error response from daemon: No such container', 1);
    c.running = false;
    return ok(`${c.id}\n`);
  }

  private doRm(args: readonly string[]): DockerResult {
    const refs = args.slice(1).filter((a) => !a.startsWith('-'));
    const removeVolumes = args.some((a) => a === '-v' || a === '-fv' || a === '-vf');
    let code = 0;
    let err = '';
    for (const ref of refs) {
      const c = this.find(ref);
      if (c === undefined) {
        code = 1;
        err += `Error: No such container: ${ref}\n`;
        continue;
      }
      if (c.running && !args.some((a) => a === '-f' || a === '-fv' || a === '-vf' || a === '--force')) {
        code = 1;
        err += `Error: cannot remove running container ${ref}\n`;
        continue;
      }
      this.containers.delete(c.id);
      if (removeVolumes) this.volumes.delete(c.volume);
    }
    return code === 0 ? ok(refs.join('\n')) : fail(err, code);
  }

  private doPs(args: readonly string[]): DockerResult {
    const filters = valuesOf(args, '--filter').concat(valuesOf(args, '-f'));
    let list = [...this.containers.values()];
    if (!args.includes('-a') && !args.includes('--all')) list = list.filter((c) => c.running);
    for (const f of filters) {
      if (f.startsWith('label=')) {
        const spec = f.slice('label='.length);
        const eq = spec.indexOf('=');
        list = list.filter((c) => (eq < 0 ? spec in c.labels : c.labels[spec.slice(0, eq)] === spec.slice(eq + 1)));
      } else if (f.startsWith('name=')) {
        list = list.filter((c) => c.name.includes(f.slice('name='.length)));
      }
    }
    const format = valuesOf(args, '--format')[0];
    if (format !== undefined) {
      const lines = list.map((c) =>
        format
          .replace(/\{\{\.ID\}\}/g, c.id)
          .replace(/\{\{\.Label "([^"]+)"\}\}/g, (_m, k: string) => c.labels[k] ?? ''),
      );
      return ok(lines.join('\n') + (lines.length > 0 ? '\n' : ''));
    }
    return ok(list.map((c) => c.id).join('\n') + (list.length > 0 ? '\n' : ''));
  }

  /** Test helper: all containers (any state). */
  allContainers(): FakeContainer[] {
    return [...this.containers.values()];
  }

  private doVolume(args: readonly string[]): DockerResult {
    if (args[1] === 'ls') {
      const names = [...this.volumes.keys()];
      return ok(names.join('\n') + (names.length > 0 ? '\n' : ''));
    }
    if (args[1] === 'rm') {
      const names = args.slice(2).filter((a) => !a.startsWith('-'));
      const missing = names.filter((n) => !this.volumes.has(n));
      for (const n of names) this.volumes.delete(n);
      return missing.length === 0 ? ok(names.join('\n')) : fail(`Error: No such volume: ${missing.join(' ')}`, 1);
    }
    return ok();
  }
}

export function createFakeDocker(opts: FakeDockerOptions = {}): FakeDocker {
  return new FakeDocker(opts);
}
