#!/usr/bin/env node
/**
 * exp-b-gate.mjs  — Experiment B gate logic (Node 20, no deps)
 *
 * Usage:
 *   node exp-b-gate.mjs shell   — block rm -rf variants in shell commands
 *   node exp-b-gate.mjs write   — block tool_name values containing "delete"
 *
 * Reads full STDIN, appends a timestamped line to LOG_FILE, then
 * exits 2 (blocked) or 0 (allowed).  Empty / non-JSON STDIN is
 * always logged and always exits 0 (never crashes the hook).
 */

import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const LOG_FILE = "/tmp/ghost-run-exp-b.log";
const mode = process.argv[2]; // "shell" | "write"

// ── 1. Read STDIN ────────────────────────────────────────────────────────────
let raw = "";
try {
  raw = readFileSync("/dev/stdin", "utf8").trim();
} catch {
  // stdin unavailable — treat as empty
}

// ── 2. Append to log ─────────────────────────────────────────────────────────
const ts = new Date().toISOString();
const logLine = `${ts} [${mode ?? "?"}] ${raw.replace(/\n/g, " ").slice(0, 2000)}\n`;
try {
  appendFileSync(LOG_FILE, logLine);
} catch {
  // log write failure must never block the hook
}

// ── 3. Parse JSON (best-effort) ───────────────────────────────────────────────
let payload = null;
try {
  if (raw) payload = JSON.parse(raw);
} catch {
  // non-JSON STDIN → payload stays null
}

// ── 4. Gate logic ─────────────────────────────────────────────────────────────
if (mode === "shell") {
  /**
   * Block if the shell command string contains any rm -rf variant:
   *   rm -rf, rm -fr, rm -r -f, rm -f -r  (flags in any order, with optional extras)
   * We search the full raw STDIN string so we don't need to know the exact field name.
   */
  const haystack = raw;

  // Matches: rm followed by any flag group that includes both r and f
  // e.g. -rf, -fr, -r -f, -f -r, -rf --no-preserve-root …
  const rmRfPattern = /\brm\b(?:\s+-\S*)*\s+-\S*[rf]\S*(?:\s+-\S*)*(?=\s|$)/i;

  // Simpler targeted check: does the full text contain rm … with both -r and -f flags?
  function hasRmRf(text) {
    // Split on potential command boundaries and test each segment
    const segments = text.split(/[;&|`\n]/);
    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!/\brm\b/.test(trimmed)) continue;
      // Collect all flag tokens after rm
      const flags = [...trimmed.matchAll(/-([a-zA-Z]+)/g)]
        .flatMap(m => m[1].split(""))
        .join("");
      if (flags.includes("r") && flags.includes("f")) return true;
    }
    return false;
  }

  if (hasRmRf(haystack)) {
    process.stderr.write(
      "GHOST RUN EXP-B: blocked rm -rf (Pre Tool Use hook)\n"
    );
    process.exit(2);
  }
  process.exit(0);
}

if (mode === "write") {
  /**
   * Block only when the tool_name field (or any top-level string field whose
   * key contains "tool" or "name") contains the substring "delete".
   * File contents are intentionally not inspected.
   */
  if (payload !== null && typeof payload === "object") {
    // Collect candidate field values: tool_name, toolName, tool, name, type, …
    const candidates = Object.entries(payload)
      .filter(([k]) => /tool|name|type/i.test(k))
      .map(([, v]) => (typeof v === "string" ? v : ""));

    const hasDelete = candidates.some(v => v.toLowerCase().includes("delete"));
    if (hasDelete) {
      process.stderr.write(
        "GHOST RUN EXP-B: blocked file delete (Pre Tool Use hook)\n"
      );
      process.exit(2);
    }
  } else if (payload === null) {
    // Non-JSON: log already written, never block
    process.exit(0);
  }
  process.exit(0);
}

// Unknown mode — log was written, exit cleanly
process.exit(0);
