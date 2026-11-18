// Probe of the @mujoco/mujoco 4.0.1 API (plain JavaScript, Node 20+).
// Prints one JSON document. Every wrapped object is deleted.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import loadMujoco from '@mujoco/mujoco';


// Child mode: delete one accessor-returned object, then keep using the owner.
// Used by section 10 because deleting a view-type accessor result aborts the module.
if (process.argv[2] === '--delete-safety') {
  const which = process.argv[3];
  const m = await loadMujoco();
  const mdl = m.MjModel.from_xml_string('<mujoco><worldbody><geom type="plane" size="1 1 .1"/><body pos="0 0 .1"><freejoint/><geom type="box" size=".1 .1 .1"/></body></worldbody></mujoco>');
  const dat = new m.MjData(mdl);
  for (let i = 0; i < 5; i += 1) m.mj_step(mdl, dat);
  const getters = {
    'data.contact': () => dat.contact,
    'data.warning': () => dat.warning,
    'data.solver': () => dat.solver,
    'data.timer': () => dat.timer,
    'model.opt': () => mdl.opt,
    'data.body(0)': () => dat.body(0),
    'data.geom(0)': () => dat.geom(0),
    'data.contact.get(0)': () => dat.contact.get(0),
    'data.warning.get(0)': () => dat.warning.get(0),
  };
  const o = getters[which]();
  const has = typeof o.delete === 'function';
  o.delete();
  m.mj_step(mdl, dat);
  dat.delete();
  mdl.delete();
  console.log(JSON.stringify({ type: o.constructor.name, hasDelete: has }));
  process.exit(0);
}

const require = createRequire(import.meta.url);
// './package.json' is not in the package exports map, so locate the folder through an exported file.
const pkgDir = dirname(require.resolve('@mujoco/mujoco/mujoco.wasm'));
const pkgPath = join(pkgDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const out = {};
const attempt = (fn) => {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) };
  }
};
const bitsEqual = (a, b) => {
  if (a.length !== b.length) return false;
  const x = new Uint8Array(new Float64Array(a).buffer);
  const y = new Uint8Array(new Float64Array(b).buffer);
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
};

out.environment = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0] && os.cpus()[0].model,
  date: new Date().toISOString().slice(0, 10),
};

// 1. package facts
out.package = {
  name: pkg.name,
  version: pkg.version,
  license: pkg.license,
  files: pkg.files,
  exportsKeys: Object.keys(pkg.exports),
  topLevelFiles: readdirSync(pkgDir),
  licenseFiles: readdirSync(pkgDir).filter((f) => /^(licen[cs]e|notice|copying)/i.test(f)),
  mtFiles: existsSync(join(pkgDir, 'mt')) ? readdirSync(join(pkgDir, 'mt')) : [],
};

// 2. loader
const t0 = performance.now();
const mj = await loadMujoco();
out.loader = {
  importName: "default export of '@mujoco/mujoco' (MainModuleFactory)",
  factoryType: typeof loadMujoco,
  loadMs: Math.round(performance.now() - t0),
  wasmLocation: "new URL('mujoco.wasm', import.meta.url) in mujoco.js; Module.locateFile(path, scriptDirectory) overrides it",
  sharedArrayBufferGlobalPresentInNode: typeof SharedArrayBuffer,
  heapIsShared: undefined,
};
const customLocate = await attempt(async () => {
  let called = null;
  const m2 = await loadMujoco({
    locateFile: (p, dir) => {
      called = { p, hasDir: typeof dir === 'string' };
      return join(pkgDir, p);
    },
  });
  return { called, mjSTATE: typeof m2.mj_stateSize };
});
out.loader.customLocateFile = customLocate.ok ? await customLocate.value : customLocate;
// 3. heap accessor via a buffer view
const heapBytes = () => {
  const b = mj.DoubleBuffer.FromArray([0]);
  try {
    return b.GetView().buffer.byteLength;
  } finally {
    b.delete();
  }
};
{
  const b = mj.DoubleBuffer.FromArray([0]);
  out.loader.heapIsShared = b.GetView().buffer instanceof SharedArrayBuffer;
  b.delete();
}
out.heap = { accessor: 'new DoubleBuffer([0]).GetView().buffer.byteLength (then delete)', initialBytes: heapBytes() };

