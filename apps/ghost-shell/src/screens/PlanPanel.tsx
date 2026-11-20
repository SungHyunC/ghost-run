import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { PlaygroundRun } from '../pipeline/run-playground';
import type { StepView } from '../pipeline/steps';
import type { PageAction, PageState } from '../state/reducer';
import { useStrings } from '../i18n/context';
import { escapeForDisplay } from '../ui-imports';

export interface PlanPanelProps {
  readonly state: PageState;
  readonly dispatch: (action: PageAction) => PageState | void;
}

/** The step records of the shown run, only while they still describe the current plan. */
function stepsFor(state: PageState, run: PlaygroundRun | undefined): readonly StepView[] | undefined {
  if (run === undefined || run.steps.length !== state.plan.length) return undefined;
  return run.steps.every((s, i) => s.command === state.plan[i]?.command) ? run.steps : undefined;
}

function StepStatus({ step }: { readonly step: StepView }) {
  const t = useStrings();
  let icon = '\u2713';
  let text = `exit ${step.exitCode}`;
  if (step.unsupported) {
    icon = '\u26A0';
    text = `${t.markerUnsupported} (exit ${step.exitCode})`;
  } else if (step.watchdog) {
    icon = '\u23F1';
    text = `${t.markerWatchdog} (exit ${step.exitCode})`;
  } else if (step.exitCode !== 0) {
    icon = '\u2716';
    text = `${t.markerFailed} (exit ${step.exitCode})`;
  }
  return (
    <span data-step-status>
      <span aria-hidden="true">{icon}</span> {text}
    </span>
  );
}

export function PlanPanel({ state, dispatch }: PlanPanelProps) {
  const [command, setCommand] = useState('');
  const t = useStrings();
  const steps = stepsFor(state, state.run);
  const { meta } = state;

  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    // The file is read in the page and never uploaded.
    void file.text().then((text) => {
      dispatch({ type: 'loadPlanFile', text });
    });
    input.value = '';
  };

  return (
    <section className="gk-section gs-plan" aria-labelledby="gs-plan-h">
      <h2 id="gs-plan-h" className="gk-heading">{t.planHeading}</h2>
      <div className="gs-meta">
        <p>
          {t.planName} <span data-plan-name>{escapeForDisplay(meta.name)}</span>
        </p>
        <p>{meta.origin === 'recorded' ? t.recordedPlan : t.scriptedPlan}</p>
        {meta.note === undefined ? null : (
          <p>
            {t.planNote} <span data-plan-note>{escapeForDisplay(meta.note)}</span>
          </p>
        )}
        <p>
          {t.planFixture} <span className="gs-mono">{escapeForDisplay(meta.projectName)}</span>
        </p>
      </div>
      <ol className="gs-mono gs-steps" aria-label={t.planSteps}>
        {state.plan.map((action, i) => {
          const step = steps?.[i];
          return (
            <li key={i}>
              <span data-step-command className="gs-command">{escapeForDisplay(action.command)}</span>
              {step === undefined ? null : (
                <>
                  {' '}
                  <StepStatus step={step} />
                </>
              )}{' '}
              <button
                type="button"
                className="gk-button"
                aria-label={`${t.removeStep} ${i + 1}`}
                onClick={() => {
                  dispatch({ type: 'removeStep', index: i });
                }}
              >
                {t.removeStep}
              </button>
            </li>
          );
        })}
      </ol>
      <form
        className="gs-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next = dispatch({ type: 'addToPlan', command });
          if (next !== undefined && next.plan.length > state.plan.length) setCommand('');
        }}
      >
        <label className="gs-field">
          {t.commandInput}
          <input
            type="text"
            className="gk-input gs-mono"
            value={command}
            onChange={(event) => {
              setCommand(event.currentTarget.value);
            }}
          />
        </label>
        <button type="submit" className="gk-button">{t.addToPlan}</button>
      </form>
      <div className="gs-actions gs-file-actions">
        <button
          type="button"
          className="gk-button"
          onClick={() => {
            dispatch({ type: 'clearPlan' });
          }}
        >
          {t.clearPlan}
        </button>
        <label className="gs-field">
          {t.loadPlan}
          <input type="file" className="gk-input" accept="application/json,.json" onChange={onFile} />
        </label>
        <button
          type="button"
          className="gk-button"
          onClick={() => {
            dispatch({ type: 'downloadPlanFile' });
          }}
        >
          {t.downloadPlan}
        </button>
      </div>
    </section>
  );
}
