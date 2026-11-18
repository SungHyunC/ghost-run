import { ARM_JOINTS, BODY_SHAPES, FINGER_JOINTS, WORLD_CONFIG } from '../world-config.js';
import type { BodyShape } from '../world-config.js';

/** The only values that change the compiled model (design D8). */
export interface ModelParams {
  readonly drawerFrictionN: number;
  readonly drawerMassKg: number;
  /** Added to the nominal handle position in the drawer frame. */
  readonly handleOffsetM: readonly [number, number, number];
}

/** Nominal model parameters; equal to the base variant. */
export const NOMINAL_MODEL_PARAMS: ModelParams = {
  drawerFrictionN: 2,
  drawerMassKg: 0.6,
  handleOffsetM: [0, 0, 0],
};

/** Names that the engine looks up in the compiled model. */
export const SCENE_NAMES = {
  armJoints: ARM_JOINTS.map((j) => j.name),
  fingerJoints: [...FINGER_JOINTS.names],
  drawerJoint: 'drawer_slide',
  vaseJoint: 'vase_free',
  handSite: 'hand_site',
  floorGeom: 'floor',
  handleGeom: 'drawer_handle',
} as const;

/** Body pairs whose contacts are excluded: adjacent links, the finger pair, and the drawer in its cabinet. */
export const EXCLUDED_BODY_PAIRS: readonly (readonly [string, string])[] = [
  ['arm_base', 'arm_link1'],
  ['arm_link1', 'arm_link2'],
  ['arm_link2', 'arm_link3'],
  ['arm_link3', 'finger_left'],
  ['arm_link3', 'finger_right'],
  ['finger_left', 'finger_right'],
  ['cabinet', 'drawer'],
];

const GRAVITY_Z = -9.81;
const VASE_MASS_KG = 0.3;
const DRAWER_DAMPING = 2;
const DRAWER_TRAVEL_M = 0.3;
const VASE_POSITION: readonly [number, number, number] = [0.12, -0.15, 0.4705]; // rests on the cabinet top (z = 0.40)
const ARM_BASE_POSITION: readonly [number, number, number] = [0, 0.55, 0.3];
const LINK_LENGTH_M = 0.32;
const HAND_SITE_Z = 0.2;
const FINGER_Z = 0.19;
const FINGER_FRICTION = '1.5 0.01 0.001';
const FINGER_MASS_KG = 0.05;
// Stiff contact between the fingers and the handle: a light finger pushed by a 2 to 40 N motor would
// otherwise sink into the handle (the default softness scales the contact with the body mass).
const GRIP_SOLREF = '0.004 1';
const GRIP_SOLIMP = '0.95 0.99 0.001';

function num(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('MJCF numbers must be finite');
  return String(n === 0 ? 0 : n);
}

function vec(v: readonly number[]): string {
  return v.map(num).join(' ');
}

function checkParams(p: ModelParams): void {
  if (!Number.isFinite(p.drawerFrictionN) || p.drawerFrictionN < 0) throw new RangeError('drawerFrictionN must be finite and not negative');
  if (!Number.isFinite(p.drawerMassKg) || p.drawerMassKg <= 0) throw new RangeError('drawerMassKg must be finite and positive');
  for (const c of p.handleOffsetM) if (!Number.isFinite(c)) throw new RangeError('handleOffsetM must be finite');
}

/** Cache key of the compiled model: the exact text of the parameters. */
export function modelKey(p: ModelParams): string {
  checkParams(p);
  return [p.drawerFrictionN, p.drawerMassKg, ...p.handleOffsetM].map(num).join('|');
}

function geomXml(shape: BodyShape, extra: string, posOffset: readonly [number, number, number] = [0, 0, 0]): string {
  const pos = shape.localPos.map((c, i) => c + (posOffset[i] as number));
  const size = shape.halfSize.map(num).join(' ');
  return `<geom name="${shape.geomName}" type="${shape.kind}" size="${size}" pos="${vec(pos)}" quat="${vec(shape.localQuat)}"${extra}/>`;
}

function geomsOf(body: string, extra: (s: BodyShape) => string, offsetFor?: (s: BodyShape) => readonly [number, number, number]): string {
  return BODY_SHAPES.filter((s) => s.body === body)
    .map((s) => `      ${geomXml(s, extra(s), offsetFor?.(s))}`)
    .join('\n');
}

/**
 * Builds the MJCF text of the scene from BODY_SHAPES and the model parameters.
 * Primitive geoms only; no mesh, texture, or other asset file; an explicit arena size.
 * Arm bodies carry gravity compensation, so the position actuators hold a pose without sag.
 */