// 4. models
const XML = (size) => `<mujoco>
  ${size}
  <option timestep="0.002"/>
  <worldbody>
    <geom name="floor" type="plane" size="2 2 .1"/>
    <site name="tip" pos="0 0 0.5"/>
    <body name="box" pos="0 0 .5">
      <freejoint/>
      <geom name="boxgeom" type="box" size=".1 .1 .1" mass="1"/>
    </body>
    <body name="drawer" pos="0.5 0 0.1">
      <joint name="slide" type="slide" axis="1 0 0" range="0 .3" frictionloss="2" damping="1"/>
      <geom name="dgeom" type="box" size=".1 .1 .05" mass="1"/>
      <site name="handle" pos=".1 0 0"/>
    </body>
    <body name="arm" pos="-0.5 0 0.5">
      <joint name="h1" type="hinge" axis="0 1 0" range="-1.5 1.5"/>
      <geom name="armgeom" type="capsule" fromto="0 0 0 .3 0 0" size=".03"/>
      <site name="armtip" pos=".3 0 0"/>
    </body>
  </worldbody>
  <actuator><position name="a1" joint="h1" kp="50"/><position name="a2" joint="slide" kp="50"/></actuator>
</mujoco>`;
const xmlPlain = XML('');
const xmlMem = XML('<size memory="1M"/>');

const model = mj.MjModel.from_xml_string(xmlPlain);
const data = new mj.MjData(model);
const owned = [model, data];

out.model = { nq: model.nq, nv: model.nv, nu: model.nu, nsite: model.nsite, ngeom: model.ngeom, nbody: model.nbody, timestep: model.opt.timestep };

// 5. state functions
const SIG = mj.mjtState.mjSTATE_INTEGRATION.value;
const sizeOf = (sig) => mj.mj_stateSize(model, sig);
const sigNames = ['TIME', 'QPOS', 'QVEL', 'ACT', 'HISTORY', 'WARMSTART', 'CTRL', 'QFRC_APPLIED', 'XFRC_APPLIED', 'EQ_ACTIVE', 'MOCAP_POS', 'MOCAP_QUAT', 'USERDATA', 'PLUGIN', 'PLASTIC'];
const single = {};
for (const n of sigNames) single[n] = sizeOf(mj.mjtState['mjSTATE_' + n].value);
const stateOut = {
  integrationSig: SIG,
  integrationSize: sizeOf(SIG),
  fullPhysicsSig: mj.mjtState.mjSTATE_FULLPHYSICS.value,
  fullPhysicsSize: sizeOf(mj.mjtState.mjSTATE_FULLPHYSICS.value),
  singleBitSizes: single,
  singleBitSum: Object.values(single).reduce((a, b) => a + b, 0),
  stateSizeSignature: 'mj_stateSize(model, sig:number): number',
};
const n = sizeOf(SIG);
const tryGet = (label, mk) => {
  mj.mj_resetData(model, data);
  data.qpos[2] = 0.77; // a recognisable non-zero value in the state
  const buf = mk();
  const r = attempt(() => {
    mj.mj_getState(model, data, buf, SIG);
    const view = buf.GetView ? Array.from(buf.GetView()) : Array.from(buf);
    return { length: view.length, outputWritten: view.some((v) => v !== 0) };
  });
  if (buf.delete) buf.delete();
  return { label, ...r };
};
stateOut.getStateArgs = [
  tryGet('Float64Array', () => new Float64Array(n)),
  tryGet('DoubleBuffer', () => mj.DoubleBuffer.FromArray(new Array(n).fill(0))),
  tryGet('plain number[]', () => new Array(n).fill(0)),
];
const trySet = (label, mk) => {
  const buf = mk();
  const r = attempt(() => {
    mj.mj_setState(model, data, buf, SIG);
    return 'accepted';
  });
  if (buf.delete) buf.delete();
  return { label, ...r };
};
stateOut.setStateArgs = [
  trySet('Float64Array', () => new Float64Array(n)),
  trySet('number[]', () => new Array(n).fill(0)),
  trySet('DoubleBuffer', () => mj.DoubleBuffer.FromArray(new Array(n).fill(0))),
];
out.state = stateOut;

