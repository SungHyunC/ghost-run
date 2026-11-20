// The live controller: composes the record-driven walk hook with the lazy engines.
// It owns the box (text or sliders), the run token, the engine cache, and the Live_Badge source.
// It never reads the clock; timers belong to `useWalk` and the adapters.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorldId } from '../config';
import type { PresetRecord, RunsFile, WorldRecord } from '../data/types';
import { classify, toRecordedWalkRecord, toUnsupportedRecord, toWalkRecord } from '../live/classify';
import { echo, KNOWN_CLOUD, KNOWN_HAND, KNOWN_SHELL, normalizeSliders, normalizeText } from '../live/input';
import type { SliderValues, TextProblem } from '../live/input';
import { defaultLoaders } from '../live/loaders';
import { isKnown, PRESETS } from '../live/presets';
import type { Preset } from '../live/presets';
import type { LightEngines, LiveAnswer, LiveEngine, LiveInput, LiveLoaders } from '../live/types';
import { defaultScheduler, type Scheduler } from './scheduler';
import type { InViewState } from './useInView';
import { useReducedMotion } from './useReducedMotion';
import { useWalk, type Walk } from './useWalk';

export type EngineState = 'idle' | 'loading' | 'ready' | 'failed';
export type Displayed = 'none' | 'live' | 'recorded';

export interface ControllerMessage {
  kind: 'loading' | 'rejected' | 'failed' | 'recorded';
  text: string;
}

export interface LiveVisibility {
  /** The section is within the near margin (engines may load). */
  near: InViewState;
  /** The section is at least 25% in view (the first Preset autoplays). */
  seen: InViewState;
}

export interface UseLiveWalkthroughOptions {
  runs: RunsFile;
  loaders?: LiveLoaders;
  scheduler?: Scheduler;
  visibility: LiveVisibility;
}

export interface LiveWalkthrough {
  walk: Walk;
  /** The selected tab (may be ahead of the displayed world while a run is pending). */
  world: WorldId;
  text: Record<'shell' | 'cloud', string>;
  sliders: SliderValues;
  /** The Preset whose input equals the box, or null. */
  known: Preset | null;
  engines: Record<WorldId, EngineState>;
  busy: boolean;
  /** True once the visitor edited the box after a run; the Fixed_Plan tag and text then give way to the box. */
  edited: boolean;
  displayed: Displayed;
  message: ControllerMessage | null;
  pickWorld: (world: WorldId) => void;
  pickPreset: (id: string) => void;
  run: () => void;
  replay: () => void;
  jump: (n: number) => void;
  setText: (text: string) => void;
  setSliders: (values: SliderValues) => void;
}

export const LOADING: Record<WorldId, string> = {
  shell: 'Copying the project\u2026',
  hand: 'Summoning eight ghost arms\u2026',
  cloud: 'Copying the buckets\u2026',
};

const REJECTED: Record<TextProblem | 'out-of-range', string> = {
  empty: 'Type a plan first, or pick one of the examples.',
  'too-long': 'That plan is too long. Keep it under 256 characters.',
  'invalid-character': 'That plan has a control or hidden character, so I did not run it.',
  'out-of-range': 'Those values are out of range, so I did not run them.',
};

const ENGINE_FAILED = 'The live engine did not start.';
const MSG_RECORDED = `${ENGINE_FAILED} This is the recorded run of the same plan.`;
const MSG_NO_RUN = `${ENGINE_FAILED} I cannot run your plan right now. It stays in the box.`;

const KNOWN: Record<WorldId, readonly string[]> = { shell: KNOWN_SHELL, cloud: KNOWN_CLOUD, hand: KNOWN_HAND };
const OUT_OF_RANGE_REASON = 'a value is outside the range I know.';

function recordedPreset(runs: RunsFile, world: WorldId, id: string): PresetRecord | undefined {
  return runs.worlds[world].presets.find((p) => p.id === id);
}

function firstPreset(world: WorldId): Preset {
  const p = PRESETS[world][0];
  if (p === undefined) throw new Error(`controller: ${world} has no Preset`);
  return p;
}

function handValues(preset: Preset): SliderValues {
  const i = preset.input;
  return i.world === 'hand' ? { speed: i.speed, force: i.force, distance: i.distance } : { speed: 0, force: 0, distance: 0 };
}

