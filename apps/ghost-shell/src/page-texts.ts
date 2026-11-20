// Fixed texts of the page design: hero, ghost flow diagram, scenario cards, section heads.
// Same rules as texts.ts (tests/screens/page-texts.test.ts): printable ASCII only, and neither "sealed" nor "isolated".

export const APP_BRAND = 'Ghost Run+';
export const APP_EYEBROW = 'Playground';
export const HERO_LEAD =
  'Before a coding agent runs a shell or SQL command, its ghost runs it on a copy of the project. Wards judge what changed. If the candle goes out, the command is blocked and the agent gets the reason.';
export const HERO_POINTS = ['Runs in this tab', 'Scripted plans, no LLM', 'Fake secrets only'] as const;

export const FLOW_HEADING = 'Only plans the ghost gets through run for real.';
export const FLOW_SUMMARY_TEXT =
  'Diagram: the agent plans a command, the world is copied, and the ghost runs the plan on the copy. The wards judge what changed. Candle out: the command is blocked, the reason goes back to the agent, and the agent fixes its plan. Candle flickers: a side effect outside the copy, so a human decides. Candle lit: every ward passed, and the real command may run.';
export const FLOW_NODES = {
  plan: { title: "Agent's plan", sub: 'shell, SQL, robot moves' },
  copy: { title: 'Copy the world', sub: 'files, database, physics' },
  ghost: { title: 'Ghost goes first', sub: 'records changes and actions' },
  judge: { title: 'Wards judge', sub: 'the candle' },
  out: { title: 'Out: blocked', sub: 'the reason goes back' },
  flicker: { title: 'Flicker: ask a human', sub: 'side effects outside the copy' },
  lit: { title: 'Lit: run for real', sub: 'every ward passed' },
} as const;
export const FLOW_JUDGE_SUB = {
  idle: 'the candle',
  lit: 'candle lit',
  flickering: 'candle flickers',
  out: 'candle out',
} as const;
export const FLOW_EDGE_FIX = 'fix the plan';
export const FLOW_EDGE_APPROVED = 'if approved';
export const FLOW_REPLAY_LABEL = 'Replay';

export const STEP_PICK_LABEL = 'Step 1';
export const STEP_RUN_LABEL = 'Step 2';
export const STEP_INSPECT_LABEL = 'Step 3';
export const SCENARIOS_INTRO = 'Pick a haunting. Each one is a scripted plan an agent might try.';
export const SCENARIO_CARDS = {
  1: { tag: 'SQL', blurb: 'An agent tidies the database with one DROP TABLE. Every user lives in that table.' },
  2: { tag: 'Files', blurb: 'A clean build starts with rm -rf. The data folder is in the blast radius.' },
  3: { tag: 'Possession', blurb: 'Invisible text in a README tells the agent to send .env to a setup server.' },
  4: { tag: 'Tests', blurb: 'An everyday command, to see what a quiet ghost run looks like.' },
  5: { tag: 'npm script', blurb: 'npm run clean sounds harmless. The script behind it reaches into data/.' },
} as const;
export const SELECTED_TEXT = 'Selected';
export const FIXED_PLAN_HINT = 'Apply fixed plan runs the corrected plan of scenarios 1 and 2.';
export const STAGE_INTRO = 'Edit the plan on the left. The ghost run, the candle, and the mirror world show up on the right.';
export const NO_RUN_HINT_TEXT = 'Pick a scenario and press Run ghost.';
export const INSPECT_HEADING = 'Look closer';
export const INSPECT_INTRO =
  'The graveyard keeps every blocked command. The red thread and the blacklight show where a possessed action came from. The wards decide what counts as harm.';
export const FOOTER_TEXT = 'Ghost Run+, MIT license, made for Kiroween 2026';

// -- Mirror stage (the picture of reality and the ghost copy) ------------------------

export const STAGE_REAL_TITLE = 'Reality';
export const STAGE_REAL_SUB = 'before the ghost run';
export const STAGE_COPY_TITLE = 'Ghost copy';
export const STAGE_COPY_SUB = 'after the ghost ran the plan';
export const STAGE_OUTSIDE_TITLE = 'Outside the copy';
export const STAGE_ROWS_WORD = 'rows';
export const STAGE_TABLE_DROPPED = 'table dropped';
export const STAGE_SECRET_TAG = 'secret read';
export const STAGE_AFTER_READ = 'after reading';
export const STAGE_STATUS_TAG = { same: '', deleted: 'deleted', created: 'new', changed: 'changed' } as const;
export const STAGE_STAMP = { block: 'Blocked by the wards', warn: 'A human decides', pass: 'Allowed by the wards' } as const;

// -- Verdict pill of the flow caption -------------------------------------------------

export const FLOW_PILL = { block: 'Candle out', warn: 'Flicker', pass: 'Candle lit' } as const;
export const SCENARIOS_HEADING_HINT = 'Pick a haunting, then run its ghost and watch it below.';
export const RUN_DETAILS_HEADING = 'Every change, step by step';
export const STEP_TOOLS_LABEL = 'Make your own';
export const TOOLS_HEADING = 'Write a plan, tune the wards';
export const TOOLS_INTRO = 'Type commands into a plan or load a plan file, and edit the wards the ghost is judged by. Nothing here is saved.';
