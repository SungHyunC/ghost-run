import { useState } from 'react';
import type { WorldId } from '../../config';

/** Slider limits. The values equal `WORLD_CONFIG.actionRanges` of the drawer-arm world; a test compares them with that file. */
export const SLIDERS = {
  speed: { min: 0.05, max: 0.6, step: 0.05 },
  force: { min: 2, max: 40, step: 1 },
  distance: { min: 0.02, max: 0.25, step: 0.01 },
} as const;

/** The input limit in code points (Requirement 9, criterion 1). */
export const PLAN_MAX_LENGTH = 256;

export interface PlanSliders {
  speed: number;
  force: number;
  distance: number;
}

export interface PresetButton {
  id: string;
  label: string;
}

export interface PlanBoxProps {
  world: WorldId;
  /** The text shown in the input (Shell and Cloud). */
  text: string;
  /** The slider values shown (Hand). */
  sliders: PlanSliders;
  /** True while a Fixed_Plan is shown in the box: the tag shows. */
  rev: boolean;
  /** True while a run is animating. The text box is then read-only until the visitor clicks or focuses it. */
  animating?: boolean;
  busy: boolean;
  presets: readonly PresetButton[];
  /** The id of the Preset whose input equals the box, or null. */
  activeId: string | null;
  onText: (text: string) => void;
  onSliders: (values: PlanSliders) => void;
  onRun: () => void;
  onPreset: (id: string) => void;
}

const speedText = (v: number) => `${v.toFixed(2)} m/s`;
const forceText = (v: number) => `${String(Math.round(v))} N`;
const distText = (v: number) => `${v.toFixed(2)} m`;

/** The label, the plan box, and the presets row. Render inside the control card. */
export function PlanBox({
  world,
  text,
  sliders,
  animating = false,
  busy,
  presets,
  activeId,
  onText,
  onSliders,
  onRun,
  onPreset,
}: PlanBoxProps) {
  const hand = world === 'hand';
  // A click or focus makes the box editable at any time; a new run locks it again.
  const [unlocked, setUnlocked] = useState(false);
  const [wasAnimating, setWasAnimating] = useState(animating);
  if (wasAnimating !== animating) {
    setWasAnimating(animating);
    setUnlocked(false);
  }
  const unlock = () => {
    setUnlocked(true);
  };
  const set = (key: keyof PlanSliders) => (value: string) => {
    const n = Number(value);
    if (Number.isFinite(n)) onSliders({ ...sliders, [key]: n });
  };
  return (
    <>
      <div className="plan-l">
        Agent's plan <span className="rev-tag" id="rev">fixed by the agent</span>
      </div>
      <div className="planbox" data-kind={hand ? 'sliders' : 'cmd'} id="planbox">
        <span className="pr" aria-hidden="true">
          $
        </span>
        <input
          className="cmd"
          id="cmd"
          spellCheck={false}
          aria-label="Agent's plan"
          maxLength={PLAN_MAX_LENGTH}
          value={hand ? '' : text}
          readOnly={animating && !unlocked}
          hidden={hand}
          onPointerDown={unlock}
          onFocus={unlock}
          onChange={(e) => {
            onText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) {
              e.preventDefault();
              onRun();
            }
          }}
        />
        <div className="sl" id="sliders" hidden={!hand}>
          <label>
            <span id="l-speed">Pull speed</span>
            <b id="v-speed">{speedText(sliders.speed)}</b>
            <input
              type="range"
              id="s-speed"
              aria-labelledby="l-speed"
              aria-valuetext={`${sliders.speed.toFixed(2)} metres per second`}
              {...SLIDERS.speed}
              value={sliders.speed}
              onChange={(e) => {
                set('speed')(e.target.value);
              }}
            />
          </label>
          <label>
            <span id="l-force">Grip force</span>
            <b id="v-force">{forceText(sliders.force)}</b>
            <input
              type="range"
              id="s-force"
              aria-labelledby="l-force"
              aria-valuetext={`${String(Math.round(sliders.force))} newtons`}
              {...SLIDERS.force}
              value={sliders.force}
              onChange={(e) => {
                set('force')(e.target.value);
              }}
            />
          </label>
          <label>
            <span id="l-dist">Pull distance</span>
            <b id="v-dist">{distText(sliders.distance)}</b>
            <input
              type="range"
              id="s-dist"
              aria-labelledby="l-dist"
              aria-valuetext={`${sliders.distance.toFixed(2)} metres`}
              {...SLIDERS.distance}
              value={sliders.distance}
              onChange={(e) => {
                set('distance')(e.target.value);
              }}
            />
          </label>
        </div>
        <button type="button" className="runbtn" id="runbtn" disabled={busy} aria-busy={busy} onClick={onRun}>
          {hand ? '▶ Run 8 ghosts' : '▶ Run ghost'}
        </button>
      </div>
      <div className="presets" id="presets">
        <span>Try:</span>
        {presets.map((p) => (
          <button
            type="button"
            data-id={p.id}
            className={p.id === activeId ? 'on' : undefined}
            key={p.id}
            onClick={() => {
              onPreset(p.id);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
}
