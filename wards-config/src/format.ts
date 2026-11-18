import type { ConfigError } from './types.js';

/**
 * Formats one error as
 * `wards.yaml:<line>:<column>: [<code>] ward "<id>" field "<field>": <message>`.
 * The `ward` and `field` parts are omitted when unknown. Without a position the
 * prefix is `wards.yaml:`. Pure string assembly.
 */
export function formatConfigError(e: ConfigError): string {
  let prefix = 'wards.yaml';
  if (e.line !== undefined) {
    prefix += `:${e.line}`;
    if (e.column !== undefined) prefix += `:${e.column}`;
  }
  let head = `${prefix}: [${e.code}]`;
  if (e.wardId !== undefined) head += ` ward "${e.wardId}"`;
  if (e.field !== undefined) head += ` field "${e.field}"`;
  return `${head}: ${e.message}`;
}
