// Plan_File parser and printer (requirements 7.5-7.10, 11.1-11.3).
// Pure functions. A Plan_File carries no clock value, session identifier, verdict, or trajectory.

import { validateAction } from '@ghost-run/drawer-arm';
import type { GhostHandAction } from '@ghost-run/drawer-arm';
import { isHiddenDisplay } from '@ghost-run/ui';

export interface FileError {
  readonly code: string;
  readonly message: string;
  readonly field: string;
}

export type PlanOrigin = 'recorded' | 'scripted';

export interface PlanFile {
  readonly format: 'ghost-hand-plan';
  readonly version: 1;
  readonly name: string; // 1 to 80 code points
  readonly origin: PlanOrigin;
  readonly actions: readonly GhostHandAction[]; // 1 to 50
  readonly note?: string; // at most 500
  readonly recordedWith?: string; // at most 120
  readonly revisionOf?: string; // a plan name, at most 80
  readonly taskText?: string; // at most 4096
}

export type ParsePlanResult =
  | { readonly ok: true; readonly plan: PlanFile }
  | { readonly ok: false; readonly errors: readonly FileError[] };

export const MAX_PLAN_FILE_BYTES = 1024 * 1024;
export const MAX_ACTIONS = 50;

const ROOT_KEYS = [
  'format',
  'version',
  'name',
  'origin',
  'actions',
  'note',
  'recordedWith',
  'revisionOf',
  'taskText',
] as const;

const ACTION_KEYS: Record<string, readonly string[]> = {
  reach: ['type', 'target', 'speed'],
  grasp: ['type', 'force'],
  pull: ['type', 'distance', 'speed'],
  release: ['type'],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function has(o: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function codePointCount(s: string): number {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
}

function hasForbiddenCodePoint(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || isHiddenDisplay(cp)) return true;
  }
  return false;
}

function utf8Length(text: string): number {
  if (text.length > MAX_PLAN_FILE_BYTES) return text.length;
  return new TextEncoder().encode(text).length;
}

function norm(n: number): number {
  return n === 0 ? 0 : n;
}

function parseAction(raw: unknown, index: number, errors: FileError[]): GhostHandAction | null {
  const at = `actions[${String(index)}]`;
  if (!isRecord(raw)) {
    errors.push({ code: 'wrong-type', message: 'action must be an object', field: at });
    return null;
  }
  if (!has(raw, 'type')) {
    errors.push({ code: 'missing-field', message: 'action has no type', field: `${at}.type` });
    return null;
  }
  const type = raw['type'];
  if (typeof type !== 'string') {
    errors.push({ code: 'wrong-type', message: 'type must be a string', field: `${at}.type` });
    return null;
  }
  const keys = Object.prototype.hasOwnProperty.call(ACTION_KEYS, type) ? ACTION_KEYS[type] : undefined;
  if (keys === undefined) {
    errors.push({
      code: 'unknown-action',
      message: 'type must be one of reach, grasp, pull, release',
      field: `${at}.type`,
    });
    return null;
  }
  const before = errors.length;
  for (const k of Object.keys(raw)) {
    if (!keys.includes(k)) {
      errors.push({ code: 'unknown-field', message: `unknown field ${k}`, field: `${at}.${k}` });
    }
  }
  const num = (k: string): number => {
    if (!has(raw, k)) {
      errors.push({ code: 'missing-field', message: `${k} is required`, field: `${at}.${k}` });
      return 0;
    }
    const v = raw[k];
    if (typeof v !== 'number') {
      errors.push({ code: 'wrong-type', message: `${k} must be a number`, field: `${at}.${k}` });
      return 0;
    }
    return norm(v);
  };
  let rebuilt: Record<string, unknown>;
  switch (type) {
    case 'reach': {
      let target: [number, number, number] = [0, 0, 0];
      if (!has(raw, 'target')) {
        errors.push({ code: 'missing-field', message: 'target is required', field: `${at}.target` });
      } else {
        const t = raw['target'];
        if (!Array.isArray(t) || t.length !== 3 || !t.every((x) => typeof x === 'number')) {
          errors.push({
            code: 'wrong-type',
            message: 'target must be an array of 3 numbers',
            field: `${at}.target`,
          });
        } else {
          target = [norm(t[0] as number), norm(t[1] as number), norm(t[2] as number)];
        }
      }
      rebuilt = { type, target, speed: num('speed') };
      break;
    }
    case 'grasp':
      rebuilt = { type, force: num('force') };
      break;
    case 'pull':
      rebuilt = { type, distance: num('distance'), speed: num('speed') };
      break;
    default:
      rebuilt = { type };
  }
  if (errors.length > before) return null;
  const check = validateAction(rebuilt);
  if (!check.ok) {
    errors.push({ code: 'out-of-range', message: check.error, field: at });
    return null;
  }
  return rebuilt as unknown as GhostHandAction;
}

/** Parses Plan_File text. Never throws. */
export function parsePlanFile(text: string): ParsePlanResult {
  try {
    return parseUnsafe(text);
  } catch {
    return {
      ok: false,
      errors: [{ code: 'invalid-json', message: 'the text could not be parsed', field: '' }],
    };
  }
}

