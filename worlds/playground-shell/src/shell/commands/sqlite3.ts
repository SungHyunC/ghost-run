import { screenSql } from '../../sql/screen.js';
import { OUTPUT_MAX } from '../limits.js';
import { UNSUPPORTED, isParsed, parseArgs, type Handler } from './types.js';
import { parentProblem, resolveArg } from './util.js';

export const sqlite3: Handler = async (args, io, env) => {
  const parsed = parseArgs('sqlite3', args, []);
  if (!isParsed(parsed)) return parsed;
  if (parsed.operands.length !== 2) return UNSUPPORTED('sqlite3: expects a database file and one SQL text');
  const [dbArg, sql] = parsed.operands as [string, string];
  const reason = screenSql(sql);
  if (reason !== null) return UNSUPPORTED(`sqlite3: ${reason}`);

  const r = resolveArg(dbArg, env);
  if (!r.ok) {
    io.err(`sqlite3: ${dbArg}: ${r.message}\n`);
    return 1;
  }
  const entry = r.path === '' ? ({ kind: 'dir' } as const) : env.fs.get(r.path);
  if (entry?.kind === 'dir') {
    io.err(`Error: unable to open database file\n`);
    return 1;
  }
  if (entry === undefined) {
    const problem = parentProblem(r.path, env);
    if (problem !== undefined) {
      io.err(`Error: unable to open database file\n`);
      return 1;
    }
  } else {
    env.trace.recordRead(r.path);
  }

  const dbBytes = entry !== undefined && entry.bytes.byteLength > 0 ? entry.bytes : null;
  const res = await env.sql.run({ dbBytes, sql, outputLimit: OUTPUT_MAX });
  if (!res.ok) {
    io.err(res.stderr.endsWith('\n') ? res.stderr : `${res.stderr}\n`);
    if (res.watchdog === true) {
      io.watchdog = true;
      env.trace.markWatchdog();
    }
    return 1;
  }
  io.out(res.stdout);
  if (res.wrote) env.fs.putFile(r.path, res.dbBytes, res.tables);
  return 0;
};
