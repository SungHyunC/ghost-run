import type { PageAction, PageState } from '../state/reducer';
import { RUN_FAILED_TEXT, SQL_START_FAILED_TEXT } from '../texts';
import { escapeForDisplay } from '../ui-imports';

export interface NoticesProps {
  readonly state: PageState;
  readonly sqlFailed: boolean;
  readonly dispatch: (action: PageAction) => void;
}

/** Error alerts and fixed notices. Plan errors arrive from the reducer already escaped; they are escaped again (idempotent). */
export function Notices({ state, sqlFailed, dispatch }: NoticesProps) {
  const { notice, planErrors } = state;
  return (
    <div aria-label="Notices">
      {sqlFailed ? <p role="alert">{SQL_START_FAILED_TEXT}</p> : null}
      {notice === undefined ? null : (
        <p role={notice === RUN_FAILED_TEXT ? 'alert' : 'status'}>{escapeForDisplay(notice)}</p>
      )}
      {planErrors.length === 0 ? null : (
        <ul role="alert">
          {planErrors.map((text, i) => (
            <li key={i}>{escapeForDisplay(text)}</li>
          ))}
        </ul>
      )}
      {notice === undefined && planErrors.length === 0 ? null : (
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'dismissNotice' });
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
