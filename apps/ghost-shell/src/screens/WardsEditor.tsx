import type { PageAction, PageState } from '../state/reducer';
import {
  DOWNLOAD_WARDS_LABEL,
  RESET_WARDS_LABEL,
  WARDS_EDITOR_LABEL,
  WARDS_ERRORS_LABEL,
  WARDS_IN_MEMORY_TEXT,
} from '../texts';
import { wardsEditorErrors } from '../wards/wards-editor';
import { MONO } from './style';

export interface WardsEditorProps {
  readonly state: PageState;
  readonly dispatch: (action: PageAction) => PageState | void;
  /** Offers the current text as a download (the page creates the Blob). */
  readonly onDownload: (text: string) => void;
}

export function WardsEditor({ state, dispatch, onDownload }: WardsEditorProps) {
  const { text } = state.wards;
  const errors = wardsEditorErrors(state.wards);
  const lineCount = text.split('\n').length;
  const gutter: string[] = [];
  for (let n = 1; n <= lineCount; n += 1) gutter.push(errors.lines.includes(n) ? `${n} \u2716` : `${n}`);
  return (
    <section aria-labelledby="gs-wards-h">
      <h2 id="gs-wards-h">Wards</h2>
      <p>{WARDS_IN_MEMORY_TEXT}</p>
      {errors.label === undefined ? null : <p data-wards-stale>{errors.label}</p>}
      <div style={{ display: 'flex', gap: '0.5em' }}>
        <pre aria-hidden="true" data-wards-gutter style={{ ...MONO, margin: 0, textAlign: 'right' }}>
          {gutter.join('\n')}
        </pre>
        <textarea
          aria-label={WARDS_EDITOR_LABEL}
          style={{ ...MONO, flex: 1 }}
          rows={Math.min(Math.max(lineCount, 4), 30)}
          spellCheck={false}
          value={text}
          onChange={(event) => {
            dispatch({ type: 'wards', event: { type: 'edit', text: event.currentTarget.value } });
          }}
        />
      </div>
      {errors.messages.length === 0 ? null : (
        <ul role="alert" aria-label={WARDS_ERRORS_LABEL} style={MONO}>
          {errors.lines.length > 0 ? <li>{`Lines with errors: ${errors.lines.join(', ')}`}</li> : null}
          {errors.messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'wards', event: { type: 'reset' } });
          }}
        >
          {RESET_WARDS_LABEL}
        </button>
        <button
          type="button"
          onClick={() => {
            onDownload(text);
          }}
        >
          {DOWNLOAD_WARDS_LABEL}
        </button>
      </div>
    </section>
  );
}