export function buildMjcf(params: ModelParams): string {
  checkParams(params);
  const handle = BODY_SHAPES.find((s) => s.geomName === SCENE_NAMES.handleGeom);
  if (handle === undefined) throw new Error('BODY_SHAPES has no handle geom');
  const nominal = WORLD_CONFIG.nominalHandle;
  // The drawer body sits so that the closed handle is at the nominal handle position.
  const drawerPos = nominal.map((c, i) => c - (handle.localPos[i] as number));
  const m = params.drawerMassKg;
  // Box inertia of the drawer front plate (0.44 by 0.04 by 0.12 m) scaled to the declared mass.
  const ixx = (m / 12) * (0.04 * 0.04 + 0.12 * 0.12);
  const iyy = (m / 12) * (0.44 * 0.44 + 0.12 * 0.12);
  const izz = (m / 12) * (0.44 * 0.44 + 0.04 * 0.04);

  const armGeom = (s: BodyShape): string => (s.body.startsWith('finger')
      ? ` friction="${FINGER_FRICTION}" mass="${num(FINGER_MASS_KG)}" solref="${GRIP_SOLREF}" solimp="${GRIP_SOLIMP}"`
      : '');
  const [j1, j2, j3, j4] = ARM_JOINTS;
  if (j1 === undefined || j2 === undefined || j3 === undefined || j4 === undefined) throw new Error('ARM_JOINTS needs four joints');
  const hinge = (j: (typeof ARM_JOINTS)[number]): string =>
    `<joint name="${j.name}" type="hinge" axis="${vec(j.axis)}" range="${vec(j.range)}" limited="true" damping="0.5"/>`;
  const finger = (name: string, side: 1 | -1): string =>
    `<body name="${name}" pos="0 ${num(side * FINGER_JOINTS.restOffsetM)} ${num(FINGER_Z)}" gravcomp="1">
              <joint name="${name}_slide" type="slide" axis="0 ${num(-side)} 0" range="0 ${num(FINGER_JOINTS.travelM)}" limited="true" solreflimit="0.004 1" damping="${num(FINGER_JOINTS.damping)}"/>
${geomsOf(name, armGeom).replace(/^ {6}/gm, '              ')}
            </body>`;

  const actuators = [
    ...ARM_JOINTS.map(
      (j) =>
        `    <position name="act_${j.name}" joint="${j.name}" kp="${num(j.kp)}" kv="${num(j.kv)}" ctrllimited="true" ctrlrange="${vec(j.range)}"/>`,
    ),
    ...FINGER_JOINTS.names.map(
      (n) =>
        `    <motor name="act_${n}" joint="${n}" gear="1" ctrllimited="true" ctrlrange="${num(-FINGER_JOINTS.maxForceN)} ${num(FINGER_JOINTS.maxForceN)}"/>`,
    ),
  ].join('\n');

  const excludes = EXCLUDED_BODY_PAIRS.map(([a, b]) => `    <exclude body1="${a}" body2="${b}"/>`).join('\n');

  return `<mujoco model="ghost-hand">
  <compiler angle="radian"/>
  <option timestep="${num(WORLD_CONFIG.timeStepS)}" gravity="0 0 ${num(GRAVITY_Z)}" integrator="implicitfast"/>
  <size memory="1M"/>
  <worldbody>
    <geom name="${SCENE_NAMES.floorGeom}" type="plane" size="2 2 0.1"/>
    <body name="arm_base" pos="${vec(ARM_BASE_POSITION)}">
${geomsOf('arm_base', armGeom)}
      <body name="arm_link1" pos="0 0 0" gravcomp="1">
        ${hinge(j1)}
        ${hinge(j2)}
${geomsOf('arm_link1', armGeom).replace(/^ {6}/gm, '        ')}
        <body name="arm_link2" pos="0 0 ${num(LINK_LENGTH_M)}" gravcomp="1">
          ${hinge(j3)}
${geomsOf('arm_link2', armGeom).replace(/^ {6}/gm, '          ')}
          <body name="arm_link3" pos="0 0 ${num(LINK_LENGTH_M)}" gravcomp="1">
            ${hinge(j4)}
${geomsOf('arm_link3', armGeom).replace(/^ {6}/gm, '            ')}
            <site name="${SCENE_NAMES.handSite}" pos="0 0 ${num(HAND_SITE_Z)}" size="0.005"/>
            ${finger('finger_left', 1)}
            ${finger('finger_right', -1)}
          </body>
        </body>
      </body>
    </body>
    <body name="cabinet" pos="0 0 0">
${geomsOf('cabinet', () => '')}
      <body name="drawer" pos="${vec(drawerPos)}">
        <inertial pos="0 0 0" mass="${num(m)}" diaginertia="${num(ixx)} ${num(iyy)} ${num(izz)}"/>
        <joint name="${SCENE_NAMES.drawerJoint}" type="slide" axis="0 1 0" range="0 ${num(DRAWER_TRAVEL_M)}" limited="true" frictionloss="${num(params.drawerFrictionN)}" damping="${num(DRAWER_DAMPING)}"/>
${geomsOf('drawer', (s) => (s.geomName === SCENE_NAMES.handleGeom ? ` solref="${GRIP_SOLREF}" solimp="${GRIP_SOLIMP}"` : ''), (s) => (s.geomName === SCENE_NAMES.handleGeom ? params.handleOffsetM : [0, 0, 0])).replace(/^ {6}/gm, '        ')}
      </body>
    </body>
    <body name="vase" pos="${vec(VASE_POSITION)}">
      <freejoint name="${SCENE_NAMES.vaseJoint}"/>
${geomsOf('vase', () => ` mass="${num(VASE_MASS_KG)}"`)}
    </body>
  </worldbody>
  <contact>
${excludes}
  </contact>
  <actuator>
${actuators}
  </actuator>
</mujoco>
`;
}
