import type { PageAction, PageState } from '../state/reducer';
import { GRAVEYARD_DROPPED_TEXT } from '../texts';
import { Graveyard, SeanceView } from '../ui-imports';

export interface GraveyardPanelProps {
  readonly state: PageState;
  readonly dispatch: (action: PageAction) => PageState | void;
}

/** The kit Graveyard, or the Seance_View of the open entry, inside the page (no URL change, no fetch). */
export function GraveyardPanel({ state, dispatch }: GraveyardPanelProps) {
  const { entries, dropped } = state.graveyard;
  const open = state.seanceId === undefined ? undefined : entries.find((e) => e.id === state.seanceId);
  if (open !== undefined) {
    return (
      <SeanceView
        entry={open}
        onBack={() => {
          dispatch({ type: 'closeSeance' });
        }}
      />
    );
  }
  return (
    <>
      {dropped ? <p role="status">{GRAVEYARD_DROPPED_TEXT}</p> : null}
      <Graveyard
        entries={entries}
        onOpenSeance={(id) => {
          dispatch({ type: 'openSeance', id });
        }}
      />
    </>
  );
}
