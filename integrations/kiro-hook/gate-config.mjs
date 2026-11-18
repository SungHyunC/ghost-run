// Gate constants. This file is a Self_Protected_Path and reads no environment
// variable. WARN_MODE stays 'exit2' until task 17.3.

/** How a warn verdict is delivered to the host. */
export const WARN_MODE = 'exit2';

/** Watchdog of the gate process, in milliseconds. */
export const WATCHDOG_MS = 50_000;

/** Deadline given to the runner pipeline, in seconds. */
export const RUNNER_DEADLINE_SEC = 44;

/** Number of concurrent rehearsal slots. */
export const SEMAPHORE_SLOTS = 2;

/** Longest wait for a semaphore slot, in milliseconds. */
export const SEMAPHORE_WAIT_MS = 5_000;

/** Largest STDIN payload the gate reads, in bytes (1 MiB). */
export const STDIN_MAX_BYTES = 1_048_576;

/** Longest command text the gate classifies, in code points. */
export const COMMAND_MAX_CODE_POINTS = 4096;

/** Most entries a delete enumeration may list. */
export const DELETE_ENUM_MAX = 10_000;

/** Ghost_Store caps. */
export const STORE_CAPS = Object.freeze({
  sessions: 20,
  runs: 200,
  graveyardLines: 2000,
  provenancePerSession: 1000,
  recordBytes: 1_048_576,
});

/** True once the runner accepts a caller-supplied run id (see Cross-spec dependencies). */
export const RUNNER_SUPPORTS_RUN_ID = false;

// File-event and Post Tool Use constants. These values are CLI-3.4.0-measured
// (probe, 2026-11-18). They must be re-checked after the IDE probe, task 1.4.

/** STDIN fields that carry the path of a file event, in lookup order. */
export const FILE_EVENT_PATH_FIELDS = Object.freeze(['file_path']);

/** Trigger identifier of the file-create hook. */
export const FILE_CREATE_TRIGGER = 'PostFileCreate';

/** Post Tool Use fields that carry the tool response, in lookup order. */
export const POST_RESPONSE_FIELDS = Object.freeze(['tool_response']);
