// Renderer tests with a stubbed `three` renderer (Requirements 13.2, 13.5, 13.6, 13.11, 13.12, 13.13, 15.5).
// Geometries and materials are the real three classes, subclassed to count live instances.
// The WebGLRenderer is a stub that records what it renders and counts its own disposal.
// The slider and the camera preset buttons belong to the OverlayView component (task 14.x), which does
// not exist yet. A minimal harness below stands in for it and drives only the renderer API.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The renderer test stubs three, so it needs the three types (type-only, no runtime import).
// eslint-disable-next-line no-restricted-imports
import type * as ThreeNs from 'three';

interface Live {
  geometries: Set<object>;
  materials: Set<object>;
  renderers: Set<object>;
  created: { geometries: number; materials: number; renderers: number };
  materialList: ThreeNs.MeshLambertMaterial[];
  lastScene: ThreeNs.Scene | null;
  lastCamera: ThreeNs.PerspectiveCamera | null;
}

const live = vi.hoisted(
  (): Live => ({
    geometries: new Set(),
    materials: new Set(),
    renderers: new Set(),
    created: { geometries: 0, materials: 0, renderers: 0 },
    materialList: [],
    lastScene: null,
    lastCamera: null,
  }),
);

vi.mock('three', async (importOriginal) => {
  const T = await importOriginal<typeof ThreeNs>();
  const trackGeometry = (g: object): void => {
    live.geometries.add(g);
    live.created.geometries += 1;
  };
  class BoxGeometry extends T.BoxGeometry {
    constructor(...a: ConstructorParameters<typeof T.BoxGeometry>) {
      super(...a);
      trackGeometry(this);
    }
    override dispose(): void {
      live.geometries.delete(this);
      super.dispose();
    }
  }
  class CapsuleGeometry extends T.CapsuleGeometry {
    constructor(...a: ConstructorParameters<typeof T.CapsuleGeometry>) {
      super(...a);
      trackGeometry(this);
    }
    override dispose(): void {
      live.geometries.delete(this);
      super.dispose();
    }
  }
  class CylinderGeometry extends T.CylinderGeometry {
    constructor(...a: ConstructorParameters<typeof T.CylinderGeometry>) {
      super(...a);
      trackGeometry(this);
    }
    override dispose(): void {
      live.geometries.delete(this);
      super.dispose();
    }
  }
  class MeshLambertMaterial extends T.MeshLambertMaterial {
    constructor(...a: ConstructorParameters<typeof T.MeshLambertMaterial>) {
      super(...a);
      live.materials.add(this);
      live.created.materials += 1;
      live.materialList.push(this);
    }
    override dispose(): void {
      live.materials.delete(this);
      super.dispose();
    }
  }
  class WebGLRenderer {
    private size = new T.Vector2(0, 0);
    constructor(params: { canvas: HTMLCanvasElement }) {
      if (params.canvas.getContext('webgl2') === null) throw new Error('no WebGL context');
      live.renderers.add(this);
      live.created.renderers += 1;
    }
    getSize(target: ThreeNs.Vector2): ThreeNs.Vector2 {
      return target.copy(this.size);
    }
    setPixelRatio(): void {}
    setSize(w: number, h: number): void {
      this.size.set(w, h);
    }
    render(scene: ThreeNs.Scene, camera: ThreeNs.PerspectiveCamera): void {
      live.lastScene = scene;
      live.lastCamera = camera;
    }
    dispose(): void {
      live.renderers.delete(this);
    }
  }
  return { ...T, BoxGeometry, CapsuleGeometry, CylinderGeometry, MeshLambertMaterial, WebGLRenderer };
});

import { createOverlayRenderer } from '../../src/overlay/renderer';
import type { CameraPreset, OverlayRenderer } from '../../src/overlay/renderer';
import { frameCount } from '../../src/overlay/geometry';
import { FADE_DURATION_MS, OVERLAY_OPACITY } from '../../src/overlay/overlay-tokens';
import type { OverlayViewModel } from '../../src/overlay/view-model';

