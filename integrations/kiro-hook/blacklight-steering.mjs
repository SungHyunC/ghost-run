// blacklight-steering hook (PostFileSave). Scans the one saved `.kiro/` file for hidden characters.
// Reads one JSON event from STDIN (field `file_path`), prints the report on STDOUT (and on STDERR
// when not clean), and writes it to .ghost-run/blacklight/last.txt. It reports and never blocks.
// Exit code: exitCodeFor(outcome) (0 clean, 1 findings, 2 error). With `--all` it scans all of .kiro/
// (the `blacklight` package script). Neither CLI 3.4.0 nor IDE 1.4.215 passes file-event STDOUT to the
// agent, so read last.txt. Files saved by a shell command fire no file event (known limit).
import { STDIN_MAX_BYTES } from './gate-config.mjs';
import { readStdinBounded } from './lib/hook-io.mjs';
import { runBlacklightAll, runBlacklightHook } from './lib/blacklight/run.mjs';

const watchdog = setTimeout(() => process.exit(2), 5_000);
watchdog.unref();

let exit = 0;
try {
  const outcome = process.argv.includes('--all')
    ? await runBlacklightAll(process.cwd())
    : await runBlacklightHook(await readStdinBounded(process.stdin, STDIN_MAX_BYTES), process.cwd());
  if (outcome.stdout !== '') process.stdout.write(outcome.stdout);
  if (outcome.stderr !== '') process.stderr.write(outcome.stderr);
  exit = outcome.exit;
} catch {
  process.stderr.write('blacklight-steering: internal error; no file was changed by the error path.\n');
  exit = 2;
}
process.exitCode = exit;
