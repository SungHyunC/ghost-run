// SQL executor interface. Implementations live in handle.ts, inline.ts, and watchdog.ts.

export interface SqlRequest {
  readonly dbBytes: Uint8Array | null;
  readonly sql: string;
  readonly outputLimit: number;
}

export type SqlResponse =
  | {
      readonly ok: true;
      readonly stdout: string;
      readonly dbBytes: Uint8Array;
      /** True when the exported bytes differ from the input (or from an empty database when the input was null). */
      readonly wrote: boolean;
      readonly tables: Readonly<Record<string, number>>;
    }
  | { readonly ok: false; readonly stderr: string; readonly watchdog?: true };

export interface SqlExecutor {
  run(request: SqlRequest): Promise<SqlResponse>;
}

export interface SqlRunner {
  run(request: SqlRequest): Promise<SqlResponse>;
  terminate(): void;
}
