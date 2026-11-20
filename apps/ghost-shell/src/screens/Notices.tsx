import type { PageAction, PageState } from '../state/reducer';
import { RUN_FAILED_TEXT } from '../texts';
import { useStrings } from '../i18n/context';
import { escapeForDisplay } from '../ui-imports';

export interface NoticesProps {
  readonly state: PageState;
  readonly sqlFailed: boolean;
  readonly dispatch: (action: PageAction) => void;
}

/** Error alerts and fixed notices. Plan errors arrive from the reducer already escaped; they are escaped again (idempotent). */
export function Notices({ state, sqlFailed, dispatch }: NoticesProps) {
  const { notice, planErrors } = state;
  const t = useStrings();
  return (
    <div aria-label={t.noticesLabel} className="gs-notices">
      {sqlFailed ? <p role="alert">{t.sqlStartFailed}</p> : null}
      {notice === undefined ? null : (
        <p role={notice === RUN_FAILED_TEXT ? 'alert' : 'status'}>{escapeForDisplay(t.notices[notice] ?? notice)}</p>
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
          className="gk-button"
          onClick={() => {
            dispatch({ type: 'dismissNotice' });
          }}
        >
          {t.dismiss}
        </button>
      )}
    </div>
  );
}
