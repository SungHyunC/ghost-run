import { SCENARIOS } from '../scenarios/scenarios';
import type { PageAction, PageState } from '../state/reducer';
import { useStrings } from '../i18n/context';
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
  const t = useStrings();
  const titleOf = (id: 1 | 2 | 3 | 4 | 5, fallback: string): string => t.scenarioTitles?.[id] ?? escapeForDisplay(fallback);
  return (
    <section className="gk-section gs-pick" aria-labelledby="gs-scenarios-h">
      <div className="gs-pick-head">
        <div>
          <p className="gs-step">{t.stepPick}</p>
          <h2 id="gs-scenarios-h" className="gk-heading">
            {t.scenariosHeading}
          </h2>
          <p className="gs-section-intro">{t.scenariosHint}</p>
        </div>
      </div>
      <div role="group" aria-label={t.scenarioSelector} className="gs-cards">
        {SCENARIOS.map((s) => {
          const card = t.scenarioCards[s.id];
          const pressed = state.selected === s.id;
          const title = titleOf(s.id, s.title);
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
                  {t.selected}
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
          {t.runGhost}
        </button>
        <button
          type="button"
          className="gk-button"
          disabled={!canApplyFixed}
          onClick={() => {
            dispatch({ type: 'applyFixedPlan' });
          }}
        >
          {t.applyFixedPlan}
        </button>
      </div>
      <div className="gs-pick-foot">
        <p className="gs-picked-line" aria-hidden="true">
          {selected === undefined ? (
            t.scenariosIntro
          ) : (
            <>
              <strong>{titleOf(selected.id, selected.title)}</strong>
              {`: ${t.scenarioCards[selected.id].blurb}`}
            </>
          )}
        </p>
        <p className="gs-hint">{t.fixedPlanHint}</p>
      </div>
    </section>
  );
}