// 6. restore check (INTEGRATION and FULLPHYSICS)
const FULL = mj.mjtState.mjSTATE_FULLPHYSICS.value;
// mj_getState writes only into a DoubleBuffer (a Float64Array is accepted but stays unwritten); mj_setState reads a Float64Array.
const capture = (sig) => {
  const buf = mj.DoubleBuffer.FromArray(new Array(sizeOf(sig)).fill(0));
  try {
    mj.mj_getState(model, data, buf, sig);
    return Float64Array.from(buf.GetView());
  } finally {
    buf.delete();
  }
};
const restore = (sig, arr) => mj.mj_setState(model, data, arr, sig);
const run = (steps, ctrlOf) => {
  const trace = [];
  for (let i = 0; i < steps; i += 1) {
    const c = ctrlOf(i);
    data.ctrl[0] = c[0];
    data.ctrl[1] = c[1];
    mj.mj_step(model, data);
    trace.push(...Array.from(data.qpos), ...Array.from(data.qvel), ...Array.from(data.qacc_warmstart));
  }
  return Float64Array.from(trace);
};
const ctrlOf = (i) => [Math.sin(i / 20), i > 100 ? 0.25 : 0];
const restoreResult = {};
for (const [name, sig] of [['INTEGRATION', SIG], ['FULLPHYSICS', FULL]]) {
  mj.mj_resetData(model, data);
  run(150, ctrlOf);
  const snap = capture(sig);
  const first = run(300, (i) => ctrlOf(i + 150));
  restore(sig, snap);
  const second = run(300, (i) => ctrlOf(i + 150));
  let maxDiff = 0;
  for (let i = 0; i < first.length; i += 1) maxDiff = Math.max(maxDiff, Math.abs(first[i] - second[i]));
  restoreResult[name] = { stateLength: snap.length, bitIdentical: bitsEqual(first, second), maxAbsDiff: maxDiff, comparedValues: first.length };
}
// restore into a fresh MjData (as the engine will do for each run)
{
  mj.mj_resetData(model, data);
  run(150, ctrlOf);
  const snap = capture(SIG);
  const first = run(300, (i) => ctrlOf(i + 150));
  const d2 = new mj.MjData(model);
  owned.push(d2);
  mj.mj_setState(model, d2, snap, SIG);
  const trace = [];
  for (let i = 0; i < 300; i += 1) {
    const c = ctrlOf(i + 150);
    d2.ctrl[0] = c[0];
    d2.ctrl[1] = c[1];
    mj.mj_step(model, d2);
    trace.push(...Array.from(d2.qpos), ...Array.from(d2.qvel), ...Array.from(d2.qacc_warmstart));
  }
  restoreResult.INTEGRATION_into_fresh_MjData = { bitIdentical: bitsEqual(first, Float64Array.from(trace)) };
}
{
  // Float64Array and DoubleBuffer must return the same numbers; the layout is the concatenation of single-bit signatures in bit order.
  mj.mj_resetData(model, data);
  run(40, ctrlOf);
  const viaF64 = capture(SIG);
  const unwritten = new Float64Array(n);
  mj.mj_getState(model, data, unwritten, SIG);
  restoreResult.float64ArrayOutputWritten = unwritten.some((v) => v !== 0);
  const db = mj.DoubleBuffer.FromArray(new Array(n).fill(0));
  mj.mj_getState(model, data, db, SIG);
  const viaDb = Float64Array.from(db.GetView());
  db.delete();
  let off = 0;
  const segs = [];
  for (const nm of sigNames) {
    const len = single[nm];
    segs.push([nm, off, len]);
    off += len;
  }
  const seg = (nm) => { const x = segs.find((q) => q[0] === nm); return Array.from(viaF64.slice(x[1], x[1] + x[2])); };
  restoreResult.float64ArrayOutputEqualsDoubleBufferOutput = bitsEqual(viaF64, viaDb);
  restoreResult.layoutMatchesBitOrder = {
    time: seg('TIME')[0] === data.time,
    qpos: bitsEqual(seg('QPOS'), Array.from(data.qpos)),
    qvel: bitsEqual(seg('QVEL'), Array.from(data.qvel)),
    warmstart: bitsEqual(seg('WARMSTART'), Array.from(data.qacc_warmstart)),
    ctrl: bitsEqual(seg('CTRL'), Array.from(data.ctrl)),
  };
  // warning counters are not part of the state vector
  const dw = new mj.MjData(model);
  owned.push(dw);
  dw.qvel[0] = 1e11;
  mj.mj_step(model, dw);
  const nb = () => { const w = dw.warning; const e = w.get(4); const v = e.number; e.delete(); return v; };
  const before = nb();
  mj.mj_setState(model, dw, viaF64, SIG);
  restoreResult.warningCounterBadQvelBeforeAndAfterSetState = [before, nb()];
  mj.mj_resetData(model, dw);
  restoreResult.warningCounterBadQvelAfterResetData = nb();
}
{
  mj.mj_resetData(model, data);
  run(150, ctrlOf);
  const snap2 = capture(SIG);
  const ra = run(100, (i) => ctrlOf(i + 150));
  mj.mj_setState(model, data, Array.from(snap2), SIG);
  const rb = run(100, (i) => ctrlOf(i + 150));
  mj.mj_setState(model, data, snap2, SIG);
  const rc = run(100, (i) => ctrlOf(i + 150));
  restoreResult.setStateInputNumberArrayVsFloat64Array = { numberArrayRunEqualsOriginal: bitsEqual(ra, rb), float64ArrayRunEqualsOriginal: bitsEqual(ra, rc) };
}
out.restore = restoreResult;

