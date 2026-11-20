// The rail of the theater: the two scenarios as cards, Play demo, Run ghost, and the seed.
// The scenario buttons keep their plain labels as accessible names ('fast pull', 'slow pull, gentle grip').
import { useId } from 'react';
import {
  PLAY_DEMO_LABEL,
  RAIL_HINT,
  RUN_GHOST_LABEL,
  SCENARIOS_LABEL,
  SCENARIO_NOTES,
  STEP_PICK_LABEL,
} from '../ui-text';
import { GhostMark } from './GhostMark';
import { SeedInput } from './SeedInput';
import type { SeedInputProps } from './SeedInput';

export interface ScenarioRailProps {
  readonly scenarios: readonly { readonly id: string; readonly label: string }[];
  /** Id of the scenario whose plan is loaded, if the loaded plan is one of them. */
  readonly selectedId: string | null;
  readonly onLoadScenario: (id: string) => void;
  readonly onPlayDemo: () => void;
  readonly canPlayDemo: boolean;
  readonly demoActive: boolean;
  /** Current demo step text; null when no demo ran. */
  readonly demoStatus: string | null;
  readonly canRun: boolean;
  readonly busy: boolean;
  readonly onRun: () => void;
  readonly seed: Omit<SeedInputProps, 'disabled'>;
}

function ScenarioIcon({ id }: { readonly id: string }) {
  return (
    <svg className="gh-sico" viewBox="-16 -16 32 32" aria-hidden="true" focusable="false">
      {id === 'fast-pull' ? (
        <>
          <path d="M-2 -13 L-9 2 H-1 L-4 13 L9 -4 H1 L4 -13 Z" />
        </>
      ) : (
        <>
          <path d="M-11 9 C-11 -3 -3 -11 10 -12 C9 1 1 9 -11 9 Z" />
          <path d="M-11 9 L3 -5" className="gh-sico-accent" />
        </>
      )}
    </svg>
  );
}

export function ScenarioRail(props: ScenarioRailProps) {
  const headingId = useId();
  const { busy, demoActive } = props;
  return (
    <div className="gh-rail">
      <div className="gh-rail-head">
        <p className="gh-step">{STEP_PICK_LABEL}</p>
        <h2 className="gk-heading" id={headingId}>
          {SCENARIOS_LABEL}
        </h2>
        <p className="gh-rail-hint">{RAIL_HINT}</p>
      </div>
      <div className="gh-cards" role="group" aria-label={SCENARIOS_LABEL}>
        {props.scenarios.map((s) => {
          const picked = props.selectedId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className="gk-button gh-card"
              data-scenario={s.id}
              data-picked={picked}
              aria-label={s.label}
              disabled={busy || demoActive}
              onClick={() => {
                props.onLoadScenario(s.id);
              }}
            >
              <span className="gh-card-icon" aria-hidden="true">
                <ScenarioIcon id={s.id} />
              </span>
              <span className="gh-card-text">
                <span className="gh-card-title">{s.label}</span>
                <span className="gh-card-note">{SCENARIO_NOTES[s.id] ?? ''}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="gh-rail-actions">
        <button
          type="button"
          className="gk-button gh-btn-primary"
          disabled={!props.canPlayDemo || busy || demoActive}
          onClick={props.onPlayDemo}
        >
          <GhostMark className="gh-btn-mark" />
          {PLAY_DEMO_LABEL}
        </button>
        <button type="button" className="gk-button" disabled={!props.canRun || busy} onClick={props.onRun}>
          {RUN_GHOST_LABEL}
        </button>
      </div>
      {props.demoStatus !== null ? (
        <p role="status" className="gh-demo-status">
          {props.demoStatus}
        </p>
      ) : null}
      <SeedInput {...props.seed} disabled={busy} />
    </div>
  );
}
