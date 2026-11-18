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
    <section aria-labelledby="gs-scenarios-h">
      <h2 id="gs-scenarios-h">Scenarios</h2>
      <div role="group" aria-label="Scenario selector">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={state.selected === s.id}
            onClick={() => {
              dispatch({ type: 'selectScenario', id: s.id });
            }}
          >
            {`${s.id}. ${escapeForDisplay(s.title)}`}
          </button>
        ))}
      </div>
      <div>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'runGhost' });
          }}
        >
          {RUN_GHOST_LABEL}
        </button>
        <button
          type="button"
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
