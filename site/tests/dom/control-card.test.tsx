import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldId } from '../../src/config';
import { ControlCard } from '../../src/components/walk/ControlCard';
import { PlanBox, PLAN_MAX_LENGTH, type PlanBoxProps } from '../../src/components/walk/PlanBox';

afterEach(cleanup);

const PRESETS = [
  { id: 'a', label: 'first' },
  { id: 'b', label: 'second' },
  { id: 'c', label: 'third' },
];
const SLIDERS = { speed: 0.6, force: 20, distance: 0.2 };

function box(over: Partial<PlanBoxProps> = {}): PlanBoxProps {
  return {
    world: 'shell',
    text: 'npm test',
    sliders: SLIDERS,
    rev: false,
    busy: false,
    presets: PRESETS,
    activeId: 'a',
    onText: vi.fn(),
    onSliders: vi.fn(),
    onRun: vi.fn(),
    onPreset: vi.fn(),
    ...over,
  };
}

function Card({ initial = 'shell', onPick }: { initial?: WorldId; onPick?: (w: WorldId) => void }) {
  const [world, setWorld] = useState<WorldId>(initial);
  return (
    <ControlCard
      world={world}
      onPick={(w) => {
        setWorld(w);
        onPick?.(w);
      }}
      onReplay={() => undefined}
    />
  );
}