const BODY_COUNT = 10;
const STRIDE = 7;
const FRAMES = 6;

/** Frames whose body positions encode the frame index: x = offset + frame. */
function makeFrames(offset: number, frames = FRAMES): Float32Array {
  const out = new Float32Array(frames * BODY_COUNT * STRIDE);
  for (let f = 0; f < frames; f += 1) {
    for (let b = 0; b < BODY_COUNT; b += 1) {
      const o = (f * BODY_COUNT + b) * STRIDE;
      out[o] = offset + f;
      out[o + 3] = 1;
    }
  }
  return out;
}

function makeModel(failedIds: readonly string[] = ['v1']): OverlayViewModel {
  const ids = ['v0', 'v1', 'v2'];
  return {
    bodyCount: BODY_COUNT,
    framesPerSecond: 10,
    arms: [
      { id: 'base', kind: 'base', frames: makeFrames(10), failed: false, reasons: [], label: 'base', icon: 'o' },
      ...ids.map((id, i) => {
        const failed = failedIds.includes(id);
        return {
          id,
          kind: 'ghost' as const,
          frames: makeFrames(100 * (i + 1)),
          failed,
          reasons: failed ? (['unsuccessful'] as const) : [],
          label: failed ? `${id}: failed` : `${id}: passed`,
          icon: failed ? 'x' : 'v',
        };
      }),
    ],
  };
}

function newCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getContext = ((): unknown => ({})) as unknown as HTMLCanvasElement['getContext'];
  return canvas;
}

function create(): OverlayRenderer {
  const r = createOverlayRenderer(newCanvas());
  if ('unavailable' in r) throw new Error('renderer unexpectedly unavailable');
  return r;
}

/** Manual requestAnimationFrame and clock. */
const clock = { now: 1000, queue: new Map<number, FrameRequestCallback>(), nextId: 1 };

function step(ms: number): void {
  clock.now += ms;
  const pending = [...clock.queue.entries()];
  clock.queue.clear();
  for (const [, cb] of pending) cb(clock.now);
}

function allGroupXs(): number[] {
  const xs: number[] = [];
  live.lastScene?.traverse((o) => {
    if (o.type === 'Group') xs.push(o.position.x);
  });
  return xs;
}

/** Material of the arm with the given first-frame x offset (100 * (index + 1)). */
function armMaterialByOffset(offset: number): ThreeNs.MeshLambertMaterial {
  let found: ThreeNs.MeshLambertMaterial | null = null;
  live.lastScene?.traverse((o) => {
    if (o.type === 'Group' && o.position.x === offset && found === null) {
      let p: ThreeNs.Object3D | null = o;
      while (p !== null && p.parent !== live.lastScene) p = p.parent;
      p?.traverse((m) => {
        const mesh = m as ThreeNs.Mesh;
        if (found === null && mesh.isMesh) found = mesh.material as ThreeNs.MeshLambertMaterial;
      });
    }
  });
  if (found === null) throw new Error(`no arm at offset ${offset}`);
  return found;
}

