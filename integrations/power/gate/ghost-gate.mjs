// integrations/kiro-hook/gate-config.mjs
var WATCHDOG_MS = 5e4;
var STDIN_MAX_BYTES = 1048576;
var STORE_CAPS = Object.freeze({
  sessions: 20,
  runs: 200,
  graveyardLines: 2e3,
  provenancePerSession: 1e3,
  recordBytes: 1048576
});
var FILE_EVENT_PATH_FIELDS = Object.freeze(["file_path"]);
var POST_RESPONSE_FIELDS = Object.freeze(["tool_response"]);

// integrations/kiro-hook/lib/hook-io.mjs
var FATAL_LINES = Object.freeze({
  unavailable: "GHOST RUN GATE UNAVAILABLE: build the packages first (pnpm -r build).",
  "internal-error": "GHOST RUN GATE ERROR: internal-error; the tool call was not allowed.",
  timeout: "GHOST RUN GATE TIMEOUT: no verdict within 50 s; the tool call was not allowed."
});
var BUNDLED_UNAVAILABLE_LINE = "GHOST RUN GATE UNAVAILABLE: the installed gate is missing or damaged; run the installer again with --force (node <repository>/integrations/power/install-gate.mjs --force).";
var BUNDLED = true;
var processIo = {
  stdout: (text, cb) => {
    process.stdout.write(text, cb);
  },
  stderr: (text, cb) => {
    process.stderr.write(text, cb);
  },
  exit: (code) => process.exit(code)
};
async function readStdinBounded(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) {
      throw { code: "too-large" };
    }
    chunks.push(bytes);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(all);
}
function finish(outcome, io = processIo) {
  const code = outcome.exit === 0 ? 0 : 2;
  const stdout = typeof outcome.stdout === "string" ? outcome.stdout : "";
  const stderr = typeof outcome.stderr === "string" ? outcome.stderr : "";
  io.stdout(stdout, () => {
    io.stderr(stderr, () => io.exit(code));
  });
}
function fatal(kind, io = processIo) {
  const known = Object.hasOwn(FATAL_LINES, kind) ? kind : "internal-error";
  const line = BUNDLED && known === "unavailable" ? BUNDLED_UNAVAILABLE_LINE : FATAL_LINES[known];
  finish({ exit: 2, stdout: "", stderr: `${line}
` }, io);
}
async function runHook(name, load, opts = {}) {
  void name;
  const io = opts.io ?? processIo;
  const proc = opts.proc ?? process;
  const onFault = () => fatal("internal-error", io);
  proc.on("uncaughtException", onFault);
  proc.on("unhandledRejection", onFault);
  let text;
  try {
    text = await readStdinBounded(opts.stdin ?? process.stdin, opts.maxBytes ?? STDIN_MAX_BYTES);
  } catch {
    return fatal("internal-error", io);
  }
  let mod;
  try {
    mod = await load();
  } catch {
    return fatal("unavailable", io);
  }
  try {
    const outcome = await mod.run(text);
    return finish(outcome, io);
  } catch {
    return fatal("internal-error", io);
  }
}

// integrations/kiro-hook/ghost-gate.mjs
var gate;
setTimeout(() => {
  void (async () => {
    try {
      await gate?.cleanupOnTimeout?.();
    } catch {
    }
    fatal("timeout");
  })();
}, WATCHDOG_MS);
await runHook("ghost-gate", async () => {
  const mod = await import("./gate-main.mjs");
  gate = mod;
  return mod;
});
