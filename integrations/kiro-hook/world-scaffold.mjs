// world-scaffold hook (PostFileCreate). Creates the missing registration files of a new world.
// Reads one JSON event from STDIN (field `file_path`), prints a short summary, and writes the same
// summary to .ghost-run/scaffold/last.json. Always exits 0: a file-event hook cannot undo a create.
// Neither CLI 3.4.0 nor IDE 1.4.215 passes hook STDOUT to the agent, so read the record file.
// Files created by a shell command fire no file event (known limit).
import { STDIN_MAX_BYTES } from './gate-config.mjs';
import { readStdinBounded } from './lib/hook-io.mjs';
import { runScaffold } from './lib/scaffold/run.mjs';

const watchdog = setTimeout(() => process.exit(0), 5_000);
watchdog.unref();

try {
  const text = await readStdinBounded(process.stdin, STDIN_MAX_BYTES);
  const { stdout } = await runScaffold(text, process.cwd());
  if (stdout !== '') process.stdout.write(stdout);
} catch {
  process.stderr.write('world-scaffold: internal error; no file was changed by the error path.\n');
}
process.exitCode = 0;
