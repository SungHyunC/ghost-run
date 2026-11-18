// Display limits (design: "Display limits", Assumption A8). Initial render limits only.

/** Code points of a compact one-line text. */
export const COMPACT_MAX = 120;
/** Code points of one detail field. */
export const DETAIL_MAX = 4096;
/** Mirror world rows rendered before the reveal control. */
export const MIRROR_ROWS = 200;
/** Scene entries (rows) rendered before the reveal control. */
export const SCENE_ENTRIES = 200;
/** Scene nesting depth. */
export const SCENE_DEPTH = 8;
/** Blacklight lines per source. */
export const BL_LINES = 200;
/** Blacklight Findings per source (list and in-text markers). */
export const BL_FINDINGS = 100;
/** Tombstones rendered before the reveal control. */
export const TOMBSTONES = 200;
/** Threads rendered before the reveal control. */
export const THREADS = 200;
/** Hex items printed in one marker. */
export const MARKER_CODEPOINTS = 20;
/** Code points of `Finding.rendering` printed in one marker. */
export const MARKER_RENDERING = 200;
/** Code points of an unknown verdict value. */
export const UNKNOWN_VERDICT_MAX = 40;
/** Primitive fields shown for an unrecognized change. */
export const UNRECOGNIZED_FIELDS = 5;
/** Depth bound of the generic value redactor. */
export const GENERIC_DEPTH = 8;
