import { createRequire as __ghostRunCreateRequire } from 'node:module';
const require = __ghostRunCreateRequire(import.meta.url);

// integrations/kiro-hook/seance.mjs
import path2 from "node:path";

// integrations/kiro-hook/lib/seance/server.mjs
import http from "node:http";

// integrations/kiro-hook/lib/store/ghost-store.mjs
import fsp from "node:fs/promises";
import path from "node:path";

// integrations/kiro-hook/gate-config.mjs
var STORE_CAPS = Object.freeze({
  sessions: 20,
  runs: 200,
  graveyardLines: 2e3,
  provenancePerSession: 1e3,
  recordBytes: 1048576
});
var FILE_EVENT_PATH_FIELDS = Object.freeze(["file_path"]);
var POST_RESPONSE_FIELDS = Object.freeze(["tool_response"]);

// integrations/kiro-hook/lib/store/ghost-store.mjs
function storePaths(root2) {
  const dir = path.join(root2, ".ghost-run");
  return {
    dir,
    graveyard: path.join(dir, "graveyard.jsonl"),
    stats: path.join(dir, "stats.jsonl"),
    runs: path.join(dir, "runs"),
    sessions: path.join(dir, "sessions"),
    pbt: path.join(dir, "pbt"),
    blacklight: path.join(dir, "blacklight"),
    probe: path.join(dir, "probe"),
    locks: path.join(dir, "locks")
  };
}
function readLines(text2) {
  const parts = text2.split("\n");
  const tail = (
    /** @type {string} */
    parts.pop()
  );
  const lines = parts.filter((p) => p !== "");
  return { lines, corrupt: tail === "" ? 0 : 1 };
}
async function readText(file) {
  try {
    return await fsp.readFile(file, "utf8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return "";
    throw err;
  }
}

// integrations/kiro-hook/lib/gate/grave.mjs
var RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
function isGraveTime(s) {
  if (typeof s !== "string") return false;
  const m = TIME_RE.exec(s);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= days;
}
function isGraveEntry(o) {
  if (o === null || typeof o !== "object" || Array.isArray(o)) return false;
  const e = (
    /** @type {Record<string, unknown>} */
    o
  );
  if (typeof e.id !== "string" || !RUN_ID_RE.test(e.id)) return false;
  if (typeof e.command !== "string" || !isGraveTime(e.recordedAt)) return false;
  if (!Array.isArray(e.wardIds) || !e.wardIds.every((w) => typeof w === "string")) return false;
  if (e.detail !== void 0 && (e.detail === null || typeof e.detail !== "object" || Array.isArray(e.detail))) return false;
  return true;
}
async function readGraveyard(file) {
  const { lines, corrupt: torn } = readLines(await readText(file));
  let corrupt = torn;
  const entries = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (isGraveEntry(parsed)) entries.push(parsed);
      else corrupt++;
    } catch {
      corrupt++;
    }
  }
  return { entries, corrupt };
}

