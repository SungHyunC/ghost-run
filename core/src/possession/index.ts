export { scanText } from './scan.js';
export { sanitizeText } from './sanitize.js';
export { collectNeedles, traceRedThread } from './red-thread.js';
export { serializeProvenanceLog, parseProvenanceLog } from './provenance.js';
export { scanTexts, exitCodeFor, formatReport } from './entry.js';
export type {
  HiddenCategory,
  ScanOptions,
  Finding,
  ScanResult,
  ProvenanceKind,
  ProvenanceRecord,
  ProvenanceLog,
  ProvenanceError,
  ProvenanceParseResult,
  NeedleOrigin,
  Needle,
  NeedleSource,
  ThreadLink,
  Outcome,
  ScanInput,
  FileScan,
  BlacklightReport,
  ScanEntryOptions,
} from './types.js';
