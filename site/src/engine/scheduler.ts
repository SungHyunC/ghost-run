// The timer interface of the walkthrough. Tests inject a fake or recording scheduler.

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id) => {
    globalThis.clearTimeout(id);
  },
};
