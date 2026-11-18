// Shape descriptions for the overlay, derived from BODY_SHAPES. Plain data, no three import.
import { BODY_SHAPES } from '@ghost-run/drawer-arm';
import type { BodyShape, BodyShapeGroup, BodyShapeKind } from '@ghost-run/drawer-arm';

export interface ShapeSpec {
  readonly body: string;
  readonly geomName: string;
  readonly kind: BodyShapeKind;
  readonly group: BodyShapeGroup;
  /** capsule [radius, halfLength] (axis local z), box [hx, hy, hz], sphere [radius]. */
  readonly halfSize: readonly number[];
  readonly localPos: readonly [number, number, number];
  readonly localQuat: readonly [number, number, number, number]; // w, x, y, z
  /** Index of the body in the frame pose vector, or -1 when the body is not in bodyNames. */
  readonly bodyIndex: number;
}

/** Values per body in a frame: position (3) and quaternion (4, w first). */
export const POSE_STRIDE = 7;

/** Shapes of the given groups, with the body index looked up in the model body order. */
export function shapesFor(groups: readonly BodyShapeGroup[], bodyNames: readonly string[]): readonly ShapeSpec[] {
  return BODY_SHAPES.filter((s: BodyShape) => groups.includes(s.group)).map((s: BodyShape) => ({
    body: s.body,
    geomName: s.geomName,
    kind: s.kind,
    group: s.group,
    halfSize: [...s.halfSize],
    localPos: s.localPos,
    localQuat: s.localQuat,
    bodyIndex: bodyNames.indexOf(s.body),
  }));
}

/** The arm shapes drawn once per arm (base arm and every ghost arm). */
export function armShapes(bodyNames: readonly string[]): readonly ShapeSpec[] {
  return shapesFor(['arm'], bodyNames);
}

/** The scene shapes drawn once: cabinet, drawer, vase. */
export function sceneShapes(bodyNames: readonly string[]): readonly ShapeSpec[] {
  return shapesFor(['cabinet', 'drawer', 'vase'], bodyNames);
}

/** Number of whole frames in a frame buffer. Zero when bodyCount is not positive. */
export function frameCount(frames: Float32Array, bodyCount: number): number {
  return bodyCount > 0 ? Math.floor(frames.length / (bodyCount * POSE_STRIDE)) : 0;
}
