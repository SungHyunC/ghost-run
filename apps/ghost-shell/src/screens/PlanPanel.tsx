import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { PlaygroundRun } from '../pipeline/run-playground';
import type { StepView } from '../pipeline/steps';
import type { PageAction, PageState } from '../state/reducer';
import {
  ADD_TO_PLAN_LABEL,
  CLEAR_PLAN_LABEL,
  COMMAND_INPUT_LABEL,
  DOWNLOAD_PLAN_LABEL,
  FAILED_MARKER_TEXT,
  LOAD_PLAN_LABEL,
  RECORDED_PLAN_TEXT,
  REMOVE_STEP_LABEL,
  SCRIPTED_PLAN_TEXT,
  UNSUPPORTED_MARKER_TEXT,
  WATCHDOG_MARKER_TEXT,
} from '../texts';
import { escapeForDisplay } from '../ui-imports';
import { MONO } from './style';

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
  let icon = '\u2713';
  let text = `exit ${step.exitCode}`;
  if (step.unsupported) {
    icon = '\u26A0';
    text = `${UNSUPPORTED_MARKER_TEXT} (exit ${step.exitCode})`;
  } else if (step.watchdog) {
    icon = '\u23F1';
    text = `${WATCHDOG_MARKER_TEXT} (exit ${step.exitCode})`;
  } else if (step.exitCode !== 0) {
    icon = '\u2716';
    text = `${FAILED_MARKER_TEXT} (exit ${step.exitCode})`;
  }
  return (
    <span data-step-status>
      <span aria-hidden="true">{icon}</span> {text}
    </span>
  );
}

export function PlanPanel({ state, dispatch }: PlanPanelProps) {
  const [command, setCommand] = useState('');
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
    <section aria-labelledby="gs-plan-h">
      <h2 id="gs-plan-h">Plan</h2>
      <p>
        Plan name: <span data-plan-name>{escapeForDisplay(meta.name)}</span>
      </p>
      <p>{meta.origin === 'recorded' ? RECORDED_PLAN_TEXT : SCRIPTED_PLAN_TEXT}</p>
      {meta.note === undefined ? null : (
        <p>
          Note: <span data-plan-note>{escapeForDisplay(meta.note)}</span>
        </p>
      )}
      <p>
        Project fixture: <span style={MONO}>{escapeForDisplay(meta.projectName)}</span>
      </p>
      <ol style={MONO} aria-label="Plan steps">
        {state.plan.map((action, i) => {
          const step = steps?.[i];
          return (
            <li key={i}>
              <span data-step-command>{escapeForDisplay(action.command)}</span>
              {step === undefined ? null : (
                <>
                  {' '}
                  <StepStatus step={step} />
                </>
              )}{' '}
              <button
                type="button"
                aria-label={`${REMOVE_STEP_LABEL} ${i + 1}`}
                onClick={() => {
                  dispatch({ type: 'removeStep', index: i });
                }}
              >
                {REMOVE_STEP_LABEL}
              </button>
            </li>
          );
        })}
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = dispatch({ type: 'addToPlan', command });
          if (next !== undefined && next.plan.length > state.plan.length) setCommand('');
        }}
      >
        <label>
          {COMMAND_INPUT_LABEL}{' '}
          <input
            type="text"
            style={MONO}
            value={command}
            onChange={(event) => {
              setCommand(event.currentTarget.value);
            }}
          />
        </label>
        <button type="submit">{ADD_TO_PLAN_LABEL}</button>
      </form>
      <div>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'clearPlan' });
          }}
        >
          {CLEAR_PLAN_LABEL}
        </button>
        <label>
          {LOAD_PLAN_LABEL} <input type="file" accept="application/json,.json" onChange={onFile} />
        </label>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'downloadPlanFile' });
          }}
        >
          {DOWNLOAD_PLAN_LABEL}
        </button>
      </div>
    </section>
  );
}
