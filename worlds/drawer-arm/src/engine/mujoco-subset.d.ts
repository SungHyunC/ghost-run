// Local structural types of the @mujoco/mujoco 4.0.1 API subset that the engine uses.
// The shipped declarations type most arrays as `any`; these types state what the probe
// (docs/measurements.md, "Probe results") found. Nothing outside src/engine/ imports this file.

/** Anything that owns native memory and must be released with delete(). */
export interface Deletable {
  delete(): void;
}

/** Output buffer for mj_getState, mj_contactForce, and mj_jacSite (a plain Float64Array is NOT written). */
export interface DoubleBuffer extends Deletable {
  GetView(): Float64Array;
  GetElementCount(): number;
}

export interface MjWarningStat extends Deletable {
  readonly number: number;
}

/** Non-owning accessor result of data.warning: never delete it. Entries returned by get() are owning copies. */
export interface MjWarningStatVec {
  get(index: number): MjWarningStat | undefined;
}

export interface MjContact extends Deletable {
  readonly geom1: number;
  readonly geom2: number;
}

/** data.contact returns a new owning copy on every access. */
export interface MjContactVec extends Deletable {
  size(): number;
  get(index: number): MjContact | undefined;
}

export interface MjModel extends Deletable {
  readonly nq: number;
  readonly nv: number;
  readonly nu: number;
  readonly njnt: number;
  readonly nbody: number;
  readonly ngeom: number;
  readonly nsite: number;
  readonly narena: number;
  readonly nbuffer: number;
}

export interface MjData extends Deletable {
  readonly ncon: number;
  readonly time: number;
  readonly narena: number;
  readonly nbuffer: number;
  readonly contact: MjContactVec;
  /** Non-owning reference. */
  readonly warning: MjWarningStatVec;
}

export interface EnumValue {
  readonly value: number;
}

export interface MuJoCoModule {
  readonly MjModel: { from_xml_string(xml: string): MjModel };
  readonly MjData: new (model: MjModel) => MjData;
  readonly DoubleBuffer: {
    new (elementCount: number): DoubleBuffer;
    FromArray(values: ArrayLike<number>): DoubleBuffer;
  };
  readonly mjtState: Readonly<Record<string, EnumValue>>;
  readonly mjtObj: Readonly<Record<string, EnumValue>>;
  mj_resetData(model: MjModel, data: MjData): void;
  mj_step(model: MjModel, data: MjData): void;
  mj_forward(model: MjModel, data: MjData): void;
  mj_kinematics(model: MjModel, data: MjData): void;
  mj_stateSize(model: MjModel, signature: number): number;
  mj_getState(model: MjModel, data: MjData, out: DoubleBuffer, signature: number): void;
  mj_setState(model: MjModel, data: MjData, state: Float64Array, signature: number): void;
  mj_contactForce(model: MjModel, data: MjData, contactIndex: number, result: DoubleBuffer): void;
  mj_jacSite(model: MjModel, data: MjData, jacp: DoubleBuffer | null, jacr: DoubleBuffer | null, siteId: number): void;
  mj_id2name(model: MjModel, objectType: number, id: number): string | null;
  mj_name2id(model: MjModel, objectType: number, name: string): number;
}

/** Options of the Emscripten factory that the loader passes on. */
export interface MujocoLoadOptions {
  readonly locateFile?: (path: string, scriptDirectory: string) => string;
}
