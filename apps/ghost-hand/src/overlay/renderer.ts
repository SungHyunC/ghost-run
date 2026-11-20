// Three.js ghost overlay (design D12). This is the only module that imports `three`.
// It draws what the view model says and computes no verdict, failure state, or reason.
// Geometry is generated from primitives only (capsule, box, cylinder); no model, texture, or font file.
import * as THREE from 'three';
import { STATIC_LAYOUT } from '@ghost-run/drawer-arm';
import { armShapes, sceneShapes, POSE_STRIDE } from './geometry';
import type { ShapeSpec } from './geometry';
import { FADE_DURATION_MS, OVERLAY_COLORS, OVERLAY_OPACITY } from './overlay-tokens';
import type { OverlayTheme } from './overlay-tokens';
import type { OverlayArm, OverlayViewModel } from './view-model';

export type CameraPreset = 'front' | 'side' | 'angled';

export interface OverlayRenderer {
  setModel(model: OverlayViewModel, opts: { reducedMotion: boolean }): void;
  /** Shows one frame (slider control and the final static frame). Pauses playback. */
  setFrame(index: number): void;
  /** Plays from the current frame to the last one. No-op under reduced motion. */
  play(): void;
  setCameraPreset(name: CameraPreset): void;
  setTheme(theme: OverlayTheme): void;
  /** Disposes every geometry, material, and the WebGLRenderer. Safe to call twice. */
  dispose(): void;
}

/** Upper bound of the failed-arm fade (Requirement 13.2: at most 900 ms). */
const FADE_MS = Math.min(FADE_DURATION_MS, 900);
/** Saturation factor of the translucent ghost arms. */
const GHOST_SATURATION = 0.5;

const CAMERA_PRESETS: Record<CameraPreset, { pos: readonly [number, number, number]; target: readonly [number, number, number] }> = {
  front: { pos: [0, 1.5, 0.75], target: [0, 0.1, 0.3] },
  side: { pos: [1.5, 0.2, 0.75], target: [0, 0.1, 0.3] },
  // Three-quarter view from the front right and above, so the ghost arms do not hide behind each other.
  angled: { pos: [1.05, 1.15, 1.0], target: [0, 0.12, 0.28] },
};

interface ArmDraw {
  readonly arm: OverlayArm;
  readonly group: THREE.Group;
  readonly bodies: ReadonlyMap<number, THREE.Group>;
  readonly material: THREE.MeshLambertMaterial;
  frameTotal: number;
}