function parseUnsafe(text: string): ParsePlanResult {
  if (utf8Length(text) > MAX_PLAN_FILE_BYTES) {
    return {
      ok: false,
      errors: [{ code: 'input-too-large', message: 'the plan file is larger than 1 MiB', field: '' }],
    };
  }
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ code: 'invalid-json', message: 'the text is not valid JSON', field: '' }] };
  }
  if (!isRecord(root)) {
    return { ok: false, errors: [{ code: 'wrong-type', message: 'the root must be an object', field: '' }] };
  }
  const errors: FileError[] = [];
  for (const k of Object.keys(root)) {
    if (!(ROOT_KEYS as readonly string[]).includes(k)) {
      errors.push({ code: 'unknown-field', message: `unknown field ${k}`, field: k });
    }
  }
  for (const k of ['format', 'version', 'name', 'origin', 'actions'] as const) {
    if (!has(root, k)) errors.push({ code: 'missing-field', message: `${k} is required`, field: k });
  }

  if (has(root, 'format')) {
    if (typeof root['format'] !== 'string') {
      errors.push({ code: 'wrong-type', message: 'format must be a string', field: 'format' });
    } else if (root['format'] !== 'ghost-hand-plan') {
      errors.push({ code: 'unsupported-version', message: 'format must be ghost-hand-plan', field: 'format' });
    }
  }
  if (has(root, 'version')) {
    if (typeof root['version'] !== 'number') {
      errors.push({ code: 'wrong-type', message: 'version must be a number', field: 'version' });
    } else if (root['version'] !== 1) {
      errors.push({ code: 'unsupported-version', message: 'version must be 1', field: 'version' });
    }
  }

  const str = (k: string, min: number, max: number, forbid: boolean): string | undefined => {
    if (!has(root, k)) return undefined;
    const v = root[k];
    if (typeof v !== 'string') {
      errors.push({ code: 'wrong-type', message: `${k} must be a string`, field: k });
      return undefined;
    }
    const n = codePointCount(v);
    if (n < min || n > max) {
      errors.push({
        code: 'out-of-range',
        message: `${k} must have ${String(min)} to ${String(max)} code points`,
        field: k,
      });
      return undefined;
    }
    if (forbid && hasForbiddenCodePoint(v)) {
      errors.push({
        code: 'invalid-character',
        message: `${k} contains a control or hidden character`,
        field: k,
      });
      return undefined;
    }
    return v;
  };

  const name = str('name', 1, 80, true);
  const note = str('note', 0, 500, true);
  const recordedWith = str('recordedWith', 0, 120, true);
  const revisionOf = str('revisionOf', 0, 80, true);
  const taskText = str('taskText', 0, 4096, false);

  let origin: PlanOrigin | undefined;
  if (has(root, 'origin')) {
    const o = root['origin'];
    if (typeof o !== 'string') {
      errors.push({ code: 'wrong-type', message: 'origin must be a string', field: 'origin' });
    } else if (o !== 'recorded' && o !== 'scripted') {
      errors.push({ code: 'wrong-type', message: 'origin must be recorded or scripted', field: 'origin' });
    } else {
      origin = o;
    }
  }

  const actions: GhostHandAction[] = [];
  if (has(root, 'actions')) {
    const a = root['actions'];
    if (!Array.isArray(a)) {
      errors.push({ code: 'wrong-type', message: 'actions must be an array', field: 'actions' });
    } else if (a.length < 1 || a.length > MAX_ACTIONS) {
      errors.push({
        code: 'out-of-range',
        message: `actions must have 1 to ${String(MAX_ACTIONS)} entries`,
        field: 'actions',
      });
    } else {
      a.forEach((raw, i) => {
        const act = parseAction(raw, i, errors);
        if (act !== null) actions.push(act);
      });
    }
  }

  if (errors.length > 0 || name === undefined || origin === undefined) {
    return { ok: false, errors };
  }
  const plan: PlanFile = {
    format: 'ghost-hand-plan',
    version: 1,
    name,
    origin,
    actions,
    ...(note !== undefined ? { note } : {}),
    ...(recordedWith !== undefined ? { recordedWith } : {}),
    ...(revisionOf !== undefined ? { revisionOf } : {}),
    ...(taskText !== undefined ? { taskText } : {}),
  };
  return { ok: true, plan };
}

function printAction(a: GhostHandAction): Record<string, unknown> {
  switch (a.type) {
    case 'reach':
      return { type: a.type, target: [a.target[0], a.target[1], a.target[2]], speed: a.speed };
    case 'grasp':
      return { type: a.type, force: a.force };
    case 'pull':
      return { type: a.type, distance: a.distance, speed: a.speed };
    case 'release':
      return { type: a.type };
  }
}

/** Canonical text: fixed key order, two-space indent, ASCII only (code units above 0x7E escaped), trailing newline. */
export function printPlanFile(plan: PlanFile): string {
  const obj: Record<string, unknown> = {
    format: plan.format,
    version: plan.version,
    name: plan.name,
    origin: plan.origin,
    actions: plan.actions.map(printAction),
  };
  if (plan.note !== undefined) obj['note'] = plan.note;
  if (plan.recordedWith !== undefined) obj['recordedWith'] = plan.recordedWith;
  if (plan.revisionOf !== undefined) obj['revisionOf'] = plan.revisionOf;
  if (plan.taskText !== undefined) obj['taskText'] = plan.taskText;
  const json = JSON.stringify(obj, null, 2).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return `${json}\n`;
}
