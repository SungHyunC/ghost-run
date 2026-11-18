import { parseProvenanceLog } from '@ghost-run/core';
import type { ProvenanceLog } from '@ghost-run/core';
import type { PlaygroundAction } from '@ghost-run/playground-shell';
import { codePointLength, commandProblem, hasInvalidCharacter } from './validate-command';

export const PLAN_FILE_MAX = 1024 * 1024;
export const ERRORS_MAX = 50;
const NAME_MAX = 80;
const NOTE_MAX = 500;
const READINGS_MAX = 16;
const ACTIONS_MAX = 50;

export type PlanErrorCode =
  | 'input-too-large'
  | 'invalid-json'
  | 'wrong-type'
  | 'missing-field'
  | 'unknown-field'
  | 'unsupported-version'
  | 'out-of-range'
  | 'conflicting-fields'
  | 'invalid-character';

export interface PlanFile {
  readonly format: 'ghost-run-plan';
  readonly version: 1;
  readonly name: string;
  readonly origin: 'recorded' | 'scripted';
  readonly actions: readonly PlaygroundAction[];
  readonly note?: string;
  readonly provenance?: ProvenanceLog;
  readonly readings?: readonly string[];
}

export type PlanParseError = { code: PlanErrorCode; message: string; field: string };
export type PlanParseResult = { ok: true; plan: PlanFile } | { ok: false; errors: PlanParseError[] };

