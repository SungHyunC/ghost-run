import { describe, expect, it } from 'vitest';
import type { SqlRequest, SqlResponse, SqlRunner } from '../src/sql/executor';
import { createWatchdogExecutor, type TimerPort } from '../src/sql/watchdog';

class ManualTimers implements TimerPort {
  private now = 0;
  private nextId = 1;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  get active(): number {
    return this.pending.size;
  }
  advance(ms: number): void {
    this.now += ms;
    for (const [id, t] of [...this.pending]) {
      if (t.at <= this.now) {
        this.pending.delete(id);
        t.fn();
      }
    }
  }
}

class FakeRunner implements SqlRunner {
  terminated = 0;
  private resolveRun: ((r: SqlResponse) => void) | null = null;
  run(_request: SqlRequest): Promise<SqlResponse> {
    return new Promise((resolve) => {
      this.resolveRun = resolve;
    });
  }
  terminate(): void {
    this.terminated += 1;
  }
  reply(r: SqlResponse): void {
    this.resolveRun?.(r);
  }
}

const REQ: SqlRequest = { dbBytes: null, sql: 'SELECT 1', outputLimit: 1000 };
const OK: SqlResponse = { ok: true, stdout: '1\n', dbBytes: new Uint8Array(), wrote: false, tables: {} };
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

function setup() {
  const timers = new ManualTimers();
  const runners: FakeRunner[] = [];
  const exec = createWatchdogExecutor({
    spawn: () => {
      const r = new FakeRunner();
      runners.push(r);
      return r;
    },
    timeoutMs: 5000,
    timers,
  });
  return { timers, runners, exec };
}

describe('watchdog executor (manual timers)', () => {
  it('times out at exactly timeoutMs, terminates once, and respawns on the next call', async () => {
    const { timers, runners, exec } = setup();
    let result: SqlResponse | null = null;
    void exec.run(REQ).then((r) => {
      result = r;
    });
    await flush();
    timers.advance(4999);
    await flush();
    expect(result).toBeNull();
    timers.advance(1);
    await flush();
    expect(result).toEqual({ ok: false, stderr: 'sql statement exceeded the watchdog', watchdog: true });
    expect(runners).toHaveLength(1);
    expect(runners[0]!.terminated).toBe(1);

    const second = exec.run(REQ);
    await flush();
    expect(runners).toHaveLength(2);
    runners[1]!.reply(OK);
    expect(await second).toBe(OK);
  });

  it('ignores a late reply from a terminated runner', async () => {
    const { timers, runners, exec } = setup();
    const first = exec.run(REQ);
    await flush();
    timers.advance(5000);
    const result = await first;
    expect(result.ok).toBe(false);
    runners[0]!.reply(OK);
    await flush();
    expect(await first).toBe(result);
    expect(runners[0]!.terminated).toBe(1);
  });

  it('settles with the runner answer before the deadline and clears the timer', async () => {
    const { timers, runners, exec } = setup();
    const p = exec.run(REQ);
    await flush();
    expect(timers.active).toBe(1);
    runners[0]!.reply(OK);
    expect(await p).toBe(OK);
    expect(timers.active).toBe(0);
    timers.advance(10000);
    expect(runners[0]!.terminated).toBe(0);

    const p2 = exec.run(REQ);
    await flush();
    expect(runners).toHaveLength(1);
    runners[0]!.reply(OK);
    expect(await p2).toBe(OK);
  });

  it('dispose terminates the runner and releases a pending call', async () => {
    const { runners, exec } = setup();
    const p = exec.run(REQ);
    await flush();
    exec.dispose();
    const r = await p;
    expect(r.ok).toBe(false);
    expect(runners[0]!.terminated).toBe(1);
  });
});