// 7. contacts
mj.mj_resetData(model, data);
run(400, () => [0, 0]);
const contactInfo = { ncon: data.ncon };
{
  const cv = data.contact;
  contactInfo.vecType = cv.constructor && cv.constructor.name;
  contactInfo.vecMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(cv)).filter((k) => k !== 'constructor');
  contactInfo.size = attempt(() => cv.size());
  const c0 = attempt(() => cv.get(0));
  if (c0.ok) {
    const c = c0.value;
    contactInfo.contactFields = Object.getOwnPropertyNames(Object.getPrototypeOf(c)).filter((k) => k !== 'constructor');
    contactInfo.geomIds = { geom1: c.geom1, geom2: c.geom2, geom: c.geom, dist: c.dist };
    contactInfo.geomNames = [c.geom1, c.geom2].map((g) => mj.mj_id2name(model, mj.mjtObj.mjOBJ_GEOM.value, g));
    const f = mj.DoubleBuffer.FromArray([0, 0, 0, 0, 0, 0]);
    contactInfo.contactForceCall = attempt(() => {
      mj.mj_contactForce(model, data, 0, f);
      return Array.from(f.GetView());
    });
    f.delete();
    contactInfo.contactForceSignature = 'mj_contactForce(model, data, contactId:number, result:DoubleBuffer(6)): void; normal force is element 0';
    if (c.delete) c.delete();
  } else contactInfo.getError = c0.error;
  cv.delete();
  const cv2 = data.contact;
  contactInfo.accessReturnsNewObjectEachTime = cv !== cv2;
  cv2.delete();
  // is a contact vector a copy or a live view? lift the box away and recompute contacts
  const held = data.contact;
  const sizeBefore = held.size();
  data.qpos[2] = 5;
  mj.mj_forward(model, data);
  contactInfo.heldVecSizeBeforeAfterContactsVanish = [sizeBefore, held.size(), data.ncon];
  held.delete();
  const f64 = new Float64Array(6);
  mj.mj_resetData(model, data);
  run(400, () => [0, 0]);
  contactInfo.contactForceWithFloat64Array = attempt(() => {
    mj.mj_contactForce(model, data, 0, f64);
    return Array.from(f64);
  });
}
out.contacts = contactInfo;

