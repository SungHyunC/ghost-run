/**
 * Damped least squares inverse kinematics for the hand site.
 * Arithmetic: + - * /, comparisons, Math.min, Math.max. The iteration count is fixed, so the
 * work and the result do not depend on convergence; the residual is not an error.
 */

/** Pose and 3 by n row-major position Jacobian of the hand site at one joint configuration. */
export interface HandPose {
  readonly position: ArrayLike<number>;
  readonly jacobian: ArrayLike<number>;
}

export interface IkSpec {
  /** Evaluates the hand pose for a full qpos vector (the engine computes it on scratch data). */
  readonly pose: (qpos: Float64Array) => HandPose;
  /** Indices of the arm hinges inside qpos, in Jacobian column order. */
  readonly jointQposIndex: readonly number[];
  readonly lower: readonly number[];
  readonly upper: readonly number[];
  readonly iterations: number;
  readonly damping: number;
  /**
   * Optional soft secondary task for a 4-joint arm, applied along the null space of the Jacobian so it
   * does not disturb the hand position to first order: drive sum(weights[k] * q[k]) toward `target`.
   * Applied in the second half of the iterations only.
   */
  readonly posture?: { readonly weights: readonly number[]; readonly target: number; readonly gain: number };
}

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Inverse of a 3 by 3 row-major matrix by cofactors, or `null` when the determinant is zero or not finite. */
export function invert3x3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const c00 = e * i - f * h;
  const c01 = f * g - d * i;
  const c02 = d * h - e * g;
  const det = a * c00 + b * c01 + c * c02;
  if (!Number.isFinite(det) || det === 0) return null;
  const c10 = c * h - b * i;
  const c11 = a * i - c * g;
  const c12 = b * g - a * h;
  const c20 = b * f - c * e;
  const c21 = c * d - a * f;
  const c22 = a * e - b * d;
  // inverse = adjugate / det, adjugate is the transpose of the cofactor matrix
  return [c00 / det, c10 / det, c20 / det, c01 / det, c11 / det, c21 / det, c02 / det, c12 / det, c22 / det];
}

/**
 * One damped least squares update: dq = J^T (J J^T + damping I)^-1 e for a 3 by n Jacobian.
 * Returns `null` when the damped matrix is not invertible (no update).
 */
export function dampedStep(jacobian: ArrayLike<number>, error: readonly [number, number, number], n: number, damping: number): number[] | null {
  const at = (row: number, col: number): number => jacobian[row * n + col] as number;
  const m: number[] = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = r === c ? damping : 0;
      for (let k = 0; k < n; k += 1) sum += at(r, k) * at(c, k);
      m.push(sum);
    }
  }
  const inv = invert3x3(m as unknown as Mat3);
  if (inv === null) return null;
  const y0 = inv[0] * error[0] + inv[1] * error[1] + inv[2] * error[2];
  const y1 = inv[3] * error[0] + inv[4] * error[1] + inv[5] * error[2];
  const y2 = inv[6] * error[0] + inv[7] * error[1] + inv[8] * error[2];
  const dq: number[] = [];
  for (let k = 0; k < n; k += 1) dq.push(at(0, k) * y0 + at(1, k) * y1 + at(2, k) * y2);
  return dq;
}

/** Null-space direction of a 3 by 4 row-major Jacobian: signed minors of the matrix with one column removed. */
export function nullVector4(jacobian: ArrayLike<number>): number[] {
  const j = (r: number, c: number): number => jacobian[r * 4 + c] as number;
  const out: number[] = [];
  for (let drop = 0; drop < 4; drop += 1) {
    const cols = [0, 1, 2, 3].filter((c) => c !== drop);
    const c0 = cols[0] as number;
    const c1 = cols[1] as number;
    const c2 = cols[2] as number;
    const det =
      j(0, c0) * (j(1, c1) * j(2, c2) - j(1, c2) * j(2, c1)) -
      j(0, c1) * (j(1, c0) * j(2, c2) - j(1, c2) * j(2, c0)) +
      j(0, c2) * (j(1, c0) * j(2, c1) - j(1, c1) * j(2, c0));
    out.push(drop % 2 === 0 ? det : -det);
  }
  return out;
}

/** The change of q (after the primary step dq) that moves the posture sum toward its target inside the null space. */
function postureStep(spec: IkSpec, hp: HandPose, qArm: readonly number[], dq: readonly number[]): number[] | null {
  const posture = spec.posture;
  if (posture === undefined || qArm.length !== 4) return null;
  const n = nullVector4(hp.jacobian);
  let nw = 0;
  let nn = 0;
  let sum = 0;
  for (let k = 0; k < 4; k += 1) {
    const w = posture.weights[k] as number;
    nw += (n[k] as number) * w;
    nn += (n[k] as number) * (n[k] as number);
    sum += w * ((qArm[k] as number) + (dq[k] as number));
  }
  if (!(nw * nw > 1e-6 * nn)) return null; // the null space is (nearly) blind to the posture sum
  const scale = (posture.gain * (posture.target - sum)) / nw;
  return n.map((v) => v * scale);
}

/**
 * Runs `iterations` damped steps from `qpos0` and returns the arm joint values (clamped to their
 * ranges after every step). A target that cannot be reached ends at the best pose found.
 */
export function solveIk(spec: IkSpec, qpos0: Float64Array, target: readonly [number, number, number]): number[] {
  const n = spec.jointQposIndex.length;
  const q = Float64Array.from(qpos0);
  for (let it = 0; it < spec.iterations; it += 1) {
    const hp = spec.pose(q);
    const error: [number, number, number] = [
      target[0] - (hp.position[0] as number),
      target[1] - (hp.position[1] as number),
      target[2] - (hp.position[2] as number),
    ];
    const dq = dampedStep(hp.jacobian, error, n, spec.damping);
    if (dq === null) break;
    const qArm = spec.jointQposIndex.map((idx) => q[idx] as number);
    // The posture term runs in the second half only: from a singular start (arm straight up) it would
    // otherwise pick the wrong elbow branch before the position task has converged.
    const extra = 2 * it >= spec.iterations ? postureStep(spec, hp, qArm, dq) : null;
    for (let k = 0; k < n; k += 1) {
      const idx = spec.jointQposIndex[k] as number;
      const next = (q[idx] as number) + (dq[k] as number) + (extra === null ? 0 : (extra[k] as number));
      if (!Number.isFinite(next)) return jointValues(spec, q);
      q[idx] = Math.min(spec.upper[k] as number, Math.max(spec.lower[k] as number, next));
    }
  }
  return jointValues(spec, q);
}

function jointValues(spec: IkSpec, q: Float64Array): number[] {
  return spec.jointQposIndex.map((idx) => q[idx] as number);
}
