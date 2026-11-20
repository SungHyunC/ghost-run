import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Costumes } from '../../src/components/Costumes';
import type { Scheduler } from '../../src/engine/scheduler';

interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

function fakeScheduler() {
  let now = 0;
  let next = 1;
  let timers: Timer[] = [];
  const scheduler: Scheduler = {
    setTimeout(fn, ms) {
      const id = next++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers = timers.filter((t) => t.id !== id);
    },
  };
  return {
    scheduler,
    pending: () => timers.length,
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        now = due.at;
        act(() => {
          due.fn();
        });
      }
      now = target;
    },
  };
}

function setReduced(value: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: value,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

function setup() {
  const clock = fakeScheduler();
  const view = render(<Costumes lineCount={800} scheduler={clock.scheduler} />);
  const sw = view.container.querySelector<HTMLInputElement>('input#xray');
  const sec = view.container.querySelector('section#costumes');
  if (!sw || !sec) throw new Error('missing switch or section');
  return { clock, view, sw, sec };
}

describe('X-ray switch', () => {
  it('is a checkbox switch with the stated name, label, and hint', () => {
    const { sw, view } = setup();
    expect(sw.type).toBe('checkbox');
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-label')).toBe('X-ray: show the skeleton inside each app');
    expect(view.container.querySelector('label.xsw')?.textContent).toContain('X-ray');
    expect(view.container.querySelector('.try')?.textContent).toBe('try me');
  });

  it('keeps aria-checked, the checkbox, and the section class in step both ways', () => {
    const { sw, sec } = setup();
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sec.classList.contains('xray')).toBe(false);
    fireEvent.click(sw);
    expect(sw.checked).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sec.classList.contains('xray')).toBe(true);
    fireEvent.click(sw);
    expect(sw.checked).toBe(false);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sec.classList.contains('xray')).toBe(false);
  });

  it('shows the badge on each card', () => {
    const { view } = setup();
    const badges = [...view.container.querySelectorAll('.cc .same')];
    expect(badges).toHaveLength(3);
    badges.forEach((b) => {
      expect(b.textContent).toBe('same skeleton ✓');
    });
  });
});

describe('X-ray demo', () => {
  it('turns on at 1600 ms and off at 4400 ms, once', () => {
    setReduced(false);
    const { clock, sw, sec } = setup();
    clock.advance(1599);
    expect(sw.checked).toBe(false);
    clock.advance(1);
    expect(sw.checked).toBe(true);
    expect(sec.classList.contains('xray')).toBe(true);
    clock.advance(2799);
    expect(sw.checked).toBe(true);
    clock.advance(1);
    expect(sw.checked).toBe(false);
    clock.advance(20000);
    expect(sw.checked).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('is cancelled by operating the switch before 4400 ms', () => {
    setReduced(false);
    const { clock, sw } = setup();
    clock.advance(2000);
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    expect(sw.checked).toBe(false);
    expect(clock.pending()).toBe(0);
    clock.advance(10000);
    expect(sw.checked).toBe(false);
  });

  it('is cancelled by the first user input anywhere', () => {
    setReduced(false);
    const { clock, sw } = setup();
    fireEvent.pointerDown(document.body);
    expect(clock.pending()).toBe(0);
    clock.advance(10000);
    expect(sw.checked).toBe(false);
  });

  it('leaves the switch alone under Reduced_Motion', () => {
    setReduced(true);
    const { clock, sw } = setup();
    expect(clock.pending()).toBe(0);
    clock.advance(10000);
    expect(sw.checked).toBe(false);
  });

  it('leaves no timer after unmount', () => {
    setReduced(false);
    const { clock, view } = setup();
    expect(clock.pending()).toBe(2);
    view.unmount();
    expect(clock.pending()).toBe(0);
  });
});