const ROOT_KEYS = ['format', 'version', 'name', 'origin', 'actions', 'note', 'provenance', 'readings'];
const ACTION_KEYS = ['command', 'cwd'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function has(o: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  return Array.isArray(v) ? 'array' : typeof v;
}

function provenanceCode(message: string): PlanErrorCode {
  if (message.startsWith('unknown field')) return 'unknown-field';
  if (message.includes('got undefined')) return 'missing-field';
  if (message.includes('must not be empty')) return 'out-of-range';
  return 'wrong-type';
}

/** Parses and validates a Plan_File. Never throws; collects at most 50 errors. */
export function parsePlanFile(text: string): PlanParseResult {
  const errors: PlanParseError[] = [];
  const add = (code: PlanErrorCode, field: string, message: string): void => {
    if (errors.length < ERRORS_MAX) errors.push({ code, field, message });
  };

  if (text.length > PLAN_FILE_MAX || new TextEncoder().encode(text).length > PLAN_FILE_MAX) {
    return { ok: false, errors: [{ code: 'input-too-large', field: '', message: 'plan file is larger than 1 MiB' }] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [{ code: 'invalid-json', field: '', message: `invalid JSON: ${detail}` }] };
  }
  if (!isObject(raw)) {
    return { ok: false, errors: [{ code: 'wrong-type', field: '', message: `root must be an object, got ${describe(raw)}` }] };
  }

  // Phase 1: types and missing fields.
  const required = ['format', 'version', 'name', 'origin', 'actions'];
  for (const k of required) if (!has(raw, k)) add('missing-field', k, `missing field ${k}`);
  if (has(raw, 'format') && raw['format'] !== 'ghost-run-plan') {
    add('wrong-type', 'format', 'format must be the string ghost-run-plan');
  }
  if (has(raw, 'version') && typeof raw['version'] !== 'number') add('wrong-type', 'version', 'version must be a number');
  if (has(raw, 'name') && typeof raw['name'] !== 'string') add('wrong-type', 'name', 'name must be a string');
  if (has(raw, 'origin') && raw['origin'] !== 'recorded' && raw['origin'] !== 'scripted') {
    add('wrong-type', 'origin', 'origin must be recorded or scripted');
  }
  if (has(raw, 'note') && typeof raw['note'] !== 'string') add('wrong-type', 'note', 'note must be a string');
  const actionsRaw = raw['actions'];
  const goodActions: PlaygroundAction[] = [];
  if (has(raw, 'actions')) {
    if (!Array.isArray(actionsRaw)) add('wrong-type', 'actions', 'actions must be an array');
    else {
      actionsRaw.forEach((a: unknown, i: number) => {
        const f = `actions[${i}]`;
        if (!isObject(a)) return add('wrong-type', f, `action must be an object, got ${describe(a)}`);
        if (!has(a, 'command')) add('missing-field', `${f}.command`, 'missing field command');
        else if (typeof a['command'] !== 'string') add('wrong-type', `${f}.command`, 'command must be a string');
        if (has(a, 'cwd') && typeof a['cwd'] !== 'string') add('wrong-type', `${f}.cwd`, 'cwd must be a string');
      });
    }
  }
  const readingsRaw = raw['readings'];
  if (has(raw, 'readings')) {
    if (!Array.isArray(readingsRaw)) add('wrong-type', 'readings', 'readings must be an array');
    else {
      readingsRaw.forEach((r: unknown, i: number) => {
        if (typeof r !== 'string') add('wrong-type', `readings[${i}]`, 'reading must be a string');
      });
    }
  }
  let provenance: ProvenanceLog | undefined;
  const provenanceErrors: PlanParseError[] = [];
  if (has(raw, 'provenance')) {
    const p = parseProvenanceLog(JSON.stringify(raw['provenance']) ?? 'null');
    if (p.ok) provenance = p.log;
    else {
      for (const e of p.errors) {
        const field =
          e.index === undefined
            ? 'provenance'
            : e.field === undefined
              ? `provenance[${e.index}]`
              : `provenance[${e.index}].${e.field}`;
        provenanceErrors.push({ code: provenanceCode(e.message), field, message: e.message });
      }
    }
  }
  // Provenance errors keep their place in the type phase, after the other type errors.
  for (const e of provenanceErrors) {
    if (e.code === 'unknown-field') continue;
    add(e.code, e.field, e.message);
  }

  // Phase 2: unknown fields (root and provenance records, then actions).
  for (const k of Object.keys(raw)) if (!ROOT_KEYS.includes(k)) add('unknown-field', k, `unknown field ${JSON.stringify(k)}`);
  for (const e of provenanceErrors) if (e.code === 'unknown-field') add(e.code, e.field, e.message);
  if (Array.isArray(actionsRaw)) {
    actionsRaw.forEach((a: unknown, i: number) => {
      if (!isObject(a)) return;
      for (const k of Object.keys(a)) {
        if (!ACTION_KEYS.includes(k)) add('unknown-field', `actions[${i}].${k}`, `unknown field ${JSON.stringify(k)}`);
      }
    });
  }

  // Phase 3: version.
  if (typeof raw['version'] === 'number' && raw['version'] !== 1) {
    add('unsupported-version', 'version', `unsupported version ${String(raw['version'])}`);
  }

  // Phase 4: ranges.
  const name = raw['name'];
  if (typeof name === 'string') {
    const n = codePointLength(name);
    if (n < 1 || n > NAME_MAX) add('out-of-range', 'name', `name must have 1 to ${NAME_MAX} code points`);
  }
  const note = raw['note'];
  if (typeof note === 'string' && codePointLength(note) > NOTE_MAX) {
    add('out-of-range', 'note', `note must have at most ${NOTE_MAX} code points`);
  }
  if (Array.isArray(actionsRaw)) {
    if (actionsRaw.length < 1 || actionsRaw.length > ACTIONS_MAX) {
      add('out-of-range', 'actions', `actions must have 1 to ${ACTIONS_MAX} entries`);
    }
    actionsRaw.forEach((a: unknown, i: number) => {
      if (isObject(a) && typeof a['command'] === 'string' && commandProblem(a['command']) === 'out-of-range') {
        add('out-of-range', `actions[${i}].command`, 'command must have 1 to 4,096 code points');
      }
    });
  }
  if (Array.isArray(readingsRaw) && readingsRaw.length > READINGS_MAX) {
    add('out-of-range', 'readings', `readings must have at most ${READINGS_MAX} entries`);
  }

  // Phase 5: conflicts.
  if (has(raw, 'provenance') && has(raw, 'readings')) {
    add('conflicting-fields', 'readings', 'provenance and readings must not both be present');
  }

  // Phase 6: characters.
  const badChars = (v: unknown, field: string): void => {
    if (typeof v === 'string' && hasInvalidCharacter(v)) {
      add('invalid-character', field, 'contains a control or hidden character');
    }
  };
  if (Array.isArray(actionsRaw)) {
    actionsRaw.forEach((a: unknown, i: number) => {
      if (!isObject(a)) return;
      badChars(a['command'], `actions[${i}].command`);
      badChars(a['cwd'], `actions[${i}].cwd`);
    });
  }
  badChars(name, 'name');
  badChars(note, 'note');

  if (errors.length > 0) return { ok: false, errors };

  for (const a of actionsRaw as Record<string, unknown>[]) {
    const cwd = a['cwd'];
    goodActions.push(typeof cwd === 'string' ? { command: a['command'] as string, cwd } : { command: a['command'] as string });
  }
  const plan: PlanFile = {
    format: 'ghost-run-plan',
    version: 1,
    name: name as string,
    origin: raw['origin'] as 'recorded' | 'scripted',
    actions: goodActions,
    ...(typeof note === 'string' ? { note } : {}),
    ...(provenance === undefined ? {} : { provenance }),
    ...(Array.isArray(readingsRaw) ? { readings: readingsRaw as string[] } : {}),
  };
  return { ok: true, plan };
}
