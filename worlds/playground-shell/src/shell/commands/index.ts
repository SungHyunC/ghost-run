import { echo, falseCmd, pwd, trueCmd } from './basic.js';
import { cat } from './cat.js';
import { find } from './find.js';
import { ls } from './ls.js';
import { mkdir } from './mkdir.js';
import { rm } from './rm.js';
import { curl } from './curl.js';
import { npm } from './npm.js';
import { sqlite3 } from './sqlite3.js';
import { cp, mv } from './transfer.js';
import { touch } from './touch.js';
import type { Handler } from './types.js';

/** The dispatch table. */
export const HANDLERS: ReadonlyMap<string, Handler> = new Map<string, Handler>([
  ['pwd', pwd],
  ['ls', ls],
  ['cat', cat],
  ['echo', echo],
  ['mkdir', mkdir],
  ['touch', touch],
  ['rm', rm],
  ['mv', mv],
  ['cp', cp],
  ['find', find],
  ['sqlite3', sqlite3],
  ['curl', curl],
  ['npm', npm],
  ['true', trueCmd],
  ['false', falseCmd],
]);
