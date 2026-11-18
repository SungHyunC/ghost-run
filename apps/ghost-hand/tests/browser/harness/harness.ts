// Chrome harness page (task 17.1). Built by tests/browser/run-chrome.mjs, never part of the app.
// `?mode=ready` only measures the time until the MuJoCo_Module is initialized and one world is ready;
// `?mode=full` runs every check and POSTs one JSON document to /result. Every check catches its own error,
// so a failing check is reported and the others still run. No storage API is used.
import { parseWards } from '@ghost-run/wards-config';
import {
  REFERENCE_PLAN,
  WORLD_CONFIG,
  createGhostHandWorld,
  parseVariantConfig,
  runVariantJob,
  sampleVariant,
} from '@ghost-run/drawer-arm';
import type { GhostHandAction, GhostHandWorld, VariantConfig, VariantJob } from '@ghost-run/drawer-arm';
import wardsText from '@ghost-run/drawer-arm/wards.yaml?raw';
import variantConfigText from '@ghost-run/drawer-arm/variant-config.json?raw';
import fc from 'fast-check';
import type { WardSet } from '@ghost-run/core';
import type { Capabilities } from '../../../src/capabilities';
import { createExecutor } from '../../../src/exec/select';
import type { VariantExecutor, VariantOutcome } from '../../../src/exec/executor';
import { createPoolExecutor } from '../../../src/exec/pool';
import type { WorkerLike } from '../../../src/exec/pool';
import { createInlineExecutor } from '../../../src/exec/inline';
import { runGhostHand } from '../../../src/pipeline/run';
import { createOverlayRenderer } from '../../../src/overlay/renderer';
import { buildOverlayViewModel } from '../../../src/overlay/view-model';
import { deepEqual } from '../../../src/reference';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'full';
const caps: Capabilities = { jointSelfWard: false, claimsOptional: true, bannerNotApplicable: false };

async function post(path: string, body: unknown): Promise<void> {
  await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
const log = (text: string): Promise<void> => post('/log', { text });

const spawnSimWorker = (): WorkerLike =>
  new Worker(new URL('../../../src/worker/sim-worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface CheckResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly [key: string]: unknown;
}

async function check(name: string, fn: () => Promise<Record<string, unknown>>): Promise<CheckResult> {
  const started = performance.now();
  try {
    const out = await fn();
    await log(`${name}: done in ${Math.round(performance.now() - started)} ms`);
    return { ok: true, ...out };
  } catch (error) {
    await log(`${name}: FAILED ${messageOf(error)}`);
    return { ok: false, error: messageOf(error) };
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

// ------------------------------------------------------------------ ready mode

async function readyMode(): Promise<void> {
  const world = await createGhostHandWorld({ recordFrames: true });
  await world.snapshot();
  // performance.now() counts from the start of the navigation.
  const readyMs = performance.now();
  world.dispose();
  await post('/result', { mode: 'ready', readyMs });
}

// ------------------------------------------------------------------ hashes

async function mainThreadHashes(): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const world = await createGhostHandWorld({ recordFrames: false });
    try {
      out.push((await world.referenceExecute(REFERENCE_PLAN)).trajectoryHash);
    } finally {
      world.dispose();
    }
  }
  return out;
}

function workerHashes(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./harness-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; hashes?: string[]; error?: string }>) => {
      worker.terminate();
      if (event.data.ok && event.data.hashes !== undefined) resolve(event.data.hashes);
      else reject(new Error(event.data.error ?? 'worker failed'));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`worker error: ${event.message}`));
    };
    worker.postMessage({});
  });
}

// ------------------------------------------------------------------ Property 5 and Property 10 with real Workers