// 8. warnings
{
  const w = data.warning; // reference accessor: never delete (see section 10)
  const w0 = attempt(() => w.get(0));
  out.warnings = {
    type: w.constructor && w.constructor.name,
    size: attempt(() => w.size()),
    counterCount: mj.mjtWarning.mjNWARNING.value,
    names: Object.keys(mj.mjtWarning),
    fieldsOfStat: w0.ok ? Object.getOwnPropertyNames(Object.getPrototypeOf(w0.value)).filter((k) => k !== 'constructor') : w0.error,
    lastinfoAndNumber: w0.ok ? { lastinfo: w0.value.lastinfo, number: w0.value.number } : null,
    instabilityIndices: { BADQPOS: 3, BADQVEL: 4, BADQACC: 5, BADCTRL: 6 },
  };
  // provoke instabilities; each case on a fresh MjData
  const readCounts = (d) => {
    const wv = d.warning; // reference accessor: never delete
    const r = [];
    for (let i = 0; i < mj.mjtWarning.mjNWARNING.value; i += 1) {
      const e = wv.get(i);
      r.push(e.number);
      e.delete();
    }
    return r;
  };
  const cases = {};
  for (const [label, poke] of [
    ['qvel[0]=1e11', (d) => { d.qvel[0] = 1e11; }],
    ['qvel[0]=NaN', (d) => { d.qvel[0] = NaN; }],
    ['qpos[0]=NaN', (d) => { d.qpos[0] = NaN; }],
    ['qpos[0]=1e11', (d) => { d.qpos[0] = 1e11; }],
    ['ctrl[0]=NaN', (d) => { d.ctrl[0] = NaN; }],
  ]) {
    const d3 = new mj.MjData(model);
    owned.push(d3);
    poke(d3);
    mj.mj_step(model, d3);
    const afterOne = readCounts(d3);
    const q0 = d3.qpos[0];
    const t = d3.time;
    mj.mj_step(model, d3);
    cases[label] = { countersAfterStep1: afterOne, countersAfterStep2: readCounts(d3), qpos0AfterStep1: q0, timeAfterStep1: t, qposFiniteAfterStep1: Number.isFinite(q0) };
  }
  out.warnings.provoked = cases;
  out.warnings.note = 'MuJoCo detects the bad value inside mj_step, calls mj_resetData, then sets the counter; qpos is finite afterwards, so a finiteness check alone cannot see the instability';
  if (w0.ok && w0.value.delete) w0.value.delete();
}

// 9. mj_jacSite
{
  mj.mj_resetData(model, data);
  mj.mj_forward(model, data);
  const jacp = mj.DoubleBuffer.FromArray(new Array(3 * model.nv).fill(0));
  const jacr = mj.DoubleBuffer.FromArray(new Array(3 * model.nv).fill(0));
  const siteId = mj.mj_name2id(model, mj.mjtObj.mjOBJ_SITE.value, 'armtip');
  out.jacSite = {
    signature: 'mj_jacSite(model, data, jacp:DoubleBuffer(3*nv)|null?, jacr:DoubleBuffer(3*nv)|null?, siteId:number): void',
    siteId,
    nv: model.nv,
    withBoth: attempt(() => {
      mj.mj_jacSite(model, data, jacp, jacr, siteId);
      return { jacpRowMajor3xNv: Array.from(jacp.GetView()).map((v) => +v.toFixed(6)) };
    }),
    withNullRot: attempt(() => {
      mj.mj_jacSite(model, data, jacp, null, siteId);
      return 'accepted';
    }),
    withNullPos: attempt(() => {
      mj.mj_jacSite(model, data, null, jacr, siteId);
      return 'accepted';
    }),
    withFloat64Array: attempt(() => {
      const fp = new Float64Array(3 * model.nv);
      mj.mj_jacSite(model, data, fp, new Float64Array(3 * model.nv), siteId);
      return { written: fp.some((v) => v !== 0), last: fp[fp.length - 1] };
    }),
  };
  jacp.delete();
  jacr.delete();
}

