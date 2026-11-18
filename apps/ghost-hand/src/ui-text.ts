// Labels and headings of the Ghost Hand page. Texts pinned by the requirements live in texts.ts;
// this module holds only the labels that no requirement pins. No fixed text uses the words
// "sealed" or "isolated" (Requirement 14.11).

export const APP_TITLE = 'Ghost Hand';
export const APP_TAGLINE = 'Let your agent\u2019s ghost try it first.';

/** Req D24: Web Crypto needs a secure context (role `alert`). */
export const SECURE_CONTEXT_TEXT = 'This page needs a secure context (https or localhost).';

export const RUN_FAILED_PREFIX = 'The ghost run could not finish: ';
export const ENGINE_STARTING_TEXT = 'Starting the physics engine.';

export const PLAN_HEADING = 'Plan';
export const NO_PLAN_TEXT = 'No plan loaded. Load a plan file to rehearse it.';
export const LOAD_PLAN_LABEL = 'Load plan file';
export const DOWNLOAD_PLAN_LABEL = 'Download plan file';
export const RUN_GHOST_LABEL = 'Run ghost';
export const CLEAR_PLAN_LABEL = 'Clear plan';
export const SEED_LABEL = 'Seed';

export const SCENARIOS_LABEL = 'Scenarios';
export const PLAY_DEMO_LABEL = 'Play demo';
export const DEMO_STEP_RUN_FIRST = 'Demo step 1 of 4: running the first plan.';
export const DEMO_STEP_SHOW_BLOCK = 'Demo step 2 of 4: the first plan is blocked.';
export const DEMO_STEP_RUN_REVISED = 'Demo step 3 of 4: running the revised plan.';
export const DEMO_STEP_DONE = 'Demo step 4 of 4: the revised plan passed. Execute on reference arm is available.';
export const DEMO_STEP_REVISED_NOT_PASS = 'Demo step 4 of 4: the revised plan did not pass. Execute on reference arm stays off.';
export const DEMO_STEP_STOPPED = 'Demo stopped: the ghost run could not finish.';

export const REFERENCE_HEADING = 'Reference arm';
export const EXECUTE_REFERENCE_LABEL = 'Execute on reference arm';
export const RESET_REFERENCE_LABEL = 'Reset reference arm';
export const REFERENCE_INITIAL_TEXT = 'Reference arm at its initial state.';
export const REFERENCE_MOVED_PREFIX = 'Final drawer displacement (m): ';
export const REFERENCE_MOVED_NOTE =
  'The reference arm has moved. Later ghost runs start from this state until you reset it.';
export const REFERENCE_FAILED_PREFIX = 'The reference execution could not finish: ';

export const OVERLAY_HEADING = 'Ghost arms';
export const OVERLAY_NAME =
  'Ghost arm overlay. The same results are listed in the variant table below.';
export const CAMERA_FRONT_LABEL = 'Front view';
export const CAMERA_SIDE_LABEL = 'Side view';
export const FRAME_SLIDER_LABEL = 'Frame';
export const REPLAY_LABEL = 'Replay';
export const REDUCED_MOTION_TEXT = 'Reduced motion: showing the final frame. Use the frame slider to step through.';

export const TABLE_HEADING = 'Variants';
export const TABLE_CAPTION = 'Variant table: one row per ghost run, base first.';
export const NO_RUN_TEXT = 'No ghost run yet.';

export const GRAVEYARD_HEADING = 'Graveyard';
export const CLAIMS_HEADING = 'What this page claims';

export function liveRegionText(candle: 'lit' | 'flickering' | 'out', failed: number, total: number): string {
  return `Candle ${candle}, ${failed} of ${total} variants failed`;
}

export const RESTORE_FAILED_TEXT = 'Restore check failed: this browser did not reproduce a reused snapshot.';
