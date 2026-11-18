/** Provisional values; later tasks tune them against the requirements. */
export const WORLD_CONFIG = {
  timeStepS: 0.002,
  perActionLimitS: 3.0, // 1500 steps
  perPlanLimitS: 6.0, // 3000 steps
  targetOpeningM: 0.12, // success threshold of the drawer displacement (provisional)
  ikIterations: 20,
  ikDamping: 1e-3,
  pullWaypoints: 5,
  pullOvershootM: 0.02,
  minMoveS: 0.2,
  graspSettleS: 0.5,
  releaseSettleS: 0.3,
  frameStrideSteps: 9, // ceil(1 / (60 * timeStepS)) = 9 -> at most 55.6 frames per simulated second
  jointLimitToleranceRad: 1e-3,
  actionRanges: {
    target: { x: [-0.3, 0.3], y: [-0.3, 0.7], z: [0.05, 0.7] }, // meters, world frame
    speed: [0.05, 0.6], // m/s, reach and pull
    force: [2, 40], // N, grasp
    distance: [0.02, 0.25], // m, pull
  },
  contactNames: ['vase', 'cabinet', 'drawer', 'handle', 'floor'],
  nominalHandle: [0, 0.02, 0.18], // closed drawer, world frame (provisional)
} as const;

export type BodyShapeKind = 'capsule' | 'box' | 'sphere';
export type BodyShapeGroup = 'arm' | 'cabinet' | 'drawer' | 'vase';

/**
 * One simulated geom. halfSize: capsule [radius, halfLength] (axis = local z),
 * box [hx, hy, hz], sphere [radius]. localPos and localQuat (w, x, y, z) are
 * relative to the body frame. Read by the MJCF builder and the overlay.
 */
export interface BodyShape {
  readonly body: string;
  readonly geomName: string;
  readonly kind: BodyShapeKind;
  readonly halfSize: readonly number[];
  readonly localPos: readonly [number, number, number];
  readonly localQuat: readonly [number, number, number, number];
  readonly group: BodyShapeGroup;
}

const Q_ID = [1, 0, 0, 0] as const;
const Q_Z_TO_X = [0.7071067811865476, 0, 0.7071067811865476, 0] as const;

/** Provisional dimensions in meters. Cabinet front face at y = 0; arm base at (0, 0.45, 0.30). */
export const BODY_SHAPES: readonly BodyShape[] = [
  { body: 'cabinet', geomName: 'cabinet_box', kind: 'box', halfSize: [0.25, 0.2, 0.2], localPos: [0, -0.2, 0.2], localQuat: Q_ID, group: 'cabinet' },
  { body: 'drawer', geomName: 'drawer_front', kind: 'box', halfSize: [0.22, 0.01, 0.06], localPos: [0, -0.01, 0], localQuat: Q_ID, group: 'drawer' },
  { body: 'drawer', geomName: 'drawer_handle', kind: 'capsule', halfSize: [0.012, 0.06], localPos: [0, 0.02, 0], localQuat: Q_Z_TO_X, group: 'drawer' },
  { body: 'vase', geomName: 'vase_body', kind: 'capsule', halfSize: [0.04, 0.03], localPos: [0, 0, 0], localQuat: Q_ID, group: 'vase' },
  { body: 'arm_base', geomName: 'arm_base_geom', kind: 'capsule', halfSize: [0.04, 0.05], localPos: [0, 0, -0.05], localQuat: Q_ID, group: 'arm' },
  { body: 'arm_link1', geomName: 'arm_link1_geom', kind: 'capsule', halfSize: [0.025, 0.135], localPos: [0, 0, 0.16], localQuat: Q_ID, group: 'arm' },
  { body: 'arm_link2', geomName: 'arm_link2_geom', kind: 'capsule', halfSize: [0.022, 0.138], localPos: [0, 0, 0.16], localQuat: Q_ID, group: 'arm' },
  { body: 'arm_link3', geomName: 'arm_link3_geom', kind: 'capsule', halfSize: [0.02, 0.07], localPos: [0, 0, 0.09], localQuat: Q_ID, group: 'arm' },
  { body: 'finger_left', geomName: 'finger_left_geom', kind: 'box', halfSize: [0.006, 0.01, 0.025], localPos: [0, 0, 0], localQuat: Q_ID, group: 'arm' },
  { body: 'finger_right', geomName: 'finger_right_geom', kind: 'box', halfSize: [0.006, 0.01, 0.025], localPos: [0, 0, 0], localQuat: Q_ID, group: 'arm' },
];
