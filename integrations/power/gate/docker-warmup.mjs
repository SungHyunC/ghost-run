import { createRequire as __ghostRunCreateRequire } from 'node:module';
const require = __ghostRunCreateRequire(import.meta.url);

// integrations/kiro-hook/lib/warmup.mjs
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
var nowMs = () => performance.timeOrigin + performance.now();
var THROTTLE_MS = 6e4;
var WARMUP_ARGS = Object.freeze(["info", "--format", "{{.ServerVersion}}"]);
function stampPath(tmp, cwd) {
  const key = createHash("sha256").update(cwd).digest("hex").slice(0, 16);
  return join(tmp, "ghost-run", `warmup-${key}.stamp`);
}
function warmUp(cwd, deps = {}) {
  try {
    const now = (deps.now ?? nowMs)();
    const stamp = stampPath(deps.tmp ?? tmpdir(), cwd);
    try {
      if (now - statSync(stamp).mtimeMs < THROTTLE_MS) return false;
    } catch {
    }
    mkdirSync(join(stamp, ".."), { recursive: true });
    writeFileSync(stamp, "");
    utimesSync(stamp, now / 1e3, now / 1e3);
    const child = (deps.spawn ?? spawn)("docker", [...WARMUP_ARGS], {
      detached: true,
      stdio: "ignore",
      shell: false,
      windowsHide: true
    });
    child.on?.("error", () => {
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// integrations/kiro-hook/docker-warmup.mjs
try {
  warmUp(process.cwd());
} catch {
}
process.exit(0);
