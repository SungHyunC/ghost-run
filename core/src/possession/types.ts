// Possession detector: public data types. Types only, no runtime code.
// All shapes are plain JSON values (no undefined fields, Date, Map, Set, or cycles).

import type { GhostReport } from '../types.js';

// -- Blacklight scan ---------------------------------------------------------

export type HiddenCategory = 'tag' | 'zero-width' | 'bidi' | 'html-comment';

export interface ScanOptions {
  /** Detect HTML comments. Default true. */
  readonly markdown?: boolean;
}

export interface Finding {
  readonly category: HiddenCategory;
  /** 1-based. */
  readonly line: number;
  /** 1-based, in code points from the line start. */
  readonly column: number;
  /** 0-based, in code points from the text start. */
  readonly offset: number;
  /** Code points covered. */
  readonly length: number;
  readonly codePoints: readonly number[];
  /** "U+" plus at least four uppercase hex digits. */
  readonly firstCodePoint: string;
  /** Printable ASCII only (U+0020 to U+007E). */
  readonly rendering: string;
}

export interface ScanResult {
  readonly findings: readonly Finding[];
}

// -- Provenance records ------------------------------------------------------

export type ProvenanceKind = 'file' | 'issue' | 'web' | 'other';

export interface ProvenanceRecord {
  /** Non-empty. */
  readonly source: string;
  readonly kind: ProvenanceKind;
  readonly content: string;
}

export type ProvenanceLog = readonly ProvenanceRecord[];

export interface ProvenanceError {
  /** Zero-based record index; absent for top-level errors. */
  readonly index?: number;
  /** 'source' | 'kind' | 'content' | name of an unknown field. */
  readonly field?: string;
  readonly message: string;
}

export type ProvenanceParseResult =
  | { readonly ok: true; readonly log: ProvenanceLog }
  | { readonly ok: false; readonly errors: readonly ProvenanceError[] };

// -- Red thread --------------------------------------------------------------

export type NeedleOrigin = 'effect' | 'observed-destination' | 'observed-path';

export interface Needle {
  /** Non-empty. */
  readonly value: string;
  readonly origin: NeedleOrigin;
  readonly stepIndex: number;
}

export type NeedleSource = Pick<
  GhostReport<unknown>,
  'effectsOutside' | 'observedEvents'
>;

export type ThreadLink =
  | {
      readonly status: 'found';
      readonly needle: Needle;
      readonly matchedKey: 'value' | 'host';
      readonly source: string;
      readonly kind: ProvenanceKind;
      readonly recordIndex: number;
      /** 1-based, original content. */
      readonly line: number;
      /** 1-based, in code points, original content. */
      readonly column: number;
      /** ASCII-escaped, at most 200 characters. */
      readonly lineText: string;
      readonly hidden: boolean;
    }
  | { readonly status: 'not-found'; readonly needle: Needle };

// -- Scan entry point --------------------------------------------------------

export type Outcome = 'clean' | 'findings' | 'error';

export interface ScanInput {
  readonly path: string;
  readonly text: string;
}

export interface FileScan {
  readonly path: string;
  readonly findings: readonly Finding[];
  readonly error?: string;
}

export interface BlacklightReport {
  readonly outcome: Outcome;
  readonly files: readonly FileScan[];
  readonly totalFindings: number;
}

export interface ScanEntryOptions {
  /** 'by-extension' (default) applies the extension rule; a boolean forces markdown for every input. */
  readonly markdown?: boolean | 'by-extension';
}