const R = WORLD_CONFIG.actionRanges;
const actionArb: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(
      fc.double({ min: R.target.x[0], max: R.target.x[1], noNaN: true }),
      fc.double({ min: R.target.y[0], max: R.target.y[1], noNaN: true }),
      fc.double({ min: R.target.z[0], max: R.target.z[1], noNaN: true }),
    ),
    speed: fc.double({ min: R.speed[0], max: R.speed[1], noNaN: true }),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: fc.double({ min: R.force[0], max: R.force[1], noNaN: true }) }),
  fc.record({
    type: fc.constant('pull' as const),
    distance: fc.double({ min: R.distance[0], max: R.distance[1], noNaN: true }),
    speed: fc.double({ min: R.speed[0], max: R.speed[1], noNaN: true }),
  }),
  fc.constant({ type: 'release' as const }),
);

interface Fixture {
  readonly wardSet: WardSet;
  readonly variantConfig: VariantConfig;
}

function loadFixture(): Fixture {
  const w = parseWards(wardsText);
  if (!w.ok) throw new Error('wards.yaml invalid');
  const c = parseVariantConfig(variantConfigText);
  if (!c.ok) throw new Error('variant-config.json invalid');
  return { wardSet: w.wardSet, variantConfig: c.config };
}

function recording(executor: VariantExecutor): { executor: VariantExecutor; outcomes: () => readonly VariantOutcome[] } {
  let last: readonly VariantOutcome[] = [];
  return {
    executor: {
      run: async (jobs) => {
        last = await executor.run(jobs);
        return last;
      },
      dispose: () => undefined,
    },
    outcomes: () => last,
  };
}

async function runWith(
  fx: Fixture,
  world: GhostHandWorld,
  executor: VariantExecutor,
  plan: readonly GhostHandAction[],
  seed: number,
  count: number,
) {
  const rec = recording(executor);
  const run = await runGhostHand({
    plan,
    wardSet: fx.wardSet,
    variantConfig: fx.variantConfig,
    seed,
    variantCount: count,
    world,
    executor: rec.executor,
    evidence: { selfCheck: { state: 'pending' }, capabilities: caps },
  });
  return { run, outcomes: rec.outcomes() };
}

function assertEqual(a: unknown, b: unknown, what: string): void {
  if (!deepEqual(a, b)) throw new Error(`${what} differ`);
}

async function property5(fx: Fixture): Promise<Record<string, unknown>> {
  const world = await createGhostHandWorld({ recordFrames: true });
  const inline = createInlineExecutor(() => createGhostHandWorld({ recordFrames: true }));
  let executions = 0;
  const holds = async (plan: readonly GhostHandAction[], seed: number, count: number, workers: number): Promise<void> => {
    executions += 1;
    const a = await runWith(fx, world, inline, plan, seed, count);
    const pool = createPoolExecutor({ size: workers, spawn: spawnSimWorker });
    try {
      const b = await runWith(fx, world, pool, plan, seed, count);
      if (b.outcomes.some((o) => o.engineError !== undefined)) throw new Error('a real worker reported an engineError');
      assertEqual(
        b.outcomes.map((o) => o.params),
        a.outcomes.map((o) => o.params),
        'Variant_Params',
      );
      assertEqual(
        b.outcomes.map((o) => o.trajectoryHash),
        a.outcomes.map((o) => o.trajectoryHash),
        'Trajectory_Hashes',
      );
      assertEqual(
        b.outcomes.map((o) => o.index),
        Array.from({ length: count }, (_, i) => i),
        'result indices',
      );
      assertEqual(b.run.variantResults, a.run.variantResults, 'Variant_Results');
      assertEqual(b.run, a.run, 'GhostRun');
    } finally {
      pool.dispose();
    }
  };
  try {
    await holds([{ type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 }, { type: 'release' }], 12345, 20, 4);
    await holds([{ type: 'grasp', force: 2 }], 0, 1, 1);
    await fc.assert(
      fc.asyncProperty(
        fc.array(actionArb, { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 4 }),
        holds,
      ),
      { numRuns: 8 },
    );
  } finally {
    inline.dispose();
    world.dispose();
  }
  return { executions, fastCheckRuns: 8, fixedExamples: 2 };
}

