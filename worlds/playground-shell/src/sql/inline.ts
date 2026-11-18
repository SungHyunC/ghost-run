// In-process executor (tests, jsdom). Wraps an already initialized sql.js module only.
import initSqlJs from 'sql.js';
import type { InitSqlJsConfig, SqlJsStatic } from 'sql.js';
import type { SqlExecutor, SqlRequest, SqlResponse } from './executor';
import { handleSqlRequest } from './handle';

export class InlineSqlExecutor implements SqlExecutor {
  private readonly SQL: SqlJsStatic;

  constructor(SQL: SqlJsStatic) {
    this.SQL = SQL;
  }

  run(request: SqlRequest): Promise<SqlResponse> {
    return Promise.resolve(handleSqlRequest(this.SQL, request));
  }
}

export async function initInlineSql(config?: InitSqlJsConfig): Promise<InlineSqlExecutor> {
  return new InlineSqlExecutor(await initSqlJs(config));
}
