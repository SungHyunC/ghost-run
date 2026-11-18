// Page controller: owns the PageState, performs the effects the pure reducer describes, and feeds
// the results back as actions. All time, timers, SQL, and downloads come in through `PageServices`.
import type { SqlExecutor, TimerPort, VirtualProject } from '@ghost-run/playground-shell';
import { runPlayground } from './pipeline/run-playground';
import { buildProject } from './scenarios/project';
import { initialPageState, pageReducer } from './state/reducer';
import type { PageAction, PageEffect, PageState, RunRequest } from './state/reducer';

export interface PageServices {
  readonly sql: SqlExecutor;
  /** Returns `YYYY-MM-DDTHH:MM:SSZ`. */
  readonly clock: () => string;
  readonly timers: TimerPort;
  /** Offers text as a file download; the page creates the Blob. */
  readonly download: (fileName: string, text: string) => void;
}

export interface PageController {
  getState(): PageState;
  subscribe(listener: () => void): () => void;
  dispatch(action: PageAction): PageState;
  dispose(): void;
}

type Entry = VirtualProject['entries'][string];

/** Deep copy of the fixture with the README replaced by the text of this run. */
function projectFor(base: VirtualProject, readme: string): VirtualProject {
  const entries: Record<string, Entry> = {};
  for (const [path, entry] of Object.entries(base.entries)) {
    entries[path] =
      entry.kind === 'dir'
        ? { kind: 'dir' }
        : entry.tables === undefined
          ? { kind: 'file', bytes: entry.bytes.slice() }
          : { kind: 'file', bytes: entry.bytes.slice(), tables: { ...entry.tables } };
  }
  entries['README.md'] = { kind: 'file', bytes: new TextEncoder().encode(readme) };
  return { name: base.name, entries };
}

export function createPageController(services: PageServices, wardsText?: string): PageController {
  let state = initialPageState(wardsText);
  let disposed = false;
  let debounce: unknown;
  let hasDebounce = false;
  let baseProject: Promise<VirtualProject> | undefined;
  const listeners = new Set<() => void>();

  function fixture(): Promise<VirtualProject> {
    baseProject ??= buildProject(services.sql);
    return baseProject;
  }

  function runEffect(request: RunRequest): void {
    void (async () => {
      try {
        const base = await fixture();
        const run = await runPlayground({
          project: projectFor(base, request.readme),
          plan: request.plan,
          wardSet: request.wardSet,
          ...(request.provenance === undefined ? {} : { provenance: request.provenance }),
          sql: services.sql,
        });
        if (disposed) return;
        dispatch({
          type: 'runFinished',
          origin: request.origin,
          requestId: request.requestId,
          run,
          recordedAt: request.origin === 'explicit' ? services.clock() : '',
        });
      } catch {
        if (disposed) return;
        dispatch({ type: 'runFailed', origin: request.origin, requestId: request.requestId });
      }
    })();
  }

  function perform(effect: PageEffect): void {
    switch (effect.type) {
      case 'cancelDebounce':
        if (hasDebounce) services.timers.clearTimeout(debounce);
        hasDebounce = false;
        return;
      case 'scheduleDebounce':
        if (hasDebounce) services.timers.clearTimeout(debounce);
        hasDebounce = true;
        debounce = services.timers.setTimeout(() => {
          hasDebounce = false;
          dispatch({ type: 'wards', event: { type: 'debounceElapsed' } });
        }, effect.ms);
        return;
      case 'runPlayground':
        runEffect(effect.request);
        return;
      case 'downloadPlan':
        services.download(effect.fileName, effect.text);
        return;
    }
  }

  function dispatch(action: PageAction): PageState {
    if (disposed) return state;
    const step = pageReducer(state, action);
    state = step.state;
    for (const listener of [...listeners]) listener();
    for (const effect of step.effects) perform(effect);
    return state;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch,
    dispose() {
      disposed = true;
      if (hasDebounce) services.timers.clearTimeout(debounce);
      hasDebounce = false;
      listeners.clear();
    },
  };
}