beforeEach(() => {
  live.geometries.clear();
  live.materials.clear();
  live.renderers.clear();
  live.created = { geometries: 0, materials: 0, renderers: 0 };
  live.materialList = [];
  live.lastScene = null;
  live.lastCamera = null;
  clock.now = 1000;
  clock.queue.clear();
  clock.nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    const id = clock.nextId;
    clock.nextId += 1;
    clock.queue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    clock.queue.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('disposal (13.12)', () => {
  it('disposes every geometry, material, and renderer on dispose', () => {
    const r = create();
    r.setModel(makeModel(), { reducedMotion: false });
    expect(live.geometries.size).toBeGreaterThan(0);
    expect(live.materials.size).toBeGreaterThan(0);
    expect(live.renderers.size).toBe(1);
    r.dispose();
    expect(live.geometries.size).toBe(0);
    expect(live.materials.size).toBe(0);
    expect(live.renderers.size).toBe(0);
    expect(() => r.dispose()).not.toThrow();
  });

  it('does not grow the live-object count over repeated runs', () => {
    const r = create();
    r.setModel(makeModel(), { reducedMotion: false });
    const g = live.geometries.size;
    const m = live.materials.size;
    for (let i = 0; i < 10; i += 1) r.setModel(makeModel(), { reducedMotion: i % 2 === 0 });
    expect(live.geometries.size).toBe(g);
    expect(live.materials.size).toBe(m);
    r.dispose();

    const counts: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const next = create();
      next.setModel(makeModel(), { reducedMotion: false });
      next.dispose();
      counts.push(live.geometries.size + live.materials.size + live.renderers.size);
    }
    expect(counts).toEqual([0, 0, 0, 0, 0]);
    expect(live.created.renderers).toBe(6);
  });
});

describe('WebGL unavailable (13.11)', () => {
  it('returns { unavailable: true } when getContext returns null', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
    expect(createOverlayRenderer(canvas)).toEqual({ unavailable: true });
    expect(live.created.renderers).toBe(0);
  });
});

describe('reduced motion (13.5, 15.5)', () => {
  it('does not autoplay, does not fade, and shows the final frame at a fixed reduced opacity', () => {
    const r = create();
    r.setModel(makeModel(), { reducedMotion: true });
    expect(clock.queue.size).toBe(0);
    r.play();
    expect(clock.queue.size).toBe(0);
    // Final frame shown: every arm group sits at its last-frame x.
    const xs = allGroupXs();
    expect(xs).toContain(10 + FRAMES - 1);
    expect(xs).toContain(200 + FRAMES - 1);
    // Failed arm v1 is at the fixed reduced opacity from the start; passing arms are not.
    expect(armMaterialByOffset(200 + FRAMES - 1).opacity).toBe(OVERLAY_OPACITY.failedReduced);
    expect(armMaterialByOffset(100 + FRAMES - 1).opacity).toBe(OVERLAY_OPACITY.ghost);
    step(2000);
    expect(armMaterialByOffset(200 + FRAMES - 1).opacity).toBe(OVERLAY_OPACITY.failedReduced);
    r.dispose();
  });
});

/** Minimal stand-in for the OverlayView slider (role slider). Steps frames with the keyboard. */
function mountSlider(r: OverlayRenderer, count: number): HTMLInputElement {
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.setAttribute('role', 'slider');
  slider.min = '0';
  slider.max = String(count - 1);
  slider.value = String(count - 1);
  slider.addEventListener('keydown', (e) => {
    const cur = Number(slider.value);
    let next = cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = cur + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = cur - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else return;
    e.preventDefault();
    next = Math.min(count - 1, Math.max(0, next));
    slider.value = String(next);
    r.setFrame(next);
  });
  document.body.append(slider);
  return slider;
}

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('frame slider stepping (13.5)', () => {
  it('steps the shown frame by keyboard through the renderer setFrame', () => {
    const model = makeModel();
    const count = frameCount(model.arms[0]?.frames ?? new Float32Array(0), model.bodyCount);
    expect(count).toBe(FRAMES);
    const r = create();
    r.setModel(model, { reducedMotion: true });
    const slider = mountSlider(r, count);
    expect(slider.getAttribute('role')).toBe('slider');
    press(slider, 'Home');
    expect(allGroupXs()).toContain(100);
    press(slider, 'ArrowRight');
    press(slider, 'ArrowRight');
    expect(allGroupXs()).toContain(102);
    expect(allGroupXs()).toContain(12);
    press(slider, 'ArrowLeft');
    expect(allGroupXs()).toContain(101);
    press(slider, 'End');
    expect(allGroupXs()).toContain(100 + FRAMES - 1);
    press(slider, 'ArrowRight');
    expect(slider.value).toBe(String(FRAMES - 1));
    // Out-of-range indices are clamped by the renderer.
    r.setFrame(99);
    expect(allGroupXs()).toContain(100 + FRAMES - 1);
    r.setFrame(-4);
    expect(allGroupXs()).toContain(100);
    r.dispose();
    slider.remove();
  });
});

