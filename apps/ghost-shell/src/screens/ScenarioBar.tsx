import { SCENARIOS } from '../scenarios/scenarios';
import type { PageAction, PageState } from '../state/reducer';
import { APPLY_FIXED_PLAN_LABEL, RUN_GHOST_LABEL } from '../texts';
import { FIXED_PLAN_HINT, SCENARIOS_INTRO, SCENARIO_CARDS, SELECTED_TEXT, STEP_PICK_LABEL } from '../page-texts';
import { escapeForDisplay } from '../ui-imports';
import { GhostMark } from './GhostMark';

export interface ScenarioBarProps {
  readonly state: PageState;
  readonly dispatch: (action: PageAction) => void;
}

export function ScenarioBar({ state, dispatch }: ScenarioBarProps) {
  const selected = SCENARIOS.find((s) => s.id === state.selected);
  const canApplyFixed = selected?.fixedPlan !== undefined;
  return (
    <section className="gk-section gs-pick" aria-labelledby="gs-scenarios-h">
      <div className="gs-section-head">
        <p className="gs-step">{STEP_PICK_LABEL}</p>
        <h2 id="gs-scenarios-h" className="gk-heading">
          Scenarios
        </h2>
        <p className="gs-section-intro">{SCENARIOS_INTRO}</p>
      </div>
      <div role="group" aria-label="Scenario selector" className="gs-cards">
        {SCENARIOS.map((s) => {
          const card = SCENARIO_CARDS[s.id];
          const pressed = state.selected === s.id;
          const title = escapeForDisplay(s.title);
          return (
            <button
              key={s.id}
              type="button"
              className="gk-button gs-card"
              aria-pressed={pressed}
              aria-label={`${s.id}. ${title}`}
              aria-describedby={`gs-card-${s.id}-d`}
              onClick={() => {
                dispatch({ type: 'selectScenario', id: s.id });
              }}
            >
              <span className="gs-card-top" aria-hidden="true">
                <span className="gs-card-num">{`0${s.id}`}</span>
                <span className="gs-card-tag">{card.tag}</span>
              </span>
              <span className="gs-card-title" aria-hidden="true">
                {title}
              </span>
              <span className="gs-card-blurb" id={`gs-card-${s.id}-d`}>
                {card.blurb}
              </span>
              <span className="gs-card-cmd gs-mono" aria-hidden="true">
                {escapeForDisplay(s.plan[0]?.command ?? '')}
              </span>
              {pressed ? (
                <span className="gs-card-picked" aria-hidden="true">
                  {SELECTED_TEXT}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="gs-run-actions">
        <button
          type="button"
          className="gk-button gs-btn-primary"
          onClick={() => {
            dispatch({ type: 'runGhost' });
          }}
        >
          <GhostMark className="gs-btn-mark" />
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
        <p className="gs-hint">{FIXED_PLAN_HINT}</p>
      </div>
    </section>
  );
}