export function createOverlayRenderer(canvas: HTMLCanvasElement): OverlayRenderer | { unavailable: true } {
  let gl: THREE.WebGLRenderer;
  try {
    gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    return { unavailable: true };
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 20);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(0.6, 1.2, 1.5);
  scene.add(sun);

  // Cached primitive geometries, keyed by kind and size. Disposed together in dispose().
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const sceneMaterials: Record<'cabinet' | 'drawer' | 'vase', THREE.MeshLambertMaterial> = {
    cabinet: trackMaterial(new THREE.MeshLambertMaterial()),
    drawer: trackMaterial(new THREE.MeshLambertMaterial()),
    vase: trackMaterial(new THREE.MeshLambertMaterial()),
  };

  function trackMaterial<M extends THREE.Material>(m: M): M {
    materials.add(m);
    return m;
  }

  function geometryFor(s: ShapeSpec): THREE.BufferGeometry {
    const key = `${s.kind}:${s.halfSize.join(',')}`;
    let g = geometries.get(key);
    if (g === undefined) {
      const h = s.halfSize;
      if (s.kind === 'box') {
        g = new THREE.BoxGeometry(2 * (h[0] ?? 0), 2 * (h[1] ?? 0), 2 * (h[2] ?? 0));
      } else {
        // capsule (axis local z in the model; CapsuleGeometry's axis is y, so rotate the geometry).
        // A sphere is a capsule of length zero.
        const radius = h[0] ?? 0;
        const length = s.kind === 'capsule' ? 2 * (h[1] ?? 0) : 0;
        const cap = new THREE.CapsuleGeometry(radius, length, 4, 12);
        cap.rotateX(Math.PI / 2);
        g = cap;
      }
      geometries.set(key, g);
    }
    return g;
  }

  // A thin floor disc under the scene gives depth cues (the only CylinderGeometry use).
  const floorGeometry = new THREE.CylinderGeometry(0.9, 0.9, 0.004, 48);
  floorGeometry.rotateX(Math.PI / 2);
  geometries.set('floor', floorGeometry);
  const floorMaterial = trackMaterial(new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.35 }));
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.position.set(0, 0.2, -0.002);
  scene.add(floor);

  let theme: OverlayTheme = 'dark';
  let preset: CameraPreset = 'front';
  let model: OverlayViewModel | null = null;
  let reducedMotion = false;
  let arms: ArmDraw[] = [];
  let sceneGroup: THREE.Group | null = null;
  let sceneBodies: ReadonlyMap<number, THREE.Group> = new Map();
  let totalFrames = 0;
  let frame = 0; // fractional playhead
  let playing = false;
  let lastTick = 0;
  let fadeStarted = false; // once per run
  let fadeStart = 0;
  let fading = false;
  let rafId: number | null = null;
  let disposed = false;

  function desaturated(hex: string): THREE.Color {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return c.setHSL(hsl.h, hsl.s * GHOST_SATURATION, hsl.l);
  }

  function applyArmLook(d: ArmDraw, fadeT: number): void {
    const colors = OVERLAY_COLORS[theme];
    const m = d.material;
    if (d.arm.kind === 'base') {
      m.color.set(colors.baseArm);
      m.opacity = OVERLAY_OPACITY.base;
      return;
    }
    const ghost = desaturated(colors.ghostArm);
    if (!d.arm.failed) {
      m.color.copy(ghost);
      m.opacity = OVERLAY_OPACITY.ghost;
      return;
    }
    // Failed arm: red token at a fixed opacity. fadeT in [0, 1] blends from the ghost look.
    const t = reducedMotion ? 1 : fadeT;
    m.color.copy(ghost).lerp(new THREE.Color(colors.failedArm), t);
    m.opacity = OVERLAY_OPACITY.ghost + (OVERLAY_OPACITY.failedReduced - OVERLAY_OPACITY.ghost) * t;
  }

  function currentFadeT(now: number): number {
    if (reducedMotion) return 1;
    if (!fadeStarted) return 0;
    return Math.min(1, Math.max(0, (now - fadeStart) / FADE_MS));
  }

  function applyColors(now: number): void {
    const colors = OVERLAY_COLORS[theme];
    scene.background = new THREE.Color(colors.background);
    sceneMaterials.cabinet.color.set(colors.cabinet);
    sceneMaterials.drawer.color.set(colors.drawer);
    sceneMaterials.vase.color.set(colors.vase);
    floorMaterial.color.set(colors.cabinet);
    const t = currentFadeT(now);
    for (const d of arms) applyArmLook(d, t);
  }

  function buildShapes(
    specs: readonly ShapeSpec[],
    root: THREE.Group,
    pickMaterial: (s: ShapeSpec) => THREE.Material,
  ): Map<number, THREE.Group> {
    const bodies = new Map<number, THREE.Group>();
    for (const s of specs) {
      if (s.bodyIndex < 0) continue;
      let body = bodies.get(s.bodyIndex);
      if (body === undefined) {
        body = new THREE.Group();
        body.matrixAutoUpdate = true;
        root.add(body);
        bodies.set(s.bodyIndex, body);
      }
      const mesh = new THREE.Mesh(geometryFor(s), pickMaterial(s));
      mesh.position.set(s.localPos[0], s.localPos[1], s.localPos[2]);
      mesh.quaternion.set(s.localQuat[1], s.localQuat[2], s.localQuat[3], s.localQuat[0]);
      body.add(mesh);
    }
    return bodies;
  }

  function clearModel(): void {
    for (const d of arms) {
      scene.remove(d.group);
      d.material.dispose();
      materials.delete(d.material);
    }
    arms = [];
    if (sceneGroup !== null) scene.remove(sceneGroup);
    sceneGroup = null;
    sceneBodies = new Map();
  }

  function poseBodies(bodies: ReadonlyMap<number, THREE.Group>, frames: Float32Array, bodyCount: number, f: number): void {
    const count = bodyCount > 0 ? Math.floor(frames.length / (bodyCount * POSE_STRIDE)) : 0;
    if (count === 0) return;
    const idx = Math.min(count - 1, Math.max(0, f));
    for (const [bodyIndex, group] of bodies) {
      const o = (idx * bodyCount + bodyIndex) * POSE_STRIDE;
      group.position.set(frames[o] ?? 0, frames[o + 1] ?? 0, frames[o + 2] ?? 0);
      group.quaternion.set(frames[o + 4] ?? 0, frames[o + 5] ?? 0, frames[o + 6] ?? 0, frames[o + 3] ?? 1);
    }
  }

  function resize(): void {
    const w = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const h = Math.max(1, canvas.clientHeight || canvas.height || 1);
    const size = gl.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) {
      gl.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2));
      gl.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function applyCamera(): void {
    const p = CAMERA_PRESETS[preset];
    camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
    camera.lookAt(p.target[0], p.target[1], p.target[2]);
  }

  function draw(): void {
    if (disposed) return;
    resize();
    if (model !== null) {
      const f = Math.floor(frame);
      const base = arms[0];
      if (base !== undefined) poseBodies(sceneBodies, base.arm.frames, model.bodyCount, f);
      for (const d of arms) poseBodies(d.bodies, d.arm.frames, model.bodyCount, f);
    }
    gl.render(scene, camera);
  }

  function tick(now: number): void {
    rafId = null;
    if (disposed) return;
    if (playing) {
      const dt = lastTick === 0 ? 0 : (now - lastTick) / 1000;
      frame += dt * (model?.framesPerSecond ?? 0);
      if (frame >= totalFrames - 1) {
        frame = Math.max(0, totalFrames - 1);
        playing = false;
      }
    }
    lastTick = now;
    if (fading) {
      const t = currentFadeT(now);
      for (const d of arms) applyArmLook(d, t);
      if (t >= 1) fading = false;
    }
    draw();
    if (playing || fading) schedule();
  }

  function schedule(): void {
    if (disposed || rafId !== null) return;
    rafId = requestAnimationFrame(tick);
  }

  function now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  applyCamera();
  applyColors(0);
  draw();

  const api: OverlayRenderer = {
    setModel(next, opts) {
      if (disposed) return;
      clearModel();
      model = next;
      reducedMotion = opts.reducedMotion;
      fadeStarted = false;
      fading = false;
      playing = false;
      lastTick = 0;
      frame = 0;
      totalFrames = 0;

      const names = STATIC_LAYOUT.bodyNames;
      const armSpecs = armShapes(names);
      sceneGroup = new THREE.Group();
      scene.add(sceneGroup);
      sceneBodies = buildShapes(sceneShapes(names), sceneGroup, (s) =>
        s.group === 'drawer' ? sceneMaterials.drawer : s.group === 'vase' ? sceneMaterials.vase : sceneMaterials.cabinet,
      );

      for (const arm of next.arms) {
        const group = new THREE.Group();
        const material = trackMaterial(new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false }));
        const bodies = buildShapes(armSpecs, group, () => material);
        scene.add(group);
        const count = next.bodyCount > 0 ? Math.floor(arm.frames.length / (next.bodyCount * POSE_STRIDE)) : 0;
        totalFrames = Math.max(totalFrames, count);
        arms.push({ arm, group, bodies, material, frameTotal: count });
      }
      applyColors(now());

      if (reducedMotion) {
        // Static view: final frame, no autoplay, no fade.
        frame = Math.max(0, totalFrames - 1);
        draw();
      } else {
        draw();
        api.play();
      }
    },

    setFrame(index) {
      if (disposed) return;
      playing = false;
      const max = Math.max(0, totalFrames - 1);
      frame = Math.min(max, Math.max(0, Number.isFinite(index) ? Math.floor(index) : 0));
      draw();
    },

    play() {
      if (disposed || reducedMotion || model === null || totalFrames === 0) return;
      if (frame >= totalFrames - 1) frame = 0;
      playing = true;
      lastTick = 0;
      if (!fadeStarted) {
        fadeStarted = true;
        fadeStart = now();
        fading = arms.some((d) => d.arm.failed);
      }
      schedule();
    },

    setCameraPreset(name) {
      if (disposed) return;
      preset = name;
      applyCamera();
      draw();
    },

    setTheme(next) {
      if (disposed) return;
      theme = next;
      applyColors(now());
      draw();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = null;
      playing = false;
      fading = false;
      clearModel();
      for (const g of geometries.values()) g.dispose();
      geometries.clear();
      for (const m of materials) m.dispose();
      materials.clear();
      gl.dispose();
    },
  };
  return api;
}