// 10. delete() on wrapped objects
{
  const names = Object.keys(mj).filter((k) => /^(Mj|mj[A-Z])/.test(k) && typeof mj[k] === 'function' && mj[k].prototype && typeof mj[k].prototype.delete === 'function');
  const ctors = Object.keys(mj).filter((k) => typeof mj[k] === 'object' && mj[k] && typeof mj[k].prototype !== 'undefined' && k.startsWith('Mj'));
  const checks = [];
  const make = {
    MjModel: () => mj.MjModel.from_xml_string(xmlPlain),
    MjData: () => new mj.MjData(model),
    DoubleBuffer: () => mj.DoubleBuffer.FromArray([0]),
    IntBuffer: () => mj.IntBuffer.FromArray([0]),
    FloatBuffer: () => mj.FloatBuffer.FromArray([0]),
    Uint8Buffer: () => mj.Uint8Buffer.FromArray([0]),
    MjOption: () => new mj.MjOption(),
    MjvScene: () => new mj.MjvScene(model, 100),
    MjvCamera: () => new mj.MjvCamera(),
    MjvPerturb: () => new mj.MjvPerturb(),
    MjvOption: () => new mj.MjvOption(),
  };
  for (const [k, f] of Object.entries(make)) {
    const r = attempt(() => {
      const o = f();
      const has = typeof o.delete === 'function';
      if (has) o.delete();
      return has;
    });
    checks.push({ type: k, hasDelete: r.ok ? r.value : r.error });
  }
  // accessor results: each in a child process, because a wrong delete aborts the module
  const sub = [];
  for (const which of ['data.contact', 'data.warning', 'data.solver', 'data.timer', 'model.opt', 'data.body(0)', 'data.geom(0)', 'data.contact.get(0)', 'data.warning.get(0)']) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--delete-safety', which], { encoding: 'utf8' });
    let info = null;
    try { info = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { info = null; }
    sub.push({ accessor: which, type: info && info.type, hasDelete: info && info.hasDelete, deleteThenKeepUsingOwnerOk: r.status === 0 });
  }
  out.deleteChecks = { constructed: checks, accessors: sub, prototypeCountWithDelete: names.length, listedMjConstructors: ctors.length };
}

// 11. MjData byte size with and without <size memory> (fresh module instance per case)
{
  const measure = async (xml) => {
    const m2 = await loadMujoco();
    const hb = () => { const b = m2.DoubleBuffer.FromArray([0]); const n2 = b.GetView().buffer.byteLength; b.delete(); return n2; };
    const md = m2.MjModel.from_xml_string(xml);
    const before = hb();
    const d0 = new m2.MjData(md);
    const afterOne = hb();
    const ds = [];
    for (let i = 0; i < 20; i += 1) ds.push(new m2.MjData(md));
    const after21 = hb();
    const info = {
      model_narena: md.narena,
      model_nbuffer: md.nbuffer,
      data_narena: d0.narena,
      data_nbuffer: d0.nbuffer,
      oneMjDataBytes_narena_plus_nbuffer: d0.narena + d0.nbuffer,
      heapBytesBefore: before,
      heapBytesAfter1Data: afterOne,
      heapBytesAfter21Data: after21,
      heapGrowthPerDataApprox: Math.round((after21 - before) / 21),
    };
    ds.forEach((x) => x.delete());
    d0.delete();
    md.delete();
    return info;
  };
  out.mjDataSize = { withoutSizeElement: await measure(xmlPlain), withSizeMemory1M: await measure(xmlMem) };
}

