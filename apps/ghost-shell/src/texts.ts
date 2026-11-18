// Fixed texts of the app. Every user-visible constant string lives here.
// The Blacklight disclaimer ("Text analysis does not catch every injection.") comes from the ui kit only.
// The words "sealed" and "isolated" appear in none of them (Requirement 18.7).

export const APP_TITLE = 'Ghost Shell';
export const APP_TAGLINE = "Let your agent's ghost try it first.";

export const SCRIPTED_PLAN_TEXT = 'Scripted plan: not decided by an LLM in this page.';
export const RECORDED_PLAN_TEXT = 'Recorded plan: replayed here, not decided by an LLM in this page.';
export const CANARY_TEXT =
  'Secrets in this demo are fake canary values and addresses are reserved example domains.';
export const DOCKER_BOX_NOT_USED_TEXT = 'Docker box (real mode) is not used by this page.';

export const BLACKLIGHT_NO_FINDINGS_TEXT = 'No hidden text found by the blacklight.';
export const POSSESSION_ACTION_TEXT =
  'A secret read followed by an unapproved network attempt is blocked by action, with or without hidden text.';

export const EMPTY_PLAN_TEXT = 'The plan is empty: add a command first.';
export const P1_FAILED_TEXT = 'Ghost run changed reality: this is a bug in the playground.';
export const GRAVEYARD_DROPPED_TEXT = 'Oldest blocked command dropped (limit 200).';
export const RUN_FAILED_TEXT = 'The playground failed to run this plan.';
export const SQL_START_FAILED_TEXT = 'The SQL engine failed to start.';
export const STALE_WARDS_TEXT = 'stale: wards.yaml has errors';

export const MESSAGE_PANEL_LABEL = 'Message the agent receives';

export const UNSUPPORTED_STEP_REASON = 'unsupported command, not rehearsed.';
export const WATCHDOG_STEP_REASON = 'sql statement exceeded the watchdog, not rehearsed.';
export const UNSUPPORTED_MARKER_TEXT = 'unsupported';
export const WATCHDOG_MARKER_TEXT = 'watchdog';
export const FAILED_MARKER_TEXT = 'failed';
export const NO_RUN_TEXT = 'No ghost run yet.';

export const P2_MEANING_TEXT =
  'P2 holds for the playground world only; it is not claimed for shell worlds in real mode.';
export const P2_NOT_CLAIMED_UNSUPPORTED_TEXT =
  'P2 is not claimed for this run: a step was unsupported and not rehearsed.';
export const P2_NOT_CLAIMED_WATCHDOG_TEXT =
  'P2 is not claimed for this run: the SQL watchdog stopped a step.';

export const P5_P6_SCOPE_TEXT =
  'P5 and P6 are not claimed for a run that contains an unsupported step. Compression, encryption, and DNS exfiltration of a secret are outside content inspection and caught by the action criterion only.';

export const LOAD_PLAN_LABEL = 'Load plan file';
export const DOWNLOAD_PLAN_LABEL = 'Download plan file';
export const DOWNLOAD_WARDS_LABEL = 'Download wards.yaml';
export const RESET_WARDS_LABEL = 'Reset to default';
export const COMMAND_INPUT_LABEL = 'Command';
export const ADD_TO_PLAN_LABEL = 'Add to plan';
export const REMOVE_STEP_LABEL = 'Remove step';
export const CLEAR_PLAN_LABEL = 'Clear plan';
export const RUN_GHOST_LABEL = 'Run ghost';
export const APPLY_FIXED_PLAN_LABEL = 'Apply fixed plan';
export const PURIFY_LABEL = 'Purify';

export const PURIFY_NOTE_TEXT =
  'Purify replaces the README text of the in-memory copy only. It does not re-run the plan or write a file.';
export const WARDS_EDITOR_LABEL = 'wards.yaml editor';
export const WARDS_IN_MEMORY_TEXT =
  'This edit is an in-memory copy. It is not saved and the bundled wards.yaml file does not change.';
export const WARDS_ERRORS_LABEL = 'wards.yaml errors';
export const WARDS_DOWNLOAD_FILE_NAME = 'wards.yaml';
