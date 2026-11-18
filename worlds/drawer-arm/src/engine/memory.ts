import type { Deletable } from './mujoco-subset.js';

export type EngineMemoryErrorCode = 'view-detached';

/** A typed-array view over WebAssembly memory has an unexpected length (the heap grew and detached it). */
export class EngineMemoryError extends Error {
  readonly code: EngineMemoryErrorCode;

  constructor(code: EngineMemoryErrorCode, message?: string) {
    super(message ?? `engine memory error: ${code}`);
    this.name = 'EngineMemoryError';
    this.code = code;
  }
}

/**
 * Reads the array `holder[name]` (for example `data.qpos`) and copies it at once into a
 * JavaScript-owned Float64Array. The view is fetched fresh at every call and never kept: a
 * view over WebAssembly memory has length 0 after the heap grows. Any length other than
 * `expectedLength` throws EngineMemoryError('view-detached').
 */
export function readArray(holder: object, name: string, expectedLength: number): Float64Array {
  const view = (holder as Record<string, unknown>)[name];
  if (view === null || typeof view !== 'object' || typeof (view as { length?: unknown }).length !== 'number') {
    throw new EngineMemoryError('view-detached', `engine memory error: "${name}" is not an array view`);
  }
  const array = view as ArrayLike<number>;
  if (array.length !== expectedLength) {
    throw new EngineMemoryError('view-detached', `engine memory error: "${name}" has length ${array.length}, expected ${expectedLength}`);
  }
  return Float64Array.from(array);
}

/** Writes `values` into the array `holder[name]` through a fresh view; same length rule as readArray. */
export function writeArray(holder: object, name: string, values: ArrayLike<number>): void {
  const view = (holder as Record<string, unknown>)[name];
  if (view === null || typeof view !== 'object' || typeof (view as { length?: unknown }).length !== 'number') {
    throw new EngineMemoryError('view-detached', `engine memory error: "${name}" is not an array view`);
  }
  const target = view as { length: number; [index: number]: number };
  if (target.length !== values.length) {
    throw new EngineMemoryError('view-detached', `engine memory error: "${name}" has length ${target.length}, expected ${values.length}`);
  }
  for (let i = 0; i < values.length; i += 1) target[i] = values[i] as number;
}

/**
 * Collects wrapped temporaries created during one call and deletes them, newest first, when it
 * closes. Never register non-owning references (`data.warning`, `data.solver`, `data.timer`).
 */
export class Scope {
  private readonly items: Deletable[] = [];
  private closed = false;

  add<T extends Deletable>(item: T): T {
    if (this.closed) {
      item.delete();
      throw new Error('Scope is closed');
    }
    this.items.push(item);
    return item;
  }

  /** Deletes every registered object once; the first delete error is rethrown after all were tried. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    let failed = false;
    let first: unknown;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      try {
        (this.items[i] as Deletable).delete();
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    this.items.length = 0;
    if (failed) throw first;
  }
}

/** Runs `body` with a fresh Scope and closes the scope in `finally`, also when `body` throws. */
export function withScope<T>(body: (scope: Scope) => T): T {
  const scope = new Scope();
  let result: T;
  try {
    result = body(scope);
  } catch (error) {
    try {
      scope.close();
    } catch {
      // the error of the body is the one that matters
    }
    throw error;
  }
  scope.close();
  return result;
}
