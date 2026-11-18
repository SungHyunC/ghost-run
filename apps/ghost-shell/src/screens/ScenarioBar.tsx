import { SCENARIOS } from '../scenarios/scenarios';
import type { PageAction, PageState } from '../state/reducer';
import { APPLY_FIXED_PLAN_LABEL, RUN_GHOST_LABEL } from '../texts';
import { escapeForDisplay } from '../ui-imports';

export interface ScenarioBarProps {
  readonly state: PageState;
  readonly dispatch: (action: PageAction) => void;
}

export function ScenarioBar({ state, dispatch }: ScenarioBarProps) {
  const selected = SCENARIOS.find((s) => s.id === state.selected);
  const canApplyFixed = selected?.fixedPlan !== undefined;
  return (
    <section className="gk-section" aria-labelledby="gs-scenarios-h">
      <h2 id="gs-scenarios-h" className="gk-heading">Scenarios</h2>
      <div role="group" aria-label="Scenario selector" className="gs-scenarios">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="gk-button gs-scenario"
            aria-pressed={state.selected === s.id}
            onClick={() => {
              dispatch({ type: 'selectScenario', id: s.id });
            }}
          >
            {`${s.id}. ${escapeForDisplay(s.title)}`}
          </button>
        ))}
      </div>
      <div className="gs-actions">
        <button
          type="button"
          className="gk-button"
          onClick={() => {
            dispatch({ type: 'runGhost' });
          }}
        >
          {RUN_GHOST_LABEL}
        </button>
        <button
          type="button"
          className="gk-button"
          disabled={!canApplyFixed}
          onClick={() => {
            dispatch({ type: 'applyFixedPlan' });
          }}
        >
          {APPLY_FIXED_PLAN_LABEL}
        </button>
      </div>
    </section>
  );
}