describe('ControlCard tabs', () => {
  it('is a tablist named World with three tabs, aria-selected on the chosen one only, and aria-controls', () => {
    render(<Card initial="hand" />);
    expect(screen.getByRole('tablist', { name: 'World' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Ghost Shell', 'Ghost Hand', 'Ghost Cloud']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.every((t) => t.getAttribute('aria-controls') === 'planbox')).toBe(true);
    expect(tabs.every((t) => t.querySelector('svg')?.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('uses a roving tabindex and moves focus with the arrow keys, Home, and End (wrapping)', () => {
    render(<Card />);
    const [shell, hand, cloud] = screen.getAllByRole('tab') as HTMLElement[];
    expect([shell, hand, cloud].map((t) => t?.tabIndex)).toEqual([0, -1, -1]);
    shell?.focus();
    fireEvent.keyDown(shell as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(hand);
    expect([shell, hand, cloud].map((t) => t?.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(hand as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cloud);
    fireEvent.keyDown(cloud as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(shell);
    fireEvent.keyDown(shell as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cloud);
    fireEvent.keyDown(cloud as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(shell);
    fireEvent.keyDown(shell as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(cloud);
  });

  it('moving focus does not select; pressing the tab selects it and moves the roving stop', () => {
    const onPick = vi.fn();
    render(<Card onPick={onPick} />);
    const [shell, hand] = screen.getAllByRole('tab') as HTMLElement[];
    shell?.focus();
    fireEvent.keyDown(shell as HTMLElement, { key: 'ArrowRight' });
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(hand as HTMLElement);
    expect(onPick).toHaveBeenCalledWith('hand');
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  });

  it('has a Replay button that calls onReplay, and the rev class follows the prop', () => {
    const onReplay = vi.fn();
    const { container, rerender } = render(<ControlCard world="shell" onPick={() => undefined} onReplay={onReplay} />);
    fireEvent.click(screen.getByRole('button', { name: '↻ Replay' }));
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.ctl')?.classList.contains('rev')).toBe(false);
    rerender(<ControlCard world="shell" onPick={() => undefined} onReplay={onReplay} rev />);
    expect(container.querySelector('.ctl')?.classList.contains('rev')).toBe(true);
  });
});

describe('PlanBox text worlds', () => {
  it('has the prompt, a named input with spellcheck off and maxLength 256, and the Run button', () => {
    const { container } = render(<PlanBox {...box()} />);
    const input = screen.getByRole('textbox', { name: "Agent's plan" }) as HTMLInputElement;
    expect(input.value).toBe('npm test');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.maxLength).toBe(256);
    expect(PLAN_MAX_LENGTH).toBe(256);
    expect(container.querySelector('.pr')?.textContent).toBe('$');
    expect(container.querySelector('#planbox')?.getAttribute('data-kind')).toBe('cmd');
    expect(screen.getByRole('button', { name: '▶ Run ghost' })).toBeTruthy();
    expect((container.querySelector('#sliders') as HTMLElement).hidden).toBe(true);
  });

  it('reports typed text and runs the plan on Enter', () => {
    const p = box();
    render(<PlanBox {...p} />);
    const input = screen.getByRole('textbox', { name: "Agent's plan" });
    fireEvent.change(input, { target: { value: 'ls' } });
    expect(p.onText).toHaveBeenCalledWith('ls');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onRun).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '▶ Run ghost' }));
    expect(p.onRun).toHaveBeenCalledTimes(2);
  });

  it('is busy while a run is in progress: Run disabled with aria-busy, no run on Enter, presets stay usable', () => {
    const p = box({ busy: true });
    render(<PlanBox {...p} />);
    const run = screen.getByRole('button', { name: '▶ Run ghost' }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(run.getAttribute('aria-busy')).toBe('true');
    fireEvent.keyDown(screen.getByRole('textbox', { name: "Agent's plan" }), { key: 'Enter' });
    expect(p.onRun).not.toHaveBeenCalled();
    const preset = screen.getByRole('button', { name: 'second' }) as HTMLButtonElement;
    expect(preset.disabled).toBe(false);
    fireEvent.click(preset);
    expect(p.onPreset).toHaveBeenCalledWith('b');
  });

  it('is not busy by default: aria-busy is false', () => {
    render(<PlanBox {...box()} />);
    expect(screen.getByRole('button', { name: '▶ Run ghost' }).getAttribute('aria-busy')).toBe('false');
  });

  it('shows the tag state and the fixed text while a Fixed_Plan is shown', () => {
    const { container } = render(
      <ControlCard world="shell" onPick={() => undefined} onReplay={() => undefined} rev>
        <PlanBox {...box({ rev: true, text: 'fixed plan' })} />
      </ControlCard>,
    );
    const input = screen.getByRole('textbox', { name: "Agent's plan" }) as HTMLInputElement;
    expect(input.value).toBe('fixed plan');
    expect(container.querySelector('.plan-l .rev-tag')?.textContent).toBe('fixed by the agent');
    expect(container.querySelector('.ctl.rev .planbox')).not.toBeNull();
  });

  it('is editable whenever no run is animating, including right after a Fixed_Plan was shown', () => {
    const p = box({ rev: true, text: 'fixed plan' });
    render(<PlanBox {...p} />);
    const input = screen.getByRole('textbox', { name: "Agent's plan" }) as HTMLInputElement;
    expect(input.readOnly).toBe(false);
    fireEvent.change(input, { target: { value: 'ls' } });
    expect(p.onText).toHaveBeenCalledWith('ls');
  });

  it('is read-only while a run animates, and a click or a focus makes it editable at once', () => {
    const { rerender } = render(<PlanBox {...box({ animating: true })} />);
    const input = screen.getByRole('textbox', { name: "Agent's plan" }) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    fireEvent.pointerDown(input);
    expect(input.readOnly).toBe(false);
    // A new run locks it again; a focus unlocks it too.
    rerender(<PlanBox {...box({ animating: false })} />);
    rerender(<PlanBox {...box({ animating: true })} />);
    expect(input.readOnly).toBe(true);
    fireEvent.focus(input);
    expect(input.readOnly).toBe(false);
  });
});

describe('presets row', () => {
  it('reads "Try:" then the Presets, and only the active one carries the class on', () => {
    const { container, rerender } = render(<PlanBox {...box({ activeId: 'b' })} />);
    const row = container.querySelector('#presets') as HTMLElement;
    expect(row.querySelector('span')?.textContent).toBe('Try:');
    const buttons = [...row.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['first', 'second', 'third']);
    expect(buttons.map((b) => b.classList.contains('on'))).toEqual([false, true, false]);
    rerender(<PlanBox {...box({ activeId: null })} />);
    expect(container.querySelectorAll('#presets button.on')).toHaveLength(0);
  });

  it('calls onPreset with the id of the pressed Preset', () => {
    const p = box();
    render(<PlanBox {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'third' }));
    expect(p.onPreset).toHaveBeenCalledWith('c');
  });
});

/** The ranges of the drawer-arm world, read from the world file text. */
function worldRanges(): Record<'speed' | 'force' | 'distance', [number, number]> {
  const text = readFileSync(join(import.meta.dirname, '..', '..', '..', 'worlds', 'drawer-arm', 'src', 'world-config.ts'), 'utf8');
  const read = (key: string): [number, number] => {
    const m = new RegExp(`${key}:\\s*\\[\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\]`).exec(text);
    if (m === null) throw new Error(`world-config.ts has no ${key} range`);
    return [Number(m[1]), Number(m[2])];
  };
  return { speed: read('speed'), force: read('force'), distance: read('distance') };
}

describe('PlanBox sliders (Ghost Hand)', () => {
  it('has three labelled sliders in order with min and max equal to WORLD_CONFIG.actionRanges and the specified steps', () => {
    const { container } = render(<PlanBox {...box({ world: 'hand' })} />);
    const ranges = worldRanges();
    const sliders = [
      screen.getByRole('slider', { name: 'Pull speed' }),
      screen.getByRole('slider', { name: 'Grip force' }),
      screen.getByRole('slider', { name: 'Pull distance' }),
    ] as HTMLInputElement[];
    expect([...container.querySelectorAll('#sliders input')]).toEqual(sliders);
    const keys = ['speed', 'force', 'distance'] as const;
    sliders.forEach((s, i) => {
      const r = ranges[keys[i] as 'speed'];
      expect([Number(s.min), Number(s.max)]).toEqual(r);
    });
    expect(sliders.map((s) => Number(s.step))).toEqual([0.05, 1, 0.01]);
    expect(container.querySelector('#planbox')?.getAttribute('data-kind')).toBe('sliders');
    expect((container.querySelector('#sliders') as HTMLElement).hidden).toBe(false);
    expect(screen.getByRole('button', { name: '▶ Run 8 ghosts' })).toBeTruthy();
  });

  it('shows the values with their units and sets aria-valuetext', () => {
    const { container } = render(<PlanBox {...box({ world: 'hand' })} />);
    expect(container.querySelector('#v-speed')?.textContent).toBe('0.60 m/s');
    expect(container.querySelector('#v-force')?.textContent).toBe('20 N');
    expect(container.querySelector('#v-dist')?.textContent).toBe('0.20 m');
    expect(screen.getByRole('slider', { name: 'Pull speed' }).getAttribute('aria-valuetext')).toBe('0.60 metres per second');
    expect(screen.getByRole('slider', { name: 'Grip force' }).getAttribute('aria-valuetext')).toBe('20 newtons');
    expect(screen.getByRole('slider', { name: 'Pull distance' }).getAttribute('aria-valuetext')).toBe('0.20 metres');
  });

  it('reports a moved slider with the other two values kept', () => {
    const p = box({ world: 'hand' });
    render(<PlanBox {...p} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Grip force' }), { target: { value: '33' } });
    expect(p.onSliders).toHaveBeenCalledWith({ speed: 0.6, force: 33, distance: 0.2 });
  });

  it('keeps the sliders enabled while a Fixed_Plan is shown, so a visitor can set their own values', () => {
    render(<PlanBox {...box({ world: 'hand', rev: true })} />);
    for (const name of ['Pull speed', 'Grip force', 'Pull distance']) {
      expect((screen.getByRole('slider', { name }) as HTMLInputElement).disabled).toBe(false);
    }
  });
});

describe('hit areas', () => {
  it('gives every control class of the card a 24 by 24 px minimum in the section CSS', () => {
    const css = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'styles', '05-walkthrough.css'), 'utf8');
    const rule = /([^{}]+)\{min-width:24px;min-height:24px\}/.exec(css);
    expect(rule).not.toBeNull();
    const selectors = (rule?.[1] ?? '').split(',').map((s) => s.trim());
    for (const cls of ['.tab', '.ghostbtn', '.runbtn', '.presets button', '.stepper button']) {
      expect(selectors).toContain(cls);
    }
    expect(css).toMatch(/\.sl input\{min-height:24px\}/);
  });
});
