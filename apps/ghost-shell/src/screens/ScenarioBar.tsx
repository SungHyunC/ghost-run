import { SCENARIOS } from '../scenarios/scenarios';
import type { PageAction, PageState } from '../state/reducer';
import { APPLY_FIXED_PLAN_LABEL, RUN_GHOST_LABEL } from '../texts';
import {
  FIXED_PLAN_HINT,
  SCENARIOS_HEADING_HINT,
  SCENARIOS_INTRO,
  SCENARIO_CARDS,
  SELECTED_TEXT,
  STEP_PICK_LABEL,
} from '../page-texts';
import { escapeForDisplay } from '../ui-imports';
import { GhostMark } from './GhostMark';
import { ScenarioIcon } from './ScenarioIcon';

export interface ScenarioBarProps {
  readonly state: PageState;
  readonly dispatch: (action: PageAction) => void;
}

export function ScenarioBar({ state, dispatch }: ScenarioBarProps) {
  const selected = SCENARIOS.find((s) => s.id === state.selected);
  const canApplyFixed = selected?.fixedPlan !== undefined;
  return (
    <section className="gk-section gs-pick" aria-labelledby="gs-scenarios-h">
      <div className="gs-pick-head">
        <div>
          <p className="gs-step">{STEP_PICK_LABEL}</p>
          <h2 id="gs-scenarios-h" className="gk-heading">
            Scenarios
          </h2>
          <p className="gs-section-intro">{SCENARIOS_HEADING_HINT}</p>
        </div>
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
              data-scenario={s.id}
              aria-pressed={pressed}
              aria-label={`${s.id}. ${title}`}
              aria-describedby={`gs-card-${s.id}-d`}
              onClick={() => {
                dispatch({ type: 'selectScenario', id: s.id });
              }}
            >
              <span className="gs-card-top" aria-hidden="true">
                <span className="gs-card-icon">
                  <ScenarioIcon id={s.id} />
                </span>
                <span className="gs-card-meta">
                  <span className="gs-card-num">{`0${s.id}`}</span>
                  <span className="gs-card-tag">{card.tag}</span>
                </span>
              </span>
              <span className="gs-card-title" aria-hidden="true">
                {title}
              </span>
              <span className="gs-card-cmd gs-mono" aria-hidden="true">
                {escapeForDisplay(s.plan[0]?.command ?? '')}
              </span>
              <span className="gk-sr-only" id={`gs-card-${s.id}-d`}>
                {card.blurb}
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
      </div>
      <div className="gs-pick-foot">
        <p className="gs-picked-line" aria-hidden="true">
          {selected === undefined ? (
            SCENARIOS_INTRO
          ) : (
            <>
              <strong>{escapeForDisplay(selected.title)}</strong>
              {`: ${SCENARIO_CARDS[selected.id].blurb}`}
            </>
          )}
        </p>
        <p className="gs-hint">{FIXED_PLAN_HINT}</p>
      </div>
    </section>
  );
}
