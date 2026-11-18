// [docker] W9: the in-box recorder binds UDP 53 and TCP 80/443 as the unprivileged host user
// under the full hardening options (--cap-drop ALL, --user uid:gid, --read-only, --network none,
// no-new-privileges, --init). Skips with `skipped (docker unavailable)` without Docker.
// Validates: Requirements 8.13, 5.1
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { checkDockerAvailability } from '../src/docker/availability.js';
import { createBox, type Box } from '../src/docker/box.js';
import { createDockerClient } from '../src/docker/cli.js';
import { buildRunArgs } from '../src/docker/hardening.js';
import { describeDocker } from './docker-available.js';

const client = createDockerClient();
const text = (b: Buffer): string => b.toString('utf8');

interface Listener {
  readonly port: number;
  readonly uid: number;
}

/** Parses /proc/net/{tcp,udp}: TCP keeps LISTEN rows (state 0A), UDP keeps unconnected rows (state 07). */
function parseListeners(proc: string, state: string): Listener[] {
  const out: Listener[] = [];
  for (const line of proc.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 8 || f[3] !== state) continue;
    const port = Number.parseInt((f[1] ?? '').split(':')[1] ?? '', 16);
    out.push({ port, uid: Number(f[7]) });
  }
  return out;
}

describeDocker('hardened box port bindings (W9)', () => {
  const runId = `ports-${randomUUID()}`;
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  let dir = '';
  let box: Box | undefined;
  let image = '';

  const exec = async (script: string): Promise<{ code: number; out: string }> => {
    const res = await client.run(['exec', box?.containerId ?? '', 'sh', '-c', script], { timeoutMs: 10_000 });
    return { code: res.code ?? -1, out: text(res.stdout) };
  };

  beforeAll(async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'ghost-ports-')));
    writeFileSync(join(dir, 'placeholder.txt'), 'x\n');
    const avail = await checkDockerAvailability(client, { limitMs: 10_000 });
    if (!avail.available) throw new Error(`box image unavailable: ${avail.reason}`);
    image = avail.imageRef;
    const created = await createBox(client, {
      runId,
      image,
      imageEnv: avail.imageEnv,
      mounts: { copyDir: dir },
      uid,
      gid,
      execLimitMs: 25_000,
      deadlineAt: Date.now() + 55_000,
    });
    if (!created.ok) throw new Error(`box not created: ${JSON.stringify(created)}`);
    box = created.box;
    // The recorder writes /ghost-rec/ready only after DNS, HTTP and TLS all bound.
    const until = Date.now() + 15_000;
    for (;;) {
      if ((await exec('test -f /ghost-rec/ready')).code === 0) break;
      if (Date.now() > until) throw new Error('recorder never became ready');
      await new Promise((r) => setTimeout(r, 200));
    }
  }, 60_000);

  afterAll(async () => {
    if (box !== undefined) await box.cleanup();
    // Leftover check by run-id label; never bypass a blocked removal, only report.
    const left = await client.run(['ps', '-aq', '--filter', `label=ghost-run.run-id=${runId}`]);
    const ids = text(left.stdout).trim();
    if (ids !== '') console.warn(`leftover containers for run ${runId}: ${ids}`);
    if (dir !== '') rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('starts the box with every hardening option', () => {
    const args = buildRunArgs({ image, uid, gid }, runId, { copyDir: dir });
    const pair = (a: string, b: string): boolean => args.some((v, i) => v === a && args[i + 1] === b);
    expect(pair('--cap-drop', 'ALL')).toBe(true);
    expect(pair('--user', `${uid}:${gid}`)).toBe(true);
    expect(pair('--security-opt', 'no-new-privileges')).toBe(true);
    expect(pair('--network', 'none')).toBe(true);
    expect(args).toContain('--read-only');
    expect(args).toContain('--init');
  });

  it('runs the container as the unprivileged host user with the hardened host config', async () => {
    const res = await client.run(['inspect', box?.containerId ?? ''], { timeoutMs: 5_000 });
    const root = (JSON.parse(text(res.stdout)) as Array<Record<string, any>>)[0] ?? {};
    expect(root['Config'].User).toBe(`${uid}:${gid}`);
    expect(root['HostConfig'].CapDrop).toContain('ALL');
    expect(root['HostConfig'].ReadonlyRootfs).toBe(true);
    expect(root['HostConfig'].NetworkMode).toBe('none');
    expect(root['HostConfig'].SecurityOpt).toContain('no-new-privileges');
    expect(uid).not.toBe(0);
    const id = await exec('id -u; id -g');
    expect(id.out.trim().split('\n')).toEqual([String(uid), String(gid)]);
  }, 20_000);

  it('binds UDP 53 and TCP 80 and 443 as that user', async () => {
    const tcp = parseListeners((await exec('cat /proc/net/tcp /proc/net/tcp6 2>/dev/null')).out.replace(/^\s*sl.*$/gm, '\nsl'), '0A');
    const udp = parseListeners((await exec('cat /proc/net/udp /proc/net/udp6 2>/dev/null')).out.replace(/^\s*sl.*$/gm, '\nsl'), '07');
    const owner = (list: Listener[], port: number): number | undefined => list.find((l) => l.port === port)?.uid;
    expect(owner(udp, 53)).toBe(uid);
    expect(owner(tcp, 80)).toBe(uid);
    expect(owner(tcp, 443)).toBe(uid);
  }, 20_000);
});
