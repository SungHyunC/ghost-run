// Every fixed user-visible text of the kit (English). Plain ASCII, no hidden characters.
// The words 'sealed' and 'isolated' appear only in the two Assurance_Text constants.

// Candle
export const CANDLE_LABELS = {
  lit: { text: 'PASS', accessible: 'Candle lit: pass. All wards cleared.' },
  flickering: { text: 'WARN', accessible: 'Candle flickering: warn. Human approval needed.' },
  out: { text: 'BLOCK', accessible: 'Candle out: block.' },
  unknown: { text: 'UNKNOWN', accessible: 'Candle state unknown: verdict not recognized.' },
  idle: { text: 'NO VERDICT', accessible: 'No verdict yet.' },
} as const;
export const NO_VIOLATIONS_REPORTED = 'Violated ward: none reported';
export const DATA_INCONSISTENT = 'Data inconsistent: pass verdict with violations.';
export const violatedWard = (wardId: string, wardKind: string): string => `Violated ward: ${wardId} (${wardKind})`;
export const violationItem = (wardId: string, reason: string): string => `${wardId}: ${reason}`;
export const noticeItem = (stepIndex: string, reason: string): string => `step ${stepIndex}: ${reason}`;
export const noticesNeedReview = (k: number): string => `${k} notices need review`;

// Claims
export const ASSURANCE_DOCKER = 'Ghost ran inside a sealed Docker box (P1 claimed).';
export const ASSURANCE_PLAYGROUND = 'Ghost ran on an in-memory copy in this browser (P1 claimed).';
export const STATIC_BANNER = 'Static analysis only: no ghost rehearsal took place. P1, P5 and P6 are NOT claimed for this run.';
export const REASON_DOCKER_UNAVAILABLE = ' Reason: Docker unavailable.';
export const REASON_BOX_IMAGE_MISSING = ' Reason: box image missing.';
// Lowered-claim wording by reason. Sealed modes only; a static-analysis run is already worded by STATIC_BANNER.
export const REASON_NO_REHEARSAL = ' No rehearsal took place.';
export const REASON_STEPS_NOT_REHEARSED = ' Some steps were not rehearsed.';
export const CLAIMED_TEXT = 'claimed';
export const NOT_CLAIMED_TEXT = 'NOT claimed';
export const notApplicableText = (id: string): string => `${id}: not applicable to this world`;
export const NOT_CLAIMED_PREFIX = 'Not claimed for this run: ';
export const STATUS_UNKNOWN = 'Isolation status unknown.';
export const notClaimed = (ids: readonly string[]): string => `${NOT_CLAIMED_PREFIX}${ids.join(', ')}.`;

// Empty states and placeholders
export const EMPTY_MIRROR = 'No changes: the ghost run left the mirror unchanged.';
export const EMPTY_GRAVEYARD = 'No blocked commands yet.';
export const EMPTY_BLACKLIGHT = 'No texts to scan.';
export const EMPTY_THREAD = 'No addresses or paths to trace.';
export const placeholder = (componentName: string): string =>
  `Data unavailable: ${componentName} received unreadable input.`;
export const unreadableItem = (index: number): string => `Unreadable item ${index}`;
export const showing = (shown: number, total: number): string => `Showing ${shown} of ${total}`;
export const showAll = (total: number, what: string): string => `Show all ${total} ${what}`;
export const TRUNCATED = '[truncated]';

// Mirror world
export const MIRROR_TITLE = 'Mirror world';
export const MIRROR_TABLE_LABEL = 'Changes in reality and in the mirror copy';
export const MIRROR_REALITY = 'Reality';
export const MIRROR_COPY = 'Mirror (copy)';
export const mirrorSummary = (changes: number, steps: number): string => `${changes} changes in ${steps} steps`;
export const stepHeading = (stepIndex: number): string => `step ${stepIndex}`;
export const WOULD_BE_REMOVED = 'would be removed';
export const UNRECOGNIZED_CHANGE = 'unrecognized change';
export const TABLE_DROPPED = 'table dropped';
export const rowsLost = (n: string): string => `rows lost: ${n}`;
export const FULL_SCENE = 'Full scene';

// Blacklight
export const BLACKLIGHT_NAME = 'Blacklight';
export const blacklightSwitchText = (on: boolean): string => `Blacklight: ${on ? 'on' : 'off'}`;
export const blacklightSummary = (source: string, n: number): string => `${source}: ${n} findings`;
export const BLACKLIGHT_DISCLAIMER = 'Text analysis does not catch every injection.';
export const NO_FINDINGS = 'No hidden text found by the blacklight.';
export const UNPLACED_FINDINGS = 'Findings that could not be placed';

// Red thread
export const THREAD_NOT_FOUND = 'No cause found in the texts the agent read. Not found does not mean safe.';
export const THREAD_LITERAL_ONLY = 'The red thread finds literal occurrences only.';
export const HIDDEN_TEXT = 'hidden text';
/** Fixed text of the Findings list while the blacklight is off. */
export const FINDINGS_LOCKED = 'Turn on the blacklight to read it.';
export const codePointCountText = (n: number): string => `${n} code point${n === 1 ? '' : 's'}`;
export const TURN_ON_BLACKLIGHT = 'Turn on the blacklight to reveal it.';
export const MATCHED_HOST_KEY = 'matched host key';
export const threadMismatch = (needles: number, links: number): string =>
  `Red thread data mismatch: ${needles} needles, ${links} links.`;

// Graveyard and seance
export const graveyardSummary = (n: number): string => `${n} blocked commands`;
export const TIME_UNREADABLE = 'time unreadable';
export const NO_SEANCE_LINK = 'No seance link: invalid id';
export const SEANCE_TITLE = 'Seance';
export const BACK_TO_GRAVEYARD = 'Back to graveyard';
export const notRecorded = (part: string): string => `${part} not recorded`;

// Lights
export const LIGHTS_NAME = 'Lights on';
export const lightsSwitchText = (on: boolean): string => `Lights: ${on ? 'on' : 'off'}`;

// Generic values
export const HIDDEN_SECRET = '[hidden: secret-like field]';
