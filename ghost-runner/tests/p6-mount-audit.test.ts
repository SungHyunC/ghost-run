// Feature: ghost-runner, Property 6: Mount audit detects any deviation
// Validates: Requirements 5.6, 5.7
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import {
  auditInspect,
  BOX_ENV,
  expectedMounts,
  type ExpectedBox,
} from '../src/docker/hardening.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

let executed = 0;

type Json = Record<string, any>;

const pathSeg = fc.stringMatching(/^[a-z0-9]{1,6}$/);
const absPath = fc.array(pathSeg, { minLength: 1, maxLength: 3 }).map((p) => `/${p.join('/')}`);
const imageId = fc.stringMatching(/^[0-9a-f]{12}$/).map((h) => `sha256:${h}`);

const expectedArb: fc.Arbitrary<ExpectedBox> = fc
  .record({
    image: imageId,
    copyDir: absPath.map((p) => `/copies${p}`),
    ro: fc.uniqueArray(fc.tuple(absPath, pathSeg), {
      maxLength: 3,
      selector: ([, d]) => d,
    }),
    imageEnv: fc.uniqueArray(pathSeg.map((s) => `IMG_${s.toUpperCase()}=${s}`), { maxLength: 3 }),
  })
  .map(({ image, copyDir, ro, imageEnv }) => ({
    image,
    imageEnv,
    mounts: expectedMounts({
      copyDir,
      readonlyMounts: ro.map(([source, d]) => ({ source: `/orig${source}`, destination: `/work/${d}` })),
    }),
  }));

/** Builds the `docker inspect` object that matches `expected` exactly. */
function matching(expected: ExpectedBox): Json {
  return {
    Image: expected.image,
    HostConfig: {
      NetworkMode: 'none',
      Privileged: false,
      CapAdd: null,
      CapDrop: ['ALL'],
      ReadonlyRootfs: true,
      SecurityOpt: ['no-new-privileges'],
      PidMode: '',
      IpcMode: 'private',
    },
    Config: {
      Image: expected.image,
      Env: [...Object.entries(BOX_ENV).map(([k, v]) => `${k}=${v}`), ...(expected.imageEnv ?? [])],
    },
    Mounts: expected.mounts.map((m) => ({
      Type: m.type,
      Source: m.type === 'volume' ? '/var/lib/docker/volumes/anon123/_data' : m.source,
      Destination: m.destination,
      RW: m.rw,
    })),
  };
}

type Mutation = (j: Json, pick: number) => void;

const mutations: Record<string, Mutation> = {
  networkMode: (j) => { j['HostConfig'].NetworkMode = 'bridge'; },
  privileged: (j) => { j['HostConfig'].Privileged = true; },
  capAdd: (j) => { j['HostConfig'].CapAdd = ['NET_ADMIN']; },
  capDropNoAll: (j) => { j['HostConfig'].CapDrop = ['NET_RAW']; },
  writableRoot: (j) => { j['HostConfig'].ReadonlyRootfs = false; },
  noSecurityOpt: (j) => { j['HostConfig'].SecurityOpt = []; },
  seccompOnly: (j) => { j['HostConfig'].SecurityOpt = ['seccomp=unconfined']; },
  pidHost: (j) => { j['HostConfig'].PidMode = 'host'; },
  ipcHost: (j) => { j['HostConfig'].IpcMode = 'host'; },
  imageChanged: (j) => { j['Image'] = 'sha256:ffffffffffff'; j['Config'].Image = 'sha256:ffffffffffff'; },
  envExtra: (j) => { j['Config'].Env.push('GHOST_EXTRA=1'); },
  envRemoved: (j, pick) => {
    const names = Object.keys(BOX_ENV);
    const name = names[pick % names.length] as string;
    j['Config'].Env = (j['Config'].Env as string[]).filter((e) => !e.startsWith(`${name}=`));
  },
  envChanged: (j) => {
    j['Config'].Env = (j['Config'].Env as string[]).map((e) => (e.startsWith('CI=') ? 'CI=false' : e));
  },
  mountExtra: (j) => { j['Mounts'].push({ Type: 'bind', Source: '/', Destination: '/host', RW: true }); },
  mountMissing: (j, pick) => { (j['Mounts'] as unknown[]).splice(pick % j['Mounts'].length, 1); },
  mountRwFlipped: (j, pick) => {
    const m = j['Mounts'][pick % j['Mounts'].length];
    m.RW = !m.RW;
  },
  mountSourceChanged: (j) => {
    const m = (j['Mounts'] as Json[]).find((x) => x['Type'] === 'bind') as Json;
    m['Source'] = `${m['Source']}-other`;
  },
  mountDestChanged: (j, pick) => {
    const m = j['Mounts'][pick % j['Mounts'].length];
    m.Destination = `${m.Destination}x`;
  },
  mountTypeChanged: (j) => {
    const m = (j['Mounts'] as Json[]).find((x) => x['Type'] === 'volume') as Json;
    m['Type'] = 'bind';
  },
};

const mutationName = fc.constantFrom(...Object.keys(mutations));

describe('Property 6: Mount audit detects any deviation', () => {
  afterAll(() => {
    console.log(`[p6-mount-audit] mode=${PBT_MODE} numRuns=${NUM_RUNS} executed=${executed}`);
  });

  it(
    'passes on matching inspect JSON (object or array form)',
    () => {
      fc.assert(
        fc.property(expectedArb, fc.boolean(), (expected, wrap) => {
          executed++;
          const j = matching(expected);
          expect(auditInspect(expected, wrap ? [j] : j)).toEqual({ ok: true });
        }),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it(
    'fails with isolation-violation on any single deviation',
    () => {
      fc.assert(
        fc.property(expectedArb, mutationName, fc.nat(100), fc.boolean(), (expected, name, pick, wrap) => {
          executed++;
          const j = matching(expected);
          (mutations[name] as Mutation)(j, pick);
          const r = auditInspect(expected, wrap ? [j] : j);
          expect(r.ok, name).toBe(false);
          if (!r.ok) {
            expect(r.status).toBe('isolation-violation');
            expect(r.differences.length).toBeGreaterThan(0);
          }
        }),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it('fails on non-object inspect output', () => {
    const expected: ExpectedBox = { image: 'sha256:aa', mounts: expectedMounts({ copyDir: '/c' }) };
    for (const bad of [null, undefined, 'x', [], {}]) {
      expect(auditInspect(expected, bad).ok).toBe(false);
    }
  });
});