// integrations/kiro-hook/lib/seance/render.mjs
import { createHash } from "node:crypto";
var MAX_LIST = 200;
var MAX_VALUE = 500;
var MAX_ITEMS = 50;
var STYLE = `
:root{--bg:#14111c;--surface:#1d1928;--fog:rgba(176,170,204,0.10);--text:#ece8f4;--muted:#b4adc6;--pass:#fff1d6;--warn:#ffc247;--block:#ff8585;--line:#8d86a6;--focus:#8ab4ff;--flame:#fff1d6}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5;color:var(--text);background:var(--bg) radial-gradient(ellipse at 50% -10%,#2a2340 0,var(--bg) 60%) no-repeat}
main{max-width:56rem;margin:0 auto}
header{display:flex;align-items:center;gap:12px;margin:0 0 20px;padding:0 0 12px;border-bottom:1px solid var(--line)}
header svg{flex:none}.brand{font-weight:700;letter-spacing:.02em}.brand span{color:var(--flame)}
.tag{margin-left:auto;color:var(--muted);font-size:.85rem}
h1{font-size:1.5rem;margin:0 0 12px}h2{font-size:1.1rem;margin:12px 0 4px}
section{margin:0 0 16px;padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
code,.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.9rem;overflow-wrap:anywhere}
pre.cmd{margin:8px 0;padding:12px;border-radius:6px;background:var(--bg);border:1px solid var(--line);font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere}
a{color:var(--focus)}a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
ul{padding-left:20px;margin:4px 0}.note{color:var(--muted)}
ul.graves{list-style:none;padding:0;margin:0}
.graves li{border-top:1px solid var(--line)}.graves li:first-child{border-top:0}
.graves a{display:grid;grid-template-columns:auto auto 1fr;gap:4px 12px;align-items:baseline;padding:8px 4px;text-decoration:none;color:var(--text)}
.graves a:hover{background:var(--fog)}
.graves .when{color:var(--muted)}.graves .wards{color:var(--muted)}.graves .first{grid-column:1 / 4}
.badge{display:inline-block;padding:1px 10px;border:1px solid currentColor;border-radius:999px;font-size:.8rem;font-weight:700;white-space:nowrap}
.candle{font-weight:700}.pass{color:var(--pass)}.warn{color:var(--warn)}.block{color:var(--block)}.unknown{color:var(--muted)}
`;
var CSP = `default-src 'none'; style-src 'sha256-${createHash("sha256").update(STYLE).digest("base64")}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var HIDDEN_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;
function text(v, max = MAX_VALUE) {
  let s = typeof v === "string" ? v : v === void 0 ? "" : JSON.stringify(v) ?? "";
  const cps = [...s];
  if (cps.length > max) s = `${cps.slice(0, max - 3).join("")}...`;
  s = s.replace(HIDDEN_RE, (c) => `\\u{${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`);
  return escapeHtml(s);
}
var HEADER = `<header><svg width="28" height="36" viewBox="0 0 28 36" role="img" aria-label="Ghost Run+ candle"><path d="M14 1c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="#fff1d6"/><rect x="9" y="19" width="10" height="15" rx="2" fill="#b4adc6"/><rect x="7" y="33" width="14" height="2" rx="1" fill="#8d86a6"/></svg><span class="brand">Ghost Run<span>+</span></span><span class="tag">Let your agent's ghost try it first.</span></header>`;
var MAX_COMMAND = 4096;
var LIST_COMMAND_MAX = 120;
function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${text(title)}</title><style>${STYLE}</style></head><body><main>${HEADER}${body}</main></body></html>
`;
}
function isObj(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
var CANDLE = { pass: "lit (pass)", warn: "flickering (warn)", block: "out (block)" };
function verdictHtml(verdict) {
  if (!isObj(verdict)) return '<section><h2>Verdict</h2><p class="note">No verdict was recorded.</p></section>';
  const v = typeof verdict.verdict === "string" && verdict.verdict in CANDLE ? verdict.verdict : void 0;
  const label = v === void 0 ? "unknown" : CANDLE[
    /** @type {'pass'|'warn'|'block'} */
    v
  ];
  const violations = Array.isArray(verdict.violations) ? verdict.violations.filter(isObj).slice(0, MAX_ITEMS) : [];
  const notices = Array.isArray(verdict.notices) ? verdict.notices.filter(isObj).slice(0, MAX_ITEMS) : [];
  let out = `<section><h2>Verdict</h2><p class="candle">Ward verdict <span class="badge ${v ?? "unknown"}">${text(label)}</span></p>`;
  out += "<h2>Wards</h2>";
  out += violations.length === 0 ? '<p class="note">No ward was violated.</p>' : `<ul>${violations.map((w) => `<li><code>${text(w.wardId)}</code> (${text(w.wardKind)}): ${text(w.reason)}</li>`).join("")}</ul>`;
  if (notices.length > 0) {
    out += `<h2>Needs approval</h2><ul>${notices.map((n) => `<li>${text(n.kind)}: ${text(n.reason)}</li>`).join("")}</ul>`;
  }
  return `${out}</section>`;
}
function changeLine(c) {
  if (!isObj(c)) return text(c);
  if (c.kind === "sql-row-count") {
    return `sql-row-count ${text(c.table)}: ${text(c.rowsBefore)} to ${text(c.rowsAfter)} rows${c.dropped === true ? " (table dropped)" : ""}`;
  }
  if (typeof c.path === "string") return `${text(c.kind)} ${text(c.path)}`;
  return text(c);
}
function changesHtml(changes) {
  const flat = Array.isArray(changes) ? changes.flatMap((step) => Array.isArray(step) ? step : [step]) : [];
  if (flat.length === 0) return '<section><h2>Diff summary</h2><p class="note">No change was recorded.</p></section>';
  const shown = flat.slice(0, MAX_ITEMS);
  const more = flat.length - shown.length;
  return `<section><h2>Diff summary</h2><ul>${shown.map((c) => `<li class="mono">${changeLine(c)}</li>`).join("")}</ul>${more > 0 ? `<p class="note">+${more} more changes.</p>` : ""}</section>`;
}
function claimsHtml(claims) {
  if (!isObj(claims)) return '<section><h2>Claims</h2><p class="note">No claims were recorded.</p></section>';
  const row = (k) => `<li>${k}: ${claims[`${k.toLowerCase()}Claimed`] === true ? "claimed" : "NOT claimed"}</li>`;
  const planB = claims.p1Claimed !== true ? '<p class="note">No ghost rehearsal in a sealed box took place for this run (static analysis only). P1, P5, and P6 are not guaranteed.</p>' : "";
  return `<section><h2>Claims</h2><p>Isolation mode: <code>${text(claims.mode)}</code></p><ul>${row("P1")}${row("P5")}${row("P6")}</ul>${planB}</section>`;
}
function threadHtml(links) {
  if (!Array.isArray(links) || links.length === 0) return "";
  const items = links.filter(isObj).slice(0, MAX_ITEMS).map((l) => {
    const needle = isObj(l.needle) ? text(l.needle.value) : "";
    if (l.status !== "found") return `<li><code>${needle}</code>: not found in any recorded source.</li>`;
    return `<li><code>${needle}</code> comes from <code>${text(l.source)}</code>, line ${text(l.line)}, column ${text(l.column)}${l.hidden === true ? " (hidden characters)" : ""}:<br><code>${text(l.lineText)}</code></li>`;
  });
  return `<section><h2>Red thread</h2><ul>${items.join("")}</ul></section>`;
}
function firstLine(command) {
  const lines = command.split(/\r\n|\r|\n|\u2028|\u2029/);
  const first = [...lines[0] ?? ""];
  const cut = first.length > LIST_COMMAND_MAX;
  const head = (cut ? first.slice(0, LIST_COMMAND_MAX - 1) : first).join("");
  return cut || lines.length > 1 ? `${head}\u2026` : head;
}
function badgeOf(e) {
  const d = isObj(e.detail) ? e.detail : {};
  const out = isObj(d.wardVerdict) && d.wardVerdict.verdict === "block";
  return `<span class="badge ${out ? "block" : "warn"}">${out ? "out" : "flickering"}</span>`;
}
function gateNoteHtml(e) {
  const d = isObj(e.detail) ? e.detail : {};
  const wv = d.wardVerdict;
  if (!isObj(wv) || wv.verdict !== "pass") return "";
  const notices = Array.isArray(wv.notices) ? wv.notices.filter(isObj).slice(0, MAX_ITEMS) : [];
  const why = notices.length > 0 ? `<ul>${notices.map((n) => `<li>${text(n.reason)}</li>`).join("")}</ul>` : "";
  return `<section><h2>Gate rule</h2><p>No ward was violated, but a gate rule asked for approval (for example the self-protection floor for gate-protected paths).</p>${why}</section>`;
}
function renderList(entries, corrupt) {
  const newest = [...entries].reverse();
  const shown = newest.slice(0, MAX_LIST);
  let body = "<h1>Graveyard</h1>";
  if (entries.length === 0) {
    body += "<section><p>The graveyard is empty. A blocked or warned command appears here.</p></section>";
  } else {
    body += `<section><p class="mono note">${entries.length} ${entries.length === 1 ? "grave" : "graves"}${entries.length > shown.length ? `, newest ${shown.length} shown` : ""}</p><ul class="graves">`;
    body += shown.map((e) => `<li><a href="/seance/${text(e.id)}"><span class="mono when">${text(e.recordedAt)}</span>${badgeOf(e)}<span class="mono wards">${text(e.wardIds.join(", "))}</span><code class="first">${text(firstLine(e.command))}</code></a></li>`).join("");
    body += "</ul></section>";
  }
  if (corrupt > 0) body += `<p class="note">${corrupt} unreadable lines were skipped.</p>`;
  return page("Graveyard \xB7 Ghost Run+", body);
}
function renderGrave(entry) {
  const d = isObj(entry.detail) ? entry.detail : {};
  let body = '<h1>Seance</h1><p><a href="/seance/">Back to the graveyard</a></p>';
  body += `<section>${badgeOf(entry)}<pre class="cmd">${text(entry.command, MAX_COMMAND)}</pre><p class="mono">${text(entry.recordedAt)}</p><p class="mono">${text(entry.wardIds.join(", "))}</p></section>`;
  body += gateNoteHtml(entry) + verdictHtml(d.wardVerdict) + changesHtml(d.changes) + claimsHtml(d.claims) + threadHtml(d.links);
  return page("Seance \xB7 Ghost Run+", body);
}
function renderMessage(title, message) {
  return page(`${title} \xB7 Ghost Run+`, `<h1>${text(title)}</h1><p>${text(message)}</p><p><a href="/seance/">Back to the graveyard</a></p>`);
}

// integrations/kiro-hook/lib/seance/server.mjs
var DEFAULT_SEANCE_BASE = "http://localhost:5317";
var HEALTH_SERVICE = "ghost-run-seance";
var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var DEFAULT_IDLE_MS = 30 * 60 * 1e3;
function parseSeanceBase(base) {
  try {
    const u = new URL(typeof base === "string" && base !== "" ? base : DEFAULT_SEANCE_BASE);
    const port2 = u.port !== "" ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    return { local, port: port2 };
  } catch {
    return { local: false, port: 0 };
  }
}
function hostAllowed(host, address) {
  if (typeof host !== "string" || address === null || typeof address !== "object") return false;
  const m = /^(?:localhost|127\.0\.0\.1):([0-9]{1,5})$/i.exec(host);
  return m !== null && m[1] === String(address.port);
}
var COMMON_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer"
};
function send(res, status, body, type = "text/html; charset=utf-8", extra = {}) {
  res.writeHead(status, { ...COMMON_HEADERS, "Content-Type": type, ...extra });
  res.end(body);
}
function createSeanceServer({ root: root2, idleMs: idleMs2, onIdle }) {
  const file = storePaths(root2).graveyard;
  let idle;
  const touch = () => {
    if (idleMs2 === void 0) return;
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => onIdle?.(), idleMs2);
    idle.unref?.();
  };
  const server = http.createServer((req, res) => {
    touch();
    void (async () => {
      try {
        if (!hostAllowed(req.headers.host, server.address())) {
          send(res, 421, renderMessage("Misdirected request", "This viewer answers only to localhost and 127.0.0.1 on its own port."));
          return;
        }
        if (req.method !== "GET") {
          send(res, 405, renderMessage("Method not allowed", "Only GET is supported."), void 0, { Allow: "GET" });
          return;
        }
        const pathname = (req.url ?? "").split("?")[0] ?? "";
        if (pathname === "/seance/health") {
          send(res, 200, JSON.stringify({ service: HEALTH_SERVICE, version: 1 }), "application/json; charset=utf-8");
          return;
        }
        let grave = { entries: [], corrupt: 0 };
        try {
          grave = await readGraveyard(file);
        } catch {
          grave = { entries: [], corrupt: 0 };
        }
        if (pathname === "/seance" || pathname === "/seance/") {
          send(res, 200, renderList(grave.entries, grave.corrupt));
          return;
        }
        const id = pathname.startsWith("/seance/") ? pathname.slice("/seance/".length) : "";
        const entry = ID_RE.test(id) ? grave.entries.find((e) => e.id === id) : void 0;
        if (entry === void 0) {
          send(res, 404, renderMessage("Not found", "No such grave."));
          return;
        }
        send(res, 200, renderGrave(entry));
      } catch {
        try {
          send(res, 500, renderMessage("Error", "The seance page could not be built."));
        } catch {
          res.destroy();
        }
      }
    })();
  });
  server.on("close", () => idle && clearTimeout(idle));
  server.on("listening", touch);
  return server;
}
function startSeanceServer(options) {
  const server = createSeanceServer(options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === "object" && addr !== null ? addr.port : options.port });
    });
  });
}

// integrations/kiro-hook/seance.mjs
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : void 0;
}
var root = path2.resolve(arg("--root") ?? process.env.INIT_CWD ?? process.cwd());
var port = arg("--port") !== void 0 ? Number(arg("--port")) : parseSeanceBase(process.env.GHOST_RUN_SEANCE_BASE).port;
var idleArg = arg("--idle-ms");
var idleMs = idleArg !== void 0 && Number(idleArg) > 0 ? Number(idleArg) : void 0;
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write("seance: invalid port\n");
  process.exit(1);
}
try {
  const { server, port: bound } = await startSeanceServer({
    root,
    port,
    ...idleMs === void 0 ? {} : { idleMs, onIdle: () => process.exit(0) }
  });
  process.stdout.write(`Seance viewer for ${root}: http://127.0.0.1:${bound}/seance/
`);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
} catch (err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "error";
  process.stderr.write(`seance: could not listen on 127.0.0.1:${port} (${code})
`);
  process.exit(1);
}
