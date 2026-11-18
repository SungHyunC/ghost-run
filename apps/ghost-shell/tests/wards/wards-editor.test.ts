import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TimerPort } from '@ghost-run/playground-shell';
import type { PlaygroundRun } from '../../src/pipeline/run-playground';
import {
  DEFAULT_WARDS_TEXT,
  createWardsEditorShell,
  initialWardsEditorState,
  wardsEditorErrors,
  wardsEditorReducer,
} from '../../src/wards/wards-editor';
import type { WardsEditorEvent, WardsEditorState } from '../../src/wards/wards-editor';

class ManualTimers implements TimerPort {
  readonly pending = new Map<number, { fn: () => void; ms: number }>();
  private next = 1;
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  fireAll(): void {
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const t of all) t.fn();
  }
}

const fakeRun = { verdict: 'pass' } as unknown as PlaygroundRun;
const apply = (s: WardsEditorState, e: WardsEditorEvent) => wardsEditorReducer(s, e);
const BAD = 'wards:\n  - id: x\n    kind: nope\n';

describe('wards editor reducer', () => {
  it('starts from the bundled text, which equals the file bytes', () => {
    const s = initialWardsEditorState();
    expect(s.parsed.ok).toBe(true);
    expect(s.runId).toBe(0);
    expect(s.stale).toBe(false);
    expect(DEFAULT_WARDS_TEXT).toBe(readFileSync(new URL('../../wards.yaml', import.meta.url), 'utf8'));
  });

  it('edit stores the text and reschedules a 300 ms debounce without parsing', () => {
    const step = apply(initialWardsEditorState(), { type: 'edit', text: 'x' });
    expect(step.state.text).toBe('x');
    expect(step.effects).toEqual([{ type: 'cancelDebounce' }, { type: 'scheduleDebounce', ms: 300 }]);
    expect(step.state.runId).toBe(0);
  });

  it('a parse error keeps the shown run, marks stale, and a fix clears it and requests a run', () => {
    let s = apply(initialWardsEditorState(), { type: 'runFinished', runId: 0, run: fakeRun }).state;
    s = apply(apply(s, { type: 'edit', text: BAD }).state, { type: 'debounceElapsed' }).state;
    expect(s.stale).toBe(true);
    expect(s.shown).toBe(fakeRun);
    expect(s.runId).toBe(0);
    const view = wardsEditorErrors(s);
    expect(view.label).toBe('stale: wards.yaml has errors');
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.messages.length).toBeLessThanOrEqual(50);
    expect(view.lines.every((n) => n >= 1)).toBe(true);

    const fixed = apply(apply(s, { type: 'edit', text: DEFAULT_WARDS_TEXT }).state, { type: 'debounceElapsed' });
    expect(fixed.state.stale).toBe(false);
    expect(fixed.state.runId).toBe(1);
    expect(fixed.effects).toHaveLength(1);
    expect(fixed.effects[0]).toMatchObject({ type: 'runPlayground', runId: 1 });
    expect(wardsEditorErrors(fixed.state).messages).toEqual([]);
  });

  it('shows input-too-large for text above 262,144 bytes', () => {
    const big = '#'.repeat(262_145);
    const s = apply(apply(initialWardsEditorState(), { type: 'edit', text: big }).state, { type: 'debounceElapsed' }).state;
    expect(s.stale).toBe(true);
    expect(wardsEditorErrors(s).messages[0]).toContain('input-too-large');
  });

  it('escapes hidden code points in error strings', () => {
    const s = apply(
      apply(initialWardsEditorState(), { type: 'edit', text: 'wards:\n  - id: a\u200Bb\n' }).state,
      { type: 'debounceElapsed' },
    ).state;
    for (const m of wardsEditorErrors(s).messages) expect(m).not.toContain('\u200B');
  });

  it('caps the shown errors at 50', () => {
    const many = 'wards:\n' + Array.from({ length: 80 }, () => '  - kind: nope\n').join('');
    const s = apply(apply(initialWardsEditorState(), { type: 'edit', text: many }).state, { type: 'debounceElapsed' }).state;
    expect(wardsEditorErrors(s).messages.length).toBeLessThanOrEqual(50);
  });

  it('applies runFinished only for the latest run id', () => {
    let s = apply(apply(initialWardsEditorState(), { type: 'edit', text: DEFAULT_WARDS_TEXT }).state, { type: 'debounceElapsed' }).state;
    s = apply(apply(s, { type: 'edit', text: DEFAULT_WARDS_TEXT + '\n' }).state, { type: 'debounceElapsed' }).state;
    expect(s.runId).toBe(2);
    expect(apply(s, { type: 'runFinished', runId: 1, run: fakeRun }).state.shown).toBeUndefined();
    expect(apply(s, { type: 'runFinished', runId: 2, run: fakeRun }).state.shown).toBe(fakeRun);
  });

  it('reset restores the bundled text and requests a run', () => {
    const edited = apply(initialWardsEditorState(), { type: 'edit', text: BAD }).state;
    const step = apply(edited, { type: 'reset' });
    expect(step.state.text).toBe(DEFAULT_WARDS_TEXT);
    expect(step.state.stale).toBe(false);
    expect(step.effects.map((e) => e.type)).toEqual(['cancelDebounce', 'runPlayground']);
  });
});

describe('wards editor shell with a manual TimerPort', () => {
  it('debounces edits: a new edit cancels the timer and only the last text runs', async () => {
    const timers = new ManualTimers();
    const requested: number[] = [];
    const shell = createWardsEditorShell({
      timers,
      runPlayground: (runId) => {
        requested.push(runId);
        return Promise.resolve(fakeRun);
      },
    });
    shell.dispatch({ type: 'edit', text: BAD });
    shell.dispatch({ type: 'edit', text: DEFAULT_WARDS_TEXT });
    expect(timers.pending.size).toBe(1);
    expect([...timers.pending.values()][0]?.ms).toBe(300);
    expect(requested).toEqual([]);
    timers.fireAll();
    expect(requested).toEqual([1]);
    await Promise.resolve();
    await Promise.resolve();
    expect(shell.getState().shown).toBe(fakeRun);
  });
});
