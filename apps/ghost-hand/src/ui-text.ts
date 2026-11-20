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
export const CAMERA_ANGLED_LABEL = 'Angled view';
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

// Page design (hero, rail, ghost lineup, sections). Labels only; no requirement pins them.
export const APP_BRAND = 'Ghost Run+';
export const HERO_EYEBROW = 'Physics playground';
export const HERO_LEAD =
  'Before a robot arm moves, eight ghost arms try the same plan in haunted copies of the world: more friction, a heavier drawer, a lagging controller. If a ghost touches the vase or pulls too hard, the candle goes out and the arm stays still.';
export const HERO_POINTS = ['Runs in this tab', 'Eight haunted variants', 'No LLM in this page'] as const;
export const STEP_PICK_LABEL = 'Step 1';
export const RAIL_HINT = 'Play the demo, or pick a plan and run its ghosts.';
export const SCENARIO_NOTES: Readonly<Record<string, string>> = {
  'fast-pull': 'Pulls fast and grips hard.',
  'slow-pull': 'Pulls slowly and grips gently.',
};
export const STEP_RESULT_LABEL = 'Step 2';
export const RESULT_HEADING = 'What the ghosts did';
export const NO_GHOSTS_TEXT = 'Play the demo or run a plan to see the ghosts.';
export function failedSummaryText(failed: number, total: number): string {
  return `${failed} of ${total} ghosts failed`;
}
export const FAILED_SUMMARY_NOTE = 'Every ghost must pass before the arm may move.';
export const LINEUP_TITLE = 'Ghost lineup';
export const LINEUP_BASE_NAME = 'base run';
export function lineupGhostName(index: number): string {
  return `ghost ${index}`;
}
export const LINEUP_PASS_TAG = 'pass';
export const LINEUP_FAIL_TAG = 'fail';
export const LINEUP_DRAWER = 'drawer';
export const LINEUP_FORCE = 'force';
export const LINEUP_VASE_TOUCHED = 'vase touched';
export const LINEUP_NO_HAUNTING = 'no haunting';
export const STEP_INSPECT_LABEL = 'Step 3';
export const INSPECT_HEADING = 'Look closer';
export const INSPECT_INTRO =
  'Run the passing plan on the reference arm, and read what this page claims and what it does not.';
export const TOOLS_LABEL = 'Make your own';
export const TOOLS_INTRO = 'Load your own plan file, or download the plan you ran. Nothing here is saved.';
export const FOOTER_TEXT = 'Ghost Run+, MIT license, made for Kiroween 2026';