// 12. stale view after heap growth (fresh module instance)
{
  const m3 = await loadMujoco();
  const md = m3.MjModel.from_xml_string(xmlPlain);
  const d = new m3.MjData(md);
  const hb = () => { const b = m3.DoubleBuffer.FromArray([0]); const n3 = b.GetView().buffer.byteLength; b.delete(); return n3; };
  const view = d.qpos;
  const probeBuf = m3.DoubleBuffer.FromArray([1, 2, 3]);
  const bufView = probeBuf.GetView();
  const lenBefore = view.length;
  const heapBefore = hb();
  const extra = [];
  for (let i = 0; i < 40 && hb() === heapBefore; i += 1) extra.push(new m3.MjData(md));
  const fresh = d.qpos;
  out.staleView = {
    qposLenBefore: lenBefore,
    heapBeforeBytes: heapBefore,
    heapAfterBytes: hb(),
    heapGrew: hb() > heapBefore,
    staleQposViewLength: view.length,
    staleQposViewByteLength: view.byteLength,
    staleBufferViewLength: bufView.length,
    freshQposViewLength: fresh.length,
    freshQposValueOk: fresh[2] === d.qpos[2],
    sameArrayBufferObject: view.buffer === fresh.buffer,
    staleReadReturnsUndefined: view[0] === undefined,
  };
  extra.forEach((x) => x.delete());
  probeBuf.delete();
  d.delete();
  md.delete();
}

// 13. README claims
{
  const r = {};
  r.mju_rotVecQuat_with_DoubleBuffer = attempt(() => {
    const res = mj.DoubleBuffer.FromArray([0, 0, 0]);
    mj.mju_rotVecQuat(res, [1, 0, 0], [0.7071067811865476, 0, 0, 0.7071067811865476]);
    const v = Array.from(res.GetView()).map((x) => +x.toFixed(6));
    res.delete();
    return v;
  });
  r.readmeBufferForms = {
    'new DoubleBuffer([0,0,0])  (README form)': attempt(() => { const b = new mj.DoubleBuffer([0, 0, 0]); b.delete(); return 'accepted'; }),
    'new DoubleBuffer(3)': attempt(() => { const b = new mj.DoubleBuffer(3); const l = b.GetView().length; b.delete(); return { viewLength: l, count: 3 }; }),
    'DoubleBuffer.FromArray([0,0,0])': attempt(() => { const b = mj.DoubleBuffer.FromArray([0, 0, 0]); const l = b.GetElementCount(); b.delete(); return { elementCount: l }; }),
    'buffer.getView() (README form)': attempt(() => { const b = new mj.DoubleBuffer(3); const t = typeof b.getView; b.delete(); return t; }),
  };
  r.constants = { mjNEQDATA: attempt(() => mj.mjNEQDATA), mjFRAMESTRING: attempt(() => Array.isArray(mj.mjFRAMESTRING)) };
  r.enumValue = attempt(() => mj.mjtDisableBit.mjDSBL_CLAMPCTRL.value);
  r.mjv_updateScene = attempt(() => {
    const scene = new mj.MjvScene(model, 1000);
    const cam = new mj.MjvCamera();
    const pert = new mj.MjvPerturb();
    const opt = new mj.MjvOption();
    mj.mjv_updateScene(model, data, opt, pert, cam, mj.mjtCatBit.mjCAT_ALL.value, scene);
    const g = scene.ngeom;
    [scene, cam, pert, opt].forEach((o) => o.delete());
    return { ngeom: g };
  });
  r.qposIsLiveView = attempt(() => {
    mj.mj_resetData(model, data);
    const q = data.qpos;
    const a = q[2];
    mj.mj_step(model, data);
    return { changedAfterStep: q[2] !== a, isFloat64Array: q instanceof Float64Array };
  });
  r.contactAccessAfterStep = attempt(() => {
    const c = data.contact;
    mj.mj_step(model, data);
    const sizeAfter = c.size();
    c.delete();
    return { staleVecSizeAfterStep: sizeAfter, ncon: data.ncon };
  });
  r.mtBuildInstructionsHeaders = 'README says the /mt build needs COOP/COEP; this probe loads only the default single-thread build';
  out.readmeChecks = r;
}

owned.forEach((o) => o.delete());

// 14. direct heap names (separate instance: a missing runtime export aborts the module)
{
  const mj2 = await loadMujoco();
  out.exportedHeapNames = ['HEAP8', 'HEAPU8', 'HEAPF64', 'wasmMemory', '_malloc'].map((n) => {
    const r = attempt(() => typeof mj2[n]);
    return { name: n, result: r.ok ? r.value : 'throws: ' + r.error };
  });
}
console.log(JSON.stringify(out, null, 2));