function handDisplay(v: SliderValues): string {
  return `grip ${String(v.force)} N, pull ${String(v.distance)} m at ${String(v.speed)} m/s`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One console line per live-engine failure: the world and the cause. The page keeps its fallback. */
function warnFailure(world: WorldId, cause: string, detail?: string): void {
  const tail = detail === undefined || detail === '' ? '' : `: ${detail}`;
  console.warn(`[ghost-run] live ${world} engine failed (${cause}${tail}); showing the recorded run instead.`);
}

const IDLE: Record<WorldId, EngineState> = { shell: 'idle', hand: 'idle', cloud: 'idle' };

export function useLiveWalkthrough({
  runs,
  loaders = defaultLoaders,
  scheduler = defaultScheduler,
  visibility,
}: UseLiveWalkthroughOptions): LiveWalkthrough {
  const reduced = useReducedMotion();
  const first = firstPreset('shell');
  const initial = useMemo<WorldRecord>(() => {
    const rec = recordedPreset(runs, 'shell', first.id);
    if (rec === undefined) throw new Error('controller: the Runs_File has no first Shell Preset');
    return toRecordedWalkRecord(runs.worlds.shell, rec);
  }, [runs, first.id]);

  // No signal and no motion both show the recorded final state of the first Preset.
  const settledAtStart = reduced || visibility.near === 'unsupported';
  const walk = useWalk({ initial, scheduler, settled: settledAtStart });
  const { show } = walk.controls;

  const [world, setWorld] = useState<WorldId>('shell');
  const [text, setTextState] = useState<Record<'shell' | 'cloud', string>>(() => ({
    shell: recordedPreset(runs, 'shell', first.id)?.plan.display ?? '',
    cloud: recordedPreset(runs, 'cloud', firstPreset('cloud').id)?.plan.display ?? '',
  }));
  const [sliders, setSlidersState] = useState<SliderValues>(() => handValues(firstPreset('hand')));
  const [engines, setEngines] = useState<Record<WorldId, EngineState>>(IDLE);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);
  const [displayed, setDisplayed] = useState<Displayed>(settledAtStart ? 'recorded' : 'none');
  const [message, setMessage] = useState<ControllerMessage | null>(null);

  const token = useRef(0);
  const mounted = useRef(false);
  const autoplayed = useRef(false);
  const warmed = useRef(false);
  const lightP = useRef<Promise<LightEngines> | null>(null);
  const handP = useRef<Promise<LiveEngine> | null>(null);
  const lightDone = useRef<LightEngines | null>(null);
  const handDone = useRef<LiveEngine | null>(null);
  const loadError = useRef('');

  // A settled start (no motion, no signal) shows a recorded run; the badge follows.
  useEffect(() => {
    if (settledAtStart) setDisplayed((d) => (d === 'none' ? 'recorded' : d));
  }, [settledAtStart]);

  const known = useMemo<Preset | null>(() => {
    if (world === 'hand') return PRESETS.hand.find((p) => isKnown({ world: 'hand', ...sliders }, p)) ?? null;
    const shown = text[world];
    return (
      PRESETS[world].find((p) => recordedPreset(runs, world, p.id)?.plan.display === shown) ?? null
    );
  }, [world, text, sliders, runs]);

  // Engines. A rejected load is not kept, so the next action loads again.
  const ensureLight = useCallback((): Promise<LightEngines> => {
    if (lightP.current !== null) return lightP.current;
    setEngines((e) => ({ ...e, shell: 'loading', cloud: 'loading' }));
    const p = loaders
      .light()
      .then((l) => {
        if (!mounted.current) {
          l.dispose();
          throw new Error('unmounted');
        }
        lightDone.current = l;
        setEngines((e) => ({ ...e, shell: 'ready', cloud: 'ready' }));
        return l;
      })
      .catch((err: unknown) => {
        lightP.current = null;
        if (mounted.current) setEngines((e) => ({ ...e, shell: 'failed', cloud: 'failed' }));
        throw err;
      });
    lightP.current = p;
    return p;
  }, [loaders]);

  const ensureHand = useCallback((): Promise<LiveEngine> => {
    if (handP.current !== null) return handP.current;
    setEngines((e) => ({ ...e, hand: 'loading' }));
    const p = loaders
      .hand()
      .then((h) => {
        if (!mounted.current) {
          h.dispose();
          throw new Error('unmounted');
        }
        handDone.current = h;
        setEngines((e) => ({ ...e, hand: 'ready' }));
        return h;
      })
      .catch((err: unknown) => {
        handP.current = null;
        if (mounted.current) setEngines((e) => ({ ...e, hand: 'failed' }));
        throw err;
      });
    handP.current = p;
    return p;
  }, [loaders]);

  const engineFor = useCallback(
    async (w: WorldId): Promise<LiveEngine | null> => {
      try {
        if (w === 'hand') return await ensureHand();
        const l = await ensureLight();
        return w === 'shell' ? l.shell : l.cloud;
      } catch (error) {
        loadError.current = describe(error);
        return null;
      }
    },
    [ensureHand, ensureLight],
  );

  const showRecorded = useCallback(
    (w: WorldId, preset: Preset): boolean => {
      const rec = recordedPreset(runs, w, preset.id);
      if (rec === undefined) return false;
      show(toRecordedWalkRecord(runs.worlds[w], rec));
      setDisplayed('recorded');
      return true;
    },
    [runs, show],
  );

  /** One run: engine call, the optional Fixed_Plan call, token checks after each await. */
  const execute = useCallback(
    async (w: WorldId, input: LiveInput, preset: Preset | null, display: string) => {
      const t = ++token.current;
      setEdited(false);
      setBusy(true);
      setMessage({ kind: 'loading', text: LOADING[w] });
      const stale = () => t !== token.current || !mounted.current;

      const fail = () => {
        if (preset !== null && showRecorded(w, preset)) setMessage({ kind: 'recorded', text: MSG_RECORDED });
        else setMessage({ kind: 'failed', text: MSG_NO_RUN });
        setBusy(false);
      };

      const engine = await engineFor(w);
      if (stale()) return;
      if (engine === null) {
        warnFailure(w, 'load', loadError.current);
        return fail();
      }

      const answer: LiveAnswer = await engine
        .run(input)
        .catch((error: unknown): LiveAnswer => ({ status: 'failed', cause: 'run', detail: describe(error) }));
      if (stale()) return;
      if (answer.status === 'failed') {
        warnFailure(w, answer.cause, answer.detail);
        return fail();
      }

      let record: WorldRecord;
      if (answer.status === 'ran') {
        let fixedAnswer: LiveAnswer | null = null;
        if (answer.run.plan.verdict === 'block' && preset?.fix != null) {
          fixedAnswer = await engine
            .run(preset.fix)
            .catch((error: unknown): LiveAnswer => ({ status: 'failed', cause: 'run', detail: describe(error) }));
          if (stale()) return;
          if (fixedAnswer.status === 'failed') warnFailure(w, fixedAnswer.cause, fixedAnswer.detail);
        }
        const outcome = classify(answer, fixedAnswer);
        record = toWalkRecord(answer.run, fixedAnswer?.status === 'ran' ? fixedAnswer.run : null, outcome, 'live');
      } else {
        const reason = answer.status === 'unsupported' ? answer.reason : OUT_OF_RANGE_REASON;
        const commands = input.world === 'shell' ? [...input.actions] : input.world === 'cloud' ? [...input.lines] : [display];
        record = toUnsupportedRecord(runs.worlds[w], commands, display, { reason, known: [...KNOWN[w]] });
      }
      show(record);
      setDisplayed('live');
      setMessage(null);
      setBusy(false);
    },
    [engineFor, runs, show, showRecorded],
  );

  const runPreset = useCallback(
    (w: WorldId, preset: Preset) => {
      autoplayed.current = true;
      const display = recordedPreset(runs, w, preset.id)?.plan.display ?? '';
      void execute(w, preset.input, preset, display);
    },
    [execute, runs],
  );

  const pickPreset = useCallback(
    (id: string) => {
      const preset = PRESETS[world].find((p) => p.id === id);
      if (preset === undefined) return;
      if (world === 'hand') setSlidersState(handValues(preset));
      else setTextState((s) => ({ ...s, [world]: recordedPreset(runs, world, id)?.plan.display ?? '' }));
      runPreset(world, preset);
    },
    [world, runs, runPreset],
  );

  const pickWorld = useCallback(
    (w: WorldId) => {
      setWorld(w);
      const preset = firstPreset(w);
      if (w === 'hand') setSlidersState(handValues(preset));
      else setTextState((s) => ({ ...s, [w]: recordedPreset(runs, w, preset.id)?.plan.display ?? '' }));
      runPreset(w, preset);
    },
    [runs, runPreset],
  );

  const run = useCallback(() => {
    autoplayed.current = true;
    if (known !== null) {
      runPreset(world, known);
      return;
    }
    const reject = (problem: TextProblem | 'out-of-range', raw: string) => {
      const base = REJECTED[problem];
      setMessage({ kind: 'rejected', text: raw === '' ? base : `${base} I saw: ${echo(raw)}` });
    };
    if (world === 'hand') {
      const n = normalizeSliders(sliders);
      if (!n.ok) return reject(n.problem, '');
      void execute('hand', { world: 'hand', ...n.values }, null, handDisplay(n.values));
      return;
    }
    const raw = text[world];
    const n = normalizeText(raw);
    if (!n.ok) return reject(n.problem, n.problem === 'invalid-character' ? raw : '');
    const input: LiveInput = world === 'shell' ? { world: 'shell', actions: [n.text] } : { world: 'cloud', lines: [n.text] };
    void execute(world, input, null, n.text);
  }, [known, world, sliders, text, execute, runPreset]);

  const { replay: walkReplay, jump: walkJump, cancel: walkCancel } = walk.controls;
  const replay = useCallback(() => {
    autoplayed.current = true;
    setEdited(false);
    walkReplay();
    setDisplayed((d) => (d === 'none' ? 'recorded' : d));
  }, [walkReplay]);
  const jump = useCallback(
    (n: number) => {
      autoplayed.current = true;
      setEdited(false);
      walkJump(n);
    },
    [walkJump],
  );

  const { animating } = walk;
  /** An edit while a run is pending or animating cancels that run; it also drops the Fixed_Plan tag. */
  const interrupt = useCallback(() => {
    if (busy || animating) {
      token.current++;
      setBusy(false);
      setMessage(null);
      if (animating) walkCancel();
    }
    setEdited(true);
  }, [busy, animating, walkCancel]);

  const setText = useCallback(
    (value: string) => {
      if (world === 'hand') return;
      interrupt();
      setTextState((s) => ({ ...s, [world]: value }));
    },
    [world, interrupt],
  );
  const setSliders = useCallback(
    (values: SliderValues) => {
      interrupt();
      setSlidersState(values);
    },
    [interrupt],
  );

  // Near: load the light chunk and warm the SQL worker. Under Reduced_Motion the first Preset then runs once, settled.
  const { near, seen } = visibility;
  useEffect(() => {
    if (near !== 'seen') return;
    void engineFor('shell').then((engine) => {
      if (engine === null) return;
      if (!warmed.current) {
        warmed.current = true;
        void engine.warm().catch(() => undefined);
      }
      if (reduced && !autoplayed.current && mounted.current) runPreset('shell', firstPreset('shell'));
    });
  }, [near, reduced, engineFor, runPreset]);

  // Seen: the first Shell Preset plays once, unless the visitor already acted. Not under Reduced_Motion.
  useEffect(() => {
    if (seen !== 'seen' || reduced || autoplayed.current) return;
    runPreset('shell', firstPreset('shell'));
  }, [seen, reduced, runPreset]);

  // Mount and unmount: bump the token so late results are dropped, dispose every engine.
  useEffect(() => {
    const tokenRef = token;
    mounted.current = true;
    return () => {
      mounted.current = false;
      tokenRef.current++;
      lightDone.current?.dispose();
      handDone.current?.dispose();
      lightDone.current = null;
      handDone.current = null;
      lightP.current = null;
      handP.current = null;
      warmed.current = false;
    };
  }, []);

  return {
    walk,
    world,
    text,
    sliders,
    known,
    engines,
    busy,
    edited,
    displayed,
    message,
    pickWorld,
    pickPreset,
    run,
    replay,
    jump,
    setText,
    setSliders,
  };
}
