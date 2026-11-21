// Gate constants. This file is a Self_Protected_Path and reads no environment
// variable. WARN_MODE is 'ask': measured in Kiro IDE 1.4.236 and Kiro CLI 3.5.0 on 2026-11-21, see the entry
// "Host checks before enabling the gate" in docs/measurements.md (task 17.3, decided by the human).

/** How a warn verdict is delivered to the host. */
export const WARN_MODE = 'ask';

/** Watchdog of the gate process, in milliseconds. */
export const WATCHDOG_MS = 50_000;

/** Deadline given to the runner pipeline, in seconds. */
export const RUNNER_DEADLINE_SEC = 44;

/**
 * Deadline of the one Docker wake retry, in milliseconds. The gate's first Docker check has
 * 2 s (AVAILABILITY_LIMIT_MS of the runner). If it times out, which happens when Docker Desktop's
 * Resource Saver stopped the VM, the check is repeated once with this deadline. The runner caps
 * it by the pipeline deadline, so 2 s + 10 s stays inside RUNNER_DEADLINE_SEC and WATCHDOG_MS.
 * Only after the retry also fails does the gate fall back to static analysis.
 */
export const DOCKER_WAKE_RETRY_MS = 10_000;

/** Longest the warm-up hook spends before it exits, in milliseconds. It never waits for Docker. */
export const WARMUP_BUDGET_MS = 1_000;

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
export const RUNNER_SUPPORTS_RUN_ID = true;

// File-event and Post Tool Use constants. Measured by the probe in Kiro CLI 3.4.0
// (2026-11-18) and Kiro IDE 1.4.215 (2026-11-19); both hosts gave the same values.

/** STDIN fields that carry the path of a file event, in lookup order. */
export const FILE_EVENT_PATH_FIELDS = Object.freeze(['file_path']);

/** Trigger identifier of the file-create hook. */
export const FILE_CREATE_TRIGGER = 'PostFileCreate';

/** Post Tool Use fields that carry the tool response, in lookup order. */
export const POST_RESPONSE_FIELDS = Object.freeze(['tool_response']);
