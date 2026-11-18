// Scan entry point: pure report building, exit codes, and plain-text formatting.
// File reading lives in core/possession-node.ts. No literal hidden character appears here.

import { escapeAscii } from './classify.js';
import { scanText } from './scan.js';
import type {
  BlacklightReport,
  FileScan,
  Outcome,
  ScanEntryOptions,
  ScanInput,
} from './types.js';

const MARKDOWN_EXTENSIONS: readonly string[] = ['md', 'markdown', 'mdx'];
const MAX_RENDERING_CODE_POINTS = 200;
const BACKSLASH = String.fromCharCode(0x5c);
const QUOTE = String.fromCharCode(0x22);
const TRUNCATED_MARK = '[truncated]';

/**
 * True when the last path segment has an extension of md, markdown, or mdx
 * (case-insensitive). No dot, or only a leading dot, is not markdown.
 */
export function isMarkdownPath(path: string): boolean {
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf(BACKSLASH));
  const name = path.slice(lastSep + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return MARKDOWN_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/**
 * Internal report builder shared with the Node adapter.
 * Precedence: error over findings over clean.
 */
export function buildReport(files: readonly FileScan[]): BlacklightReport {
  let totalFindings = 0;
  let hasError = false;
  for (const file of files) {
    totalFindings += file.findings.length;
    if (file.error !== undefined) hasError = true;
  }
  const outcome: Outcome = hasError ? 'error' : totalFindings > 0 ? 'findings' : 'clean';
  return { outcome, files: [...files], totalFindings };
}

/** Scan in-memory inputs in order. Pure. */
export function scanTexts(
  inputs: readonly ScanInput[],
  options?: ScanEntryOptions,
): BlacklightReport {
  const forced = options?.markdown;
  const files: FileScan[] = inputs.map((input) => {
    const markdown = typeof forced === 'boolean' ? forced : isMarkdownPath(input.path);
    return { path: input.path, findings: scanText(input.text, { markdown }).findings };
  });
  return buildReport(files);
}

/** clean 0, findings 1, error 2. */
export function exitCodeFor(outcome: Outcome): 0 | 1 | 2 {
  switch (outcome) {
    case 'clean':
      return 0;
    case 'findings':
      return 1;
    default:
      return 2;
  }
}

/** Escape backslash and double quote, then wrap in double quotes. */
function quote(text: string): string {
  let out = QUOTE;
  for (const ch of text) {
    out += ch === BACKSLASH || ch === QUOTE ? BACKSLASH + ch : ch;
  }
  return out + QUOTE;
}

/** Keep at most `max` code points. Returns the text and whether it was cut. */
function truncate(text: string, max: number): { text: string; cut: boolean } {
  let count = 0;
  let end = 0;
  for (const ch of text) {
    if (count === max) return { text: text.slice(0, end), cut: true };
    count += 1;
    end += ch.length;
  }
  return { text, cut: false };
}

/** Plain-text report. Printable ASCII plus U+000A only. */
export function formatReport(report: BlacklightReport): string {
  const lines: string[] = [];
  for (const file of report.files) {
    const path = escapeAscii(file.path);
    for (const f of file.findings) {
      const cut = truncate(f.rendering, MAX_RENDERING_CODE_POINTS);
      const rendering = quote(escapeAscii(cut.text)) + (cut.cut ? TRUNCATED_MARK : '');
      lines.push(`${path}:${f.line}:${f.column} ${f.category} ${f.firstCodePoint} ${rendering}`);
    }
    if (file.error !== undefined) {
      lines.push(`${path}: error ${quote(escapeAscii(file.error))}`);
    }
  }
  lines.push(
    `outcome=${report.outcome} findings=${report.totalFindings} files=${report.files.length}`,
  );
  return lines.join(String.fromCharCode(0x0a));
}
