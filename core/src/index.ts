export * from './types.js';
export { compareFingerprints } from './fingerprint.js';
export { ghostRun } from './runner.js';
export { isMoreRestrictive, WardEngine } from './wards.js';
export * from './possession/index.js';

// Judge API. The judge's `sanitizeText(s, maxCodePoints)` clashes with the possession
// `sanitizeText(text, options)` already exported above, so it is exported as `sanitizeJudgeText`.
export { validateGlob, normalizePattern } from './judge/glob.js';
export type { GlobError, GlobErrorCode } from './judge/glob.js';
export { normalizePath, foldPath } from './judge/normalize.js';
export { compilePathSet } from './judge/pathset.js';
export type { PathSet } from './judge/pathset.js';
export {
  validateHostEntry,
  hostEntryKey,
  compileAllowHosts,
  parseDestination,
  redactDestination,
} from './judge/host.js';
export type { HostEntryError, HostEntryErrorCode, HostRef } from './judge/host.js';
export { extractCanaries } from './judge/canary.js';
export { createInspector } from './judge/inspect.js';
export type { EncodingKind, Inspector } from './judge/inspect.js';
export {
  renderMessage,
  CLAIM_LOWERED_LINE,
  CLAIM_LOWERED_UNSUPPORTED_STEP_LINE,
  SUGGESTIONS,
} from './judge/message.js';
export type { RenderContext, Claims, ClaimLoweredReason } from './judge/message.js';
export { sanitizeText as sanitizeJudgeText } from './judge/sanitize.js';
export { compareCodePoints } from './judge/bytes.js';
