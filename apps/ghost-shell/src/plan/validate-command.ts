import { isHiddenDisplay } from '../ui-imports';

export const COMMAND_MAX = 4096;
export const PLAN_MAX = 50;

export type TextProblem = 'out-of-range' | 'invalid-character';

/** True for U+0000 to U+001F and U+007F to U+009F. */
export function isControlCodePoint(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
}

/** Counts code points (a surrogate pair counts once). */
export function codePointLength(text: string): number {
  let n = 0;
  for (const _ of text) n += 1;
  return n;
}

/** True when the text holds a control code point or a Hidden_Display_Code_Point. */
export function hasInvalidCharacter(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isControlCodePoint(cp) || isHiddenDisplay(cp)) return true;
  }
  return false;
}

/** Shared per-field check of a command: length 1 to 4,096 code points, then characters. */
export function commandProblem(text: string): TextProblem | undefined {
  const n = codePointLength(text);
  if (n < 1 || n > COMMAND_MAX) return 'out-of-range';
  return hasInvalidCharacter(text) ? 'invalid-character' : undefined;
}

/**
 * Validates one typed command before it is added to a plan that already has `planLength`
 * actions (Requirement 14.3). Returns an error text, or `undefined` when the command is fine.
 */
export function validateCommand(text: string, planLength: number): string | undefined {
  if (planLength >= PLAN_MAX) return `The plan has ${PLAN_MAX} actions already (limit ${PLAN_MAX}).`;
  const problem = commandProblem(text);
  if (problem === 'invalid-character') return 'The command contains a control or hidden character.';
  if (problem === 'out-of-range') {
    return text.length === 0
      ? 'The command is empty.'
      : `The command is longer than ${COMMAND_MAX} code points.`;
  }
  return undefined;
}