describe('fade (13.2, 13.6)', () => {
  it('fades a failed arm once per run, within 900 ms, and monotonically', () => {
    expect(FADE_DURATION_MS).toBeLessThanOrEqual(900);
    const r = create();
    r.setModel(makeModel(), { reducedMotion: false });
    const failed = armMaterialByOffset(200);
    const passing = armMaterialByOffset(100);
    expect(failed.opacity).toBe(OVERLAY_OPACITY.ghost);

    const start = clock.now;
    const samples: { t: number; o: number }[] = [];
    for (let i = 0; i < 80 && clock.queue.size > 0; i += 1) {
      step(16);
      samples.push({ t: clock.now - start, o: failed.opacity });
    }
    const endSample = samples.find((s) => s.o === OVERLAY_OPACITY.failedReduced);
    expect(endSample).toBeDefined();
    expect((endSample?.t ?? Infinity) - 16).toBeLessThanOrEqual(900);
    expect(passing.opacity).toBe(OVERLAY_OPACITY.ghost);

    // At most 3 flashes per second: opacity never reverses direction (0 reversals).
    let reversals = 0;
    let dir = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const d = Math.sign((samples[i]?.o ?? 0) - (samples[i - 1]?.o ?? 0));
      if (d !== 0 && dir !== 0 && d !== dir) reversals += 1;
      if (d !== 0) dir = d;
    }
    expect(reversals).toBeLessThanOrEqual(3);
    expect(reversals).toBe(0);
    expect(samples.every((s) => s.o >= OVERLAY_OPACITY.ghost && s.o <= OVERLAY_OPACITY.failedReduced)).toBe(true);

    // A second play in the same run does not restart the fade.
    r.setFrame(0);
    const seen: number[] = [];
    r.play();
    for (let i = 0; i < 20 && clock.queue.size > 0; i += 1) {
      step(16);
      seen.push(failed.opacity);
    }
    expect(seen.every((o) => o === OVERLAY_OPACITY.failedReduced)).toBe(true);
    r.dispose();
  });

  it('runs the fade again only after a new run (setModel)', () => {
    const r = create();
    r.setModel(makeModel(), { reducedMotion: false });
    for (let i = 0; i < 80 && clock.queue.size > 0; i += 1) step(16);
    r.setModel(makeModel(), { reducedMotion: false });
    expect(armMaterialByOffset(200).opacity).toBe(OVERLAY_OPACITY.ghost);
    r.dispose();
  });

  it('does not fade when no arm failed', () => {
    const r = create();
    r.setModel(makeModel([]), { reducedMotion: false });
    for (let i = 0; i < 3; i += 1) step(16);
    r.setFrame(0);
    for (const offset of [100, 200, 300]) expect(armMaterialByOffset(offset).opacity).toBe(OVERLAY_OPACITY.ghost);
    r.dispose();
  });
});

describe('camera presets (13.13)', () => {
  it('reaches both presets through buttons', () => {
    const r = create();
    r.setModel(makeModel(), { reducedMotion: true });
    const presets: CameraPreset[] = ['front', 'side'];
    const buttons = presets.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${p} view`;
      b.addEventListener('click', () => r.setCameraPreset(p));
      document.body.append(b);
      return b;
    });
    const positions = buttons.map((b) => {
      b.click();
      const c = live.lastCamera;
      return c === null ? null : c.position.toArray();
    });
    expect(positions[0]).not.toBeNull();
    expect(positions[1]).not.toBeNull();
    expect(positions[0]).not.toEqual(positions[1]);
    buttons[0]?.click();
    expect(live.lastCamera?.position.toArray()).toEqual(positions[0]);
    for (const b of buttons) b.remove();
    r.dispose();
  });
});
