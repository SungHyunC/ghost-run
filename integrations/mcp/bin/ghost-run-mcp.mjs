#!/usr/bin/env node
import { startStdioServer } from '../src/server.mjs';

startStdioServer().catch((err) => {
  process.stderr.write(`[ghost-run-mcp] fatal: ${err instanceof Error ? err.message : 'start failed'}\n`);
  process.exit(1);
});