async function property10(fx: Fixture): Promise<Record<string, unknown>> {
  const world = await createGhostHandWorld({ recordFrames: true });
  let executions = 0;
  const holds = async (prefix: readonly GhostHandAction[], plan: readonly GhostHandAction[], seed: number): Promise<void> => {
    executions += 1;
    await world.resetReference();
    if (prefix.length > 0) await world.referenceExecute(prefix);
    const before = (await world.fingerprint()).hash;
    const runOnce = async () => {
      const pool = createPoolExecutor({ size: 3, spawn: spawnSimWorker });
      try {
        return (await runWith(fx, world, pool, plan, seed, 3)).run;
      } finally {
        pool.dispose();
      }
    };
    const normal = await runOnce();
    if ((await world.fingerprint()).hash !== before) throw new Error('reality changed after a pooled ghost run');
    if (!normal.p1.equal || normal.p1.before !== before || normal.p1.after !== before) throw new Error('p1 fingerprints differ');
    const realNow = Date.now;
    const realRandom = Math.random;
    Date.now = (): number => {
      throw new Error('Date.now called during a ghost run');
    };
    Math.random = (): number => {
      throw new Error('Math.random called during a ghost run');
    };
    let guarded;
    try {
      guarded = await runOnce();
    } finally {
      Date.now = realNow;
      Math.random = realRandom;
    }
    if ((await world.fingerprint()).hash !== before) throw new Error('reality changed after the guarded run');
    assertEqual(guarded, normal, 'guarded and normal GhostRun');
  };
  try {
    await holds([{ type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 }], [{ type: 'grasp', force: 20 }, { type: 'release' }], 7);
    await holds([], [{ type: 'reach', target: [0, 0.7, 0.7], speed: 0.05 }], 0);
    await fc.assert(
      fc.asyncProperty(
        fc.array(actionArb, { minLength: 0, maxLength: 3 }),
        fc.array(actionArb, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        holds,
      ),
      { numRuns: 6 },
    );
  } finally {
    world.dispose();
  }
  return { executions, fastCheckRuns: 6, fixedExamples: 2 };
}

// ------------------------------------------------------------------ timings

async function ghostRunTimes(fx: Fixture, count: number, repeats: number): Promise<Record<string, unknown>> {
  const world = await createGhostHandWorld({ recordFrames: true });
  const times: number[] = [];
  try {
    for (let i = 0; i < repeats; i += 1) {
      const executor = createExecutor({ factory: () => createGhostHandWorld({ recordFrames: true }), spawn: spawnSimWorker });
      const started = performance.now();
      try {
        const rec = await runWith(fx, world, executor, REFERENCE_PLAN, 1, count);
        if (rec.outcomes.some((o) => o.engineError !== undefined)) throw new Error('engineError in a timed run');
      } finally {
        executor.dispose();
      }
      times.push(performance.now() - started);
    }
  } finally {
    world.dispose();
  }
  return { variants: count, runsMs: times, firstMs: times[0], medianMs: median(times), maxMs: Math.max(...times) };
}

interface MemoryApi {
  usedJSHeapSize: number;
}
const jsHeap = (): number => (performance as unknown as { memory?: MemoryApi }).memory?.usedJSHeapSize ?? -1;
const collect = async (): Promise<void> => {
  (globalThis as unknown as { gc?: () => void }).gc?.();
  await new Promise((r) => setTimeout(r, 50));
};

async function memory(fx: Fixture): Promise<Record<string, unknown>> {
  const gcAvailable = typeof (globalThis as unknown as { gc?: unknown }).gc === 'function';
  const RUNS = 40;

  // Leg 1: 40 pipeline runs on one reference world, two inline variants each.
  const world = await createGhostHandWorld({ recordFrames: true });
  const inline = createInlineExecutor(() => createGhostHandWorld({ recordFrames: true }));
  const heaps: number[] = [];
  const js: number[] = [];
  try {
    for (let run = 1; run <= RUNS; run += 1) {
      await runWith(fx, world, inline, REFERENCE_PLAN, run, 2);
      heaps.push(world.heapBytes());
      if (run === 1 || run % 10 === 0) {
        await collect();
        js.push(jsHeap());
      }
    }
  } finally {
    inline.dispose();
    world.dispose();
  }

  // Leg 2: 40 variant jobs on one long-lived world (what a worker does).
  const jobWorld = await createGhostHandWorld({ recordFrames: true });
  const jobHeaps: number[] = [];
  try {
    const start = await jobWorld.snapshot();
    for (let run = 1; run <= RUNS; run += 1) {
      const job: VariantJob = {
        index: 0,
        params: sampleVariant(run, 0, fx.variantConfig),
        startState: start.state,
        actions: REFERENCE_PLAN,
        recordFrames: true,
      };
      await runVariantJob(jobWorld, job);
      jobHeaps.push(jobWorld.heapBytes());
    }
  } finally {
    jobWorld.dispose();
  }

  // Leg 3: 12 pooled ghost runs with 8 variants (workers are started and terminated per run).
  const refWorld = await createGhostHandWorld({ recordFrames: true });
  const pooledJs: number[] = [];
  try {
    for (let run = 1; run <= 12; run += 1) {
      const pool = createPoolExecutor({ size: 3, spawn: spawnSimWorker });
      try {
        await runWith(fx, refWorld, pool, REFERENCE_PLAN, run, 8);
      } finally {
        pool.dispose();
      }
      if (run === 2 || run === 12) {
        await collect();
        pooledJs.push(jsHeap());
      }
    }
  } finally {
    refWorld.dispose();
  }

  return {
    gcAvailable,
    pipelineRuns: RUNS,
    heapAfterRun1Bytes: heaps[0],
    heapAfterRun40Bytes: heaps[RUNS - 1],
    heapMaxBytes: Math.max(...heaps),
    heapEqual: heaps[0] === heaps[RUNS - 1] && Math.max(...heaps) === heaps[0],
    jobRuns: RUNS,
    jobHeapAfterRun1Bytes: jobHeaps[0],
    jobHeapAfterRun40Bytes: jobHeaps[RUNS - 1],
    jobHeapEqual: jobHeaps[0] === jobHeaps[RUNS - 1] && Math.max(...jobHeaps) === jobHeaps[0],
    jsHeapSamplesBytes: js,
    jsHeapSampleRuns: [1, 10, 20, 30, 40],
    pooledJsHeapRun2Bytes: pooledJs[0],
    pooledJsHeapRun12Bytes: pooledJs[1],
  };
}

// ------------------------------------------------------------------ overlay frame time (task 17.3)

const FRAME_WARMUP = 30;
const FRAME_SAMPLES = 300;
const nextAnimationFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * Draws the Ghost_Overlay with `count` ghost arms (plus the base arm) through the real renderer. Each sample is one
 * requestAnimationFrame callback that calls `setFrame(i)` (pose update + gl.render) and then `gl.finish()`.
 * Two numbers per sample: `workMs` = performance.now() around setFrame + finish (render cost including the GPU wait),
 * `deltaMs` = difference between consecutive requestAnimationFrame timestamps (frame interval; capped by the display
 * refresh when the browser has vsync, so a value near 16.7 ms can mean "idle until the next vsync").
 */
async function overlayFrameTimes(fx: Fixture, count: number): Promise<Record<string, unknown>> {
  const world = await createGhostHandWorld({ recordFrames: true });
  const executor = createExecutor({ factory: () => createGhostHandWorld({ recordFrames: true }), spawn: spawnSimWorker });
  let overlay;
  try {
    const rec = await runWith(fx, world, executor, REFERENCE_PLAN, 1, count);
    if (rec.outcomes.some((o) => o.engineError !== undefined)) throw new Error('engineError in the ghost run');
    overlay = rec.run.overlay;
  } finally {
    executor.dispose();
    world.dispose();
  }
  const model = buildOverlayViewModel(overlay);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:800px;height:450px;display:block';
  document.body.appendChild(canvas);
  const renderer = createOverlayRenderer(canvas);
  if ('unavailable' in renderer) throw new Error('WebGL is not available');
  const glCtx = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
  if (glCtx === null) throw new Error('could not get the WebGL context of the overlay canvas');
  const dbg = glCtx.getExtension('WEBGL_debug_renderer_info');
  const glRenderer = dbg === null ? 'unknown' : String(glCtx.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  try {
    renderer.setModel(model, { reducedMotion: true }); // static: no internal rAF loop competes with the timed loop
    const total = Math.floor(model.arms[0]!.frames.length / (model.bodyCount * 7));
    const workMs: number[] = [];
    const deltaMs: number[] = [];
    let previous = await nextAnimationFrame();
    for (let i = 0; i < FRAME_WARMUP + FRAME_SAMPLES; i += 1) {
      const stamp = await nextAnimationFrame();
      const t0 = performance.now();
      renderer.setFrame(i % total);
      glCtx.finish();
      const t1 = performance.now();
      if (i >= FRAME_WARMUP) {
        workMs.push(t1 - t0);
        deltaMs.push(stamp - previous);
      }
      previous = stamp;
    }
    const sorted = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);
    const p95 = (xs: number[]): number => sorted(xs)[Math.floor(xs.length * 0.95)] as number;
    return {
      ghostArms: model.arms.length - 1,
      totalArms: model.arms.length,
      framesInPlan: total,
      canvas: '800x450 css px',
      devicePixelRatio,
      glRenderer,
      samples: FRAME_SAMPLES,
      warmupFrames: FRAME_WARMUP,
      workMedianMs: median(workMs),
      workP95Ms: p95(workMs),
      workMaxMs: Math.max(...workMs),
      deltaMedianMs: median(deltaMs),
      deltaP95Ms: p95(deltaMs),
      deltaMaxMs: Math.max(...deltaMs),
    };
  } finally {
    renderer.dispose();
    canvas.remove();
  }
}

async function frameMode(): Promise<void> {
  const fx = loadFixture();
  const result: Record<string, unknown> = { mode: 'frame', userAgent: navigator.userAgent };
  result['overlay8'] = await check('overlay frames, 8 ghost arms', () => overlayFrameTimes(fx, 8));
  result['overlay20'] = await check('overlay frames, 20 ghost arms', () => overlayFrameTimes(fx, 20));
  await post('/result', result);
}

// ------------------------------------------------------------------ full mode

async function fullMode(): Promise<void> {
  const fx = loadFixture();
  const result: Record<string, unknown> = {
    mode: 'full',
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    secureContext: window.isSecureContext,
  };
  result['mainThreadHashes'] = await check('hash main thread', async () => ({ hashes: await mainThreadHashes() }));
  result['workerHashes'] = await check('hash worker', async () => ({ hashes: await workerHashes() }));
  result['property5'] = await check('property 5 (real workers)', () => property5(fx));
  result['property10'] = await check('property 10 (real workers)', () => property10(fx));
  result['ghostRun8'] = await check('ghost run, 8 variants', () => ghostRunTimes(fx, 8, 5));
  result['ghostRun20'] = await check('ghost run, 20 variants', () => ghostRunTimes(fx, 20, 3));
  result['memory'] = await check('memory', () => memory(fx));
  await post('/result', result);
}

void (async () => {
  try {
    if (mode === 'ready') await readyMode();
    else if (mode === 'frame') await frameMode();
    else await fullMode();
  } catch (error) {
    await post('/result', { mode, fatal: messageOf(error) });
  }
})();
