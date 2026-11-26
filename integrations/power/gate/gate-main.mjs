import { createRequire as __ghostRunCreateRequire } from 'node:module';
const require = __ghostRunCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/shell-quote@1.12.0/node_modules/shell-quote/quote.js
var require_quote = __commonJS({
  "node_modules/.pnpm/shell-quote@1.12.0/node_modules/shell-quote/quote.js"(exports, module) {
    "use strict";
    var OPS = (
      /** @type {const} */
      [
        "||",
        "&&",
        ";;&",
        ";;",
        ";&",
        "|&",
        "<(",
        ">(",
        "<<<",
        "<<-",
        "<<",
        ">>",
        ">&",
        ">|",
        "&>>",
        "&>",
        "<&",
        "<>",
        "&",
        ";",
        "(",
        ")",
        "|",
        "<",
        ">"
      ]
    );
    var LINE_TERMINATORS = /[\n\r\u2028\u2029]/;
    var GLOB_SHELL_SPECIAL = /[\s#!"$&'():;<=>@\\^`|~]/g;
    module.exports = function quote(xs) {
      var sawComment = false;
      return xs.map(function(s) {
        if (sawComment && typeof s === "string" && LINE_TERMINATORS.test(s)) {
          throw new TypeError("a token after a `comment` must not contain line terminators");
        }
        if (s === "") {
          return (
            /** @type {const} */
            "''"
          );
        }
        if (s && typeof s === "object") {
          if ("op" in s && s.op === "glob") {
            if (typeof s.pattern !== "string") {
              throw new TypeError("glob token requires a string `pattern`");
            }
            if (LINE_TERMINATORS.test(s.pattern)) {
              throw new TypeError("glob `pattern` must not contain line terminators");
            }
            if (s.pattern === "") {
              return (
                /** @type {const} */
                "''"
              );
            }
            return s.pattern.replace(GLOB_SHELL_SPECIAL, "\\$&");
          }
          if ("op" in s && typeof s.op === "string") {
            if (OPS.indexOf(s.op) < 0) {
              throw new TypeError("invalid `op` value: " + JSON.stringify(s.op));
            }
            return s.op.replace(/[\s\S]/g, "\\$&");
          }
          if ("comment" in s && typeof s.comment === "string") {
            if (LINE_TERMINATORS.test(s.comment)) {
              throw new TypeError("`comment` must not contain line terminators");
            }
            sawComment = true;
            return "#" + s.comment;
          }
          throw new TypeError("unrecognized object token shape");
        }
        if (/'/.test(s) && /!/.test(s)) {
          return "'" + s.replace(/'/g, `'"'"'`) + "'";
        }
        if (/["\s\\]/.test(s) && !/'/.test(s)) {
          return "'" + s + "'";
        }
        if (/["'\s]/.test(s)) {
          return '"' + s.replace(/(["\\$`])/g, "\\$1") + '"';
        }
        return String(s).replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}~])/g, "$1\\$2");
      }).join(" ");
    };
  }
});

// node_modules/.pnpm/shell-quote@1.12.0/node_modules/shell-quote/parse.js
var require_parse = __commonJS({
  "node_modules/.pnpm/shell-quote@1.12.0/node_modules/shell-quote/parse.js"(exports, module) {
    "use strict";
    var CONTROL = (
      /** @type {const} */
      "(?:" + /** @type {const} */
      [
        "\\|\\|",
        "\\&(?:\\&|>>?)",
        // `&&`, `&>`, and `&>>`
        ";;\\&?",
        // `;;` and `;;&`
        "[;|]\\&",
        // `;&` and `|&`
        "\\<\\(",
        "\\<\\<\\<",
        "\\<\\<-",
        "\\<\\<(?!\\()",
        // `<<(` stays `<` and `<(`, as zsh reads it; other shells reject it
        ">>",
        ">[&|(]",
        // `>&`, `>|`, and `>(`
        "<[&>]",
        // `<&` and `<>`
        "[&;()|<>]"
      ].join(
        /** @type {const} */
        "|"
      ) + /** @type {const} */
      ")"
    );
    var controlRE = new RegExp("^" + CONTROL + "$");
    var META = (
      /** @type {const} */
      "|&;()<> \\t"
    );
    var SINGLE_QUOTE3 = (
      /** @type {const} */
      "'([^']*?)'"
    );
    var ANSI_C_BODY = "(?:\\\\[\\s\\S]|[^\\\\'])*?";
    var ANSI_C_QUOTE = "\\$'" + ANSI_C_BODY + "'";
    var ansiCAt = new RegExp("\\$'" + ANSI_C_BODY + "(?:(')|\\\\?$)", "g");
    var ANSI_C_LETTERS = "abeEfnrtv";
    var ANSI_C_CHARS = "\x07\b\x1B\x1B\f\n\r	\v";
    var hash = /^#$/;
    var SQ = (
      /** @type {const} */
      "'"
    );
    var DQ = (
      /** @type {const} */
      '"'
    );
    var DS = (
      /** @type {const} */
      "$"
    );
    var TOKEN = "";
    var mult = (
      /** @type {const} */
      4294967296
    );
    for (i = 0; i < 4; i++) {
      TOKEN += (mult * Math.random()).toString(16);
    }
    var i;
    var startsWithToken = new RegExp("^" + TOKEN);
    function matchAll(s, r) {
      var origIndex = r.lastIndex;
      var matches = [];
      var matchObj;
      while (matchObj = r.exec(s)) {
        matches[matches.length] = matchObj;
        if (r.lastIndex === matchObj.index) {
          r.lastIndex += 1;
        }
      }
      r.lastIndex = origIndex;
      return matches;
    }
    function getVar(env, pre, key) {
      var r = typeof env === "function" ? env(key) : env[key];
      if (typeof r === "undefined" && key != "") {
        r = "";
      } else if (typeof r === "undefined") {
        r = "$";
      }
      if (typeof r === "object") {
        return pre + TOKEN + JSON.stringify(r) + TOKEN;
      }
      return pre + r;
    }
    var ansiCEscape = /\\([0-7]{1,3}|x[\dA-Fa-f]{1,2}|u[\dA-Fa-f]{1,4}|U[\dA-Fa-f]{1,8}|c(?:\\\\|[\s\S])|[abeEfnrtv\\'"?])/g;
    function expandAnsiCEscape(m, escape) {
      var kind = escape.charAt(0);
      if (kind === "c") {
        var ctrl = escape.charAt(1);
        return ctrl === "?" ? "\x7F" : String.fromCharCode(ctrl.charCodeAt(0) & 31);
      }
      if (kind === "x" || kind === "u" || kind === "U") {
        var cp = parseInt(escape.slice(1), 16);
        if (cp > 1114111) {
          return m;
        }
        return String.fromCharCode.apply(null, cp > 65535 ? [55232 + (cp >> 10), 56320 + (cp & 1023)] : [cp]);
      }
      if (kind >= "0" && kind <= "7") {
        return String.fromCharCode(parseInt(escape, 8) & 255);
      }
      var letter = ANSI_C_LETTERS.indexOf(escape);
      return letter < 0 ? escape : ANSI_C_CHARS.charAt(letter);
    }
    function expandAnsiC(body) {
      return body.replace(ansiCEscape, expandAnsiCEscape).split("\0")[0];
    }
    function closesAnsiC(s, i2) {
      ansiCAt.lastIndex = i2;
      return !!/** @type {RegExpExecArray} */
      ansiCAt.exec(s)[1];
    }
    function parseInternal(string, env, opts) {
      if (!opts) {
        opts = {};
      }
      var BS = opts.escape || "\\";
      var ifs = opts.splitUnquoted === true ? " 	\n" : typeof opts.splitUnquoted === "string" ? opts.splitUnquoted : "";
      var BAREWORD = "(\\" + BS + `['"$\\` + BS + META + "]|\\$\\$|\\$(?!" + ANSI_C_QUOTE.slice(2) + `)|[^\\s'"$` + META + "])+";
      var DOUBLE_QUOTE3 = '"(?:\\' + BS + '[\\s\\S]|[^"\\' + BS + '])*"';
      var chunker = new RegExp([
        "(" + CONTROL + ")",
        // control chars
        "(" + ANSI_C_QUOTE + "|" + BAREWORD + "|" + DOUBLE_QUOTE3 + "|" + SINGLE_QUOTE3 + ")+"
      ].join("|"), "g");
      var matches = matchAll(string, chunker);
      if (matches.length === 0) {
        return [];
      }
      if (!env) {
        env = {};
      }
      var commented = false;
      return matches.map(function(match) {
        var s = match[0];
        if (!s || commented) {
          return void 0;
        }
        if (controlRE.test(s)) {
          return (
            /** @type {ControlOperator} */
            { op: s }
          );
        }
        var quote = false;
        var esc = false;
        var out = "";
        var words = [];
        var sawQuote = false;
        var pendingNw = null;
        var isGlob = false;
        var i2;
        function parseEnvVar() {
          i2 += 1;
          var varend;
          var varname;
          var char = s.charAt(i2);
          if (char === "{") {
            i2 += 1;
            if (s.charAt(i2) === "}") {
              throw new Error("Bad substitution: " + s.slice(i2 - 2, i2 + 1));
            }
            var depth = 1;
            varend = i2;
            while (depth > 0 && varend < s.length) {
              if (s.charAt(varend) === "{" && s.charAt(varend - 1) === "$") {
                depth += 1;
              } else if (s.charAt(varend) === "}") {
                depth -= 1;
              }
              varend += 1;
            }
            if (depth !== 0) {
              throw new Error("Bad substitution: " + s.slice(i2));
            }
            varend -= 1;
            varname = s.slice(i2, varend);
            i2 = varend;
          } else if (/[*@#?$!-]/.test(char)) {
            varname = char;
          } else {
            var slicedFromI = s.slice(i2);
            varend = slicedFromI.match(/[^\w\d_]/);
            if (!varend) {
              varname = slicedFromI;
              i2 = s.length;
            } else {
              varname = slicedFromI.slice(0, varend.index);
              i2 += /** @type {number} */
              varend.index - 1;
            }
          }
          return getVar(
            /** @type {NonNullable<typeof env>} */
            env,
            "",
            varname
          );
        }
        function flushRun() {
          if (pendingNw === null) {
            return;
          }
          if (pendingNw === 0) {
            if (out !== "") {
              words[words.length] = out;
              out = "";
            }
          } else {
            words[words.length] = out;
            out = "";
            for (var fe = 1; fe < pendingNw; fe += 1) {
              words[words.length] = "";
            }
          }
          pendingNw = null;
        }
        for (i2 = 0; i2 < s.length; i2++) {
          var c = s.charAt(i2);
          if (ifs && c !== DS) {
            flushRun();
          }
          isGlob = isGlob || !quote && (c === "*" || c === "?");
          if (esc) {
            out += c;
            esc = false;
          } else if (quote) {
            if (c === quote) {
              quote = false;
            } else if (quote == SQ) {
              out += c;
            } else {
              if (c === BS) {
                i2 += 1;
                c = s.charAt(i2);
                if (c === DQ || c === BS || c === DS) {
                  out += c;
                } else {
                  out += BS + c;
                }
              } else if (c === DS) {
                out += parseEnvVar();
              } else {
                out += c;
              }
            }
          } else if (c === DQ || c === SQ) {
            quote = c;
            sawQuote = true;
          } else if (controlRE.test(c)) {
            return (
              /** @type {ControlOperator} */
              { op: s }
            );
          } else if (hash.test(c)) {
            commented = true;
            var commentObj = { comment: string.slice(match.index + i2 + 1) };
            if (out.length) {
              return (
                /** @type {const} */
                [out, commentObj]
              );
            }
            return (
              /** @type {const} */
              [commentObj]
            );
          } else if (c === BS) {
            esc = true;
          } else if (c === DS && s.charAt(i2 + 1) === SQ && closesAnsiC(s, i2)) {
            flushRun();
            sawQuote = true;
            out += expandAnsiC(s.slice(i2 + 2, ansiCAt.lastIndex - 1));
            i2 = ansiCAt.lastIndex - 1;
          } else if (c === DS) {
            var value = parseEnvVar();
            if (!ifs) {
              out += value;
            } else {
              for (var vi = 0; vi < value.length; vi += 1) {
                var vc = value.charAt(vi);
                if (ifs.indexOf(vc) < 0) {
                  flushRun();
                  out += vc;
                } else if (pendingNw === null) {
                  pendingNw = vc === " " || vc === "	" || vc === "\n" ? 0 : 1;
                } else if (vc !== " " && vc !== "	" && vc !== "\n") {
                  pendingNw += 1;
                }
              }
            }
          } else {
            out += c;
          }
        }
        if (isGlob) {
          return (
            /** @type {GlobPattern} */
            { op: "glob", pattern: out }
          );
        }
        if (ifs) {
          if (pendingNw !== null && pendingNw > 0) {
            words[words.length] = out;
            out = "";
            for (var te = 1; te < pendingNw; te += 1) {
              words[words.length] = "";
            }
          }
          if (out !== "" || sawQuote && words.length === 0) {
            words[words.length] = out;
          }
          return words;
        }
        return out;
      }).reduce(
        function(prev, arg) {
          if (typeof arg === "undefined") {
            return prev;
          }
          [].concat(arg).forEach(function(entry) {
            prev[prev.length] = entry;
          });
          return prev;
        },
        /** @type {ParseEntry[]} */
        []
      );
    }
    module.exports = function parse2(s, env, opts) {
      var mapped = parseInternal(s, env, opts);
      if (typeof env !== "function") {
        return mapped;
      }
      return mapped.reduce(
        function(acc, s2) {
          if (typeof s2 === "object") {
            acc[acc.length] = s2;
            return acc;
          }
          var xs = s2.split(RegExp("(" + TOKEN + ".*?" + TOKEN + ")", "g"));
          if (xs.length === 1) {
            acc[acc.length] = xs[0];
            return acc;
          }
          xs.filter(Boolean).forEach(function(x) {
            acc[acc.length] = startsWithToken.test(x) ? JSON.parse(x.split(TOKEN)[1]) : x;
          });
          return acc;
        },
        /** @type {ParseEntry[]} */
        []
      );
    };
  }
});

// node_modules/.pnpm/shell-quote@1.12.0/node_modules/shell-quote/index.js
var require_shell_quote = __commonJS({
  "node_modules/.pnpm/shell-quote@1.12.0/node_modules/shell-quote/index.js"(exports) {
    "use strict";
    exports.quote = require_quote();
    exports.parse = require_parse();
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias2 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap3 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair3 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar3 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq3 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection2(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar3(node) || isCollection2(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias2;
    exports.isCollection = isCollection2;
    exports.isDocument = isDocument;
    exports.isMap = isMap3;
    exports.isNode = isNode;
    exports.isPair = isPair3;
    exports.isScalar = isScalar3;
    exports.isSeq = isSeq3;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path8) {
      const ctrl = callVisitor(key, node, visitor, path8);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path8, ctrl);
        return visit_(key, ctrl, visitor, path8);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path8 = Object.freeze(path8.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path8);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path8 = Object.freeze(path8.concat(node));
          const ck = visit_("key", node.key, visitor, path8);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path8);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path8) {
      const ctrl = await callVisitor(key, node, visitor, path8);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path8, ctrl);
        return visitAsync_(key, ctrl, visitor, path8);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path8 = Object.freeze(path8.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path8);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path8 = Object.freeze(path8.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path8);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path8);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path8) {
      if (typeof visitor === "function")
        return visitor(key, node, path8);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path8);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path8);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path8);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path8);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path8);
      return void 0;
    }
    function replaceNode(key, path8, node) {
      const parent = path8[path8.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj2, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj2, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found3 = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found3 = node;
        }
        if (found3 && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found3);
          if (!data) {
            toJS.toJS(found3, null, ctx);
            data = anchors2.get(found3);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found3, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found3;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path8, value) {
      let v = value;
      for (let i = path8.length - 1; i >= 0; --i) {
        const k = path8[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path8) => path8 == null || typeof path8 === "object" && !!path8[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path8, value) {
        if (isEmptyPath(path8))
          this.add(value);
        else {
          const [key, ...rest] = path8;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path8) {
        const [key, ...rest] = path8;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path8, keepScalar) {
        const [key, ...rest] = path8;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path8) {
        const [key, ...rest] = path8;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path8, value) {
        const [key, ...rest] = path8;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text2, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text2;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text2.length <= endStep)
        return text2;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text2, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text2[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text2[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text2, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text2[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text2[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text2;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text2;
      if (onFold)
        onFold();
      let res = text2.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text2.length;
        if (fold === 0)
          res = `
${indent}${text2.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text2[fold]}\\`;
          res += `
${indent}${text2.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text2, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text2[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text2[++i];
        } else {
          do {
            ch = text2[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text2[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj2;
      if (identity.isScalar(item)) {
        obj2 = item.value;
        let match = tags.filter((t) => t.identify?.(obj2));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj2 = item;
        tagObj = tags.find((t) => t.nodeClass && obj2 instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj2?.constructor?.name ?? (obj2 === null ? "null" : typeof obj2);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj2, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj2, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj2 instanceof Map) {
          for (const [key, value] of obj2)
            add(key, value);
        } else if (obj2 && typeof obj2 === "object") {
          for (const key of Object.keys(obj2))
            add(key, obj2[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj2, ctx) => YAMLMap.YAMLMap.from(schema, obj2, ctx)
    };
    exports.map = map;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj2, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj2 && Symbol.iterator in Object(obj2)) {
          let i = 0;
          for (let it of obj2) {
            if (typeof replacer === "function") {
              const key = obj2 instanceof Set ? it : String(i++);
              it = replacer.call(obj2, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj2, ctx) => YAMLSeq.YAMLSeq.from(schema, obj2, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path8, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path8, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path8) {
        if (Collection.isEmptyPath(path8)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path8) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path8, keepScalar) {
        if (Collection.isEmptyPath(path8))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path8, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path8) {
        if (Collection.isEmptyPath(path8))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path8) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path8, value) {
        if (Collection.isEmptyPath(path8)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path8), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path8, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message2) {
        super();
        this.name = name;
        this.code = code;
        this.message = message2;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message2) {
        super("YAMLParseError", pos, code, message2);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message2) {
        super("YAMLWarning", pos, code, message2);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found3 = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found3 || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found3)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found3 = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found: found3,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep3, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep3) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep3 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep3, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep3 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep3 + cb;
              sep3 = "";
              break;
            }
            case "newline":
              if (comment)
                sep3 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap3 = fc.start.source === "{";
      const fcName = isMap3 ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap3 ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep3, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep3 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap3 && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap3 && !sep3 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep3, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep3 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap3 && !props.found && ctx.options.strict) {
              if (sep3)
                for (const st of sep3) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep3, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap3) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap3 ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message2 = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message2);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message2 = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message2);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message2 = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message2);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep3 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message2 = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message2);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep3 === " ")
            sep3 = "\n";
          else if (!prevMoreIndented && sep3 === "\n")
            sep3 = "\n\n";
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep3 === "\n")
            value += "\n";
          else
            sep3 = "\n";
        } else {
          value += sep3 + content;
          sep3 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message2 = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message2);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message2 = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message2);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep3 = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep3 === "\n")
            res += sep3;
          else
            sep3 = "\n";
        } else {
          res += sep3 + lm;
          sep3 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep3 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message2 = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message2);
          }
          break;
        default: {
          const message2 = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message2);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message2, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message2));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message2));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message2, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message2, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message2) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message2);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message2);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep3, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep3)
        for (const st of sep3)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path8) => {
      let item = cst;
      for (const [field, index] of path8) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path8) => {
      const parent = visit.itemAtPath(cst, path8.slice(0, -1));
      const field = path8[path8.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path8, item, visitor) {
      let ctrl = visitor(item, path8);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path8.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path8);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path8) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection2 = (token) => !!token && "items" in token;
    var isScalar3 = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection2;
    exports.isScalar = isScalar3;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter2 = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter2;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message2 = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message: message2, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message2 = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message: message2 };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep3;
          if (scalar.end) {
            sep3 = scalar.end;
            sep3.push(this.sourceToken);
            delete scalar.end;
          } else
            sep3 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep3 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep3 = it.sep;
                  sep3.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep3 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep3 = fc.end.splice(1, fc.end.length);
            sep3.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep3 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument2(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse2(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument2(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse2;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument2;
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// integrations/kiro-hook/lib/gate/main.mjs
import { randomUUID as randomUUID4 } from "node:crypto";

// ghost-runner/dist/errors.js
var PlanBoundsError = class extends Error {
  code = "plan-bounds";
  bound;
  actual;
  constructor(bound, actual) {
    super(`plan size ${actual} violates bound ${bound}`);
    this.name = "PlanBoundsError";
    this.bound = bound;
    this.actual = actual;
  }
};
var ConfigError = class extends Error {
  code = "config";
  option;
  bound;
  constructor(option, bound, actual) {
    super(`option ${option} violates bound ${bound} (got ${describe(actual)})`);
    this.name = "ConfigError";
    this.option = option;
    this.bound = bound;
  }
};
var FingerprintReadError = class extends Error {
  code = "fingerprint-read";
  path;
  constructor(path8, cause) {
    super(`cannot read tracked file during fingerprint: ${path8}`, cause === void 0 ? void 0 : { cause });
    this.name = "FingerprintReadError";
    this.path = path8;
  }
};
function describe(v) {
  if (typeof v === "string")
    return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean" || v === void 0 || v === null)
    return String(v);
  return typeof v;
}

// ghost-runner/dist/config.js
var MIN_PLAN_ACTIONS = 1;
var MAX_PLAN_ACTIONS = 50;
var MIN_EXEC_LIMIT_SEC = 1;
var MAX_EXEC_LIMIT_SEC = 30;
var DEFAULT_EXEC_LIMIT_SEC = 25;
var PIPELINE_DEADLINE_SEC = 55;
var MIN_PIPELINE_DEADLINE_SEC = 1;
var COPY_LIMIT_SEC = 20;
var MIN_POOL_SIZE = 1;
var MAX_POOL_SIZE = 8;
var MAX_SECRET_FILES = 16;
var MAX_SECRET_FILE_BYTES = 65536;
var DEFAULT_EXCLUDE_DIRS = Object.freeze(["node_modules"]);
var DEFAULT_SECRET_PATTERNS = Object.freeze([
  ".env",
  ".env.*",
  "**/*.pem",
  "**/id_rsa*"
]);
var DEFAULT_LIMITS = Object.freeze({
  pids: 256,
  memory: "1g",
  cpus: 2,
  tmpBytes: 64 * 1024 * 1024
});
var DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
var MEMORY_RE = /^[1-9][0-9]*[bkmg]$/i;
var RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function validateImageRef(image, option = "image") {
  const bound = "image must be <name>@sha256:<64 hex digest> (tags are not accepted)";
  const at = image.indexOf("@");
  if (at <= 0 || image.indexOf("@", at + 1) !== -1)
    throw new ConfigError(option, bound, image);
  const name = image.slice(0, at);
  const digest = image.slice(at + 1);
  const lastSegment = name.slice(name.lastIndexOf("/") + 1);
  if (!DIGEST_RE.test(digest) || /[\s\0]/.test(name) || lastSegment.length === 0 || lastSegment.includes(":") || name.startsWith("-")) {
    throw new ConfigError(option, bound, image);
  }
  return image;
}
function imageFromEnv(env) {
  const v = env["GHOST_BOX_IMAGE"];
  if (v === void 0 || v === "")
    return void 0;
  return validateImageRef(v, "GHOST_BOX_IMAGE");
}
function validatePlanSize(size) {
  if (!Number.isInteger(size) || size < MIN_PLAN_ACTIONS || size > MAX_PLAN_ACTIONS) {
    throw new PlanBoundsError(`${MIN_PLAN_ACTIONS}..${MAX_PLAN_ACTIONS} actions`, size);
  }
}
function positiveInt(option, v) {
  if (!Number.isInteger(v) || v < 1)
    throw new ConfigError(option, "positive integer", v);
}
function resolveRunnerOptions(opts) {
  if (typeof opts.original !== "string" || opts.original === "") {
    throw new ConfigError("original", "non-empty directory path", opts.original);
  }
  const excludeDirs = opts.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
  for (const d of excludeDirs) {
    if (typeof d !== "string" || d === "" || d.includes("/")) {
      throw new ConfigError("excludeDirs", 'non-empty names without "/"', d);
    }
  }
  const excludedDirMode = opts.excludedDirMode ?? "omit";
  if (excludedDirMode !== "omit" && excludedDirMode !== "readonly-mount") {
    throw new ConfigError("excludedDirMode", '"omit" or "readonly-mount"', excludedDirMode);
  }
  const execLimitSec = opts.execLimitSec ?? DEFAULT_EXEC_LIMIT_SEC;
  if (typeof execLimitSec !== "number" || !Number.isFinite(execLimitSec) || execLimitSec < MIN_EXEC_LIMIT_SEC || execLimitSec > MAX_EXEC_LIMIT_SEC) {
    throw new ConfigError("execLimitSec", `${MIN_EXEC_LIMIT_SEC}..${MAX_EXEC_LIMIT_SEC}`, execLimitSec);
  }
  const pipelineDeadlineSec = opts.pipelineDeadlineSec ?? PIPELINE_DEADLINE_SEC;
  if (typeof pipelineDeadlineSec !== "number" || !Number.isFinite(pipelineDeadlineSec) || pipelineDeadlineSec < MIN_PIPELINE_DEADLINE_SEC || pipelineDeadlineSec > PIPELINE_DEADLINE_SEC) {
    throw new ConfigError("pipelineDeadlineSec", `${MIN_PIPELINE_DEADLINE_SEC}..${PIPELINE_DEADLINE_SEC}`, pipelineDeadlineSec);
  }
  let pool;
  if (opts.pool !== void 0) {
    const size = opts.pool.size;
    if (!Number.isInteger(size) || size < MIN_POOL_SIZE || size > MAX_POOL_SIZE) {
      throw new ConfigError("pool.size", `integer ${MIN_POOL_SIZE}..${MAX_POOL_SIZE}`, size);
    }
    pool = { size };
  }
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  positiveInt("limits.pids", limits.pids);
  positiveInt("limits.tmpBytes", limits.tmpBytes);
  if (!Number.isFinite(limits.cpus) || limits.cpus <= 0) {
    throw new ConfigError("limits.cpus", "positive number", limits.cpus);
  }
  if (typeof limits.memory !== "string" || !MEMORY_RE.test(limits.memory)) {
    throw new ConfigError("limits.memory", 'positive size such as "1g"', limits.memory);
  }
  const image = opts.image === void 0 ? void 0 : validateImageRef(opts.image);
  if (opts.boxDir !== void 0 && (typeof opts.boxDir !== "string" || opts.boxDir === "")) {
    throw new ConfigError("boxDir", "non-empty directory path", opts.boxDir);
  }
  if (opts.runId !== void 0 && (typeof opts.runId !== "string" || !RUN_ID_RE.test(opts.runId))) {
    throw new ConfigError("runId", "string matching ^[A-Za-z0-9_-]{1,64}$", opts.runId);
  }
  if (opts.dockerWakeRetryMs !== void 0 && (!Number.isInteger(opts.dockerWakeRetryMs) || opts.dockerWakeRetryMs < 1 || opts.dockerWakeRetryMs > 3e4)) {
    throw new ConfigError("dockerWakeRetryMs", "integer 1..30000", opts.dockerWakeRetryMs);
  }
  return {
    original: opts.original,
    excludeDirs: [...excludeDirs],
    excludedDirMode,
    execLimitSec,
    pipelineDeadlineSec,
    copyLimitSec: COPY_LIMIT_SEC,
    pool,
    limits,
    secretPatterns: [...opts.secretPatterns ?? DEFAULT_SECRET_PATTERNS],
    wardSet: opts.wardSet ?? { wards: [] },
    image,
    ...opts.boxDir !== void 0 ? { boxDir: opts.boxDir } : {},
    ...opts.runId !== void 0 ? { runId: opts.runId } : {},
    ...opts.dockerWakeRetryMs !== void 0 ? { dockerWakeRetryMs: opts.dockerWakeRetryMs } : {}
  };
}

// ghost-runner/dist/result.js
import { createHash } from "node:crypto";
var SECRET_VALUES_CAPPED = "secret-values-capped";
function canonicalize(v, path8 = "$") {
  if (v === null)
    return null;
  switch (typeof v) {
    case "string":
    case "boolean":
      return v;
    case "number":
      if (!Number.isFinite(v))
        throw new TypeError(`non-finite number at ${path8}`);
      return v;
    case "bigint":
      throw new TypeError(`bigint at ${path8}; use a decimal string`);
    case "undefined":
    case "function":
    case "symbol":
      return null;
    default:
      break;
  }
  if (Array.isArray(v))
    return v.map((x, i) => canonicalize(x, `${path8}[${i}]`));
  if (v instanceof Uint8Array || v instanceof Map || v instanceof Set) {
    throw new TypeError(`non-serializable value at ${path8}`);
  }
  const obj2 = v;
  const out = {};
  for (const key of Object.keys(obj2).sort()) {
    const val = obj2[key];
    if (val === void 0)
      continue;
    out[key] = canonicalize(val, `${path8}.${key}`);
  }
  return out;
}
function isSerializedState(s) {
  const o = s;
  return !Array.isArray(o.entries) && typeof o.rootPath === "string" && typeof o.entryCount === "number" && typeof o.manifestDigest === "string";
}
function reduceState(state) {
  if (isSerializedState(state)) {
    return { rootPath: state.rootPath, entryCount: state.entryCount, manifestDigest: state.manifestDigest };
  }
  const manifestDigest = createHash("sha256").update(JSON.stringify(canonicalize(state.entries))).digest("hex");
  return { rootPath: state.rootPath, entryCount: state.entries.length, manifestDigest };
}
function redact(r) {
  const reduced = {
    ...r,
    report: {
      ...r.report,
      snapshots: r.report.snapshots.map((s) => ({
        id: s.id,
        result: s.result,
        state: reduceState(s.state)
      }))
    }
  };
  return canonicalize(reduced);
}
function serializeRunResult(r) {
  return JSON.stringify(canonicalize(redact(r)));
}

// ghost-runner/dist/world/repo-world.js
import { lstat as lstat5, realpath, rm as rm2 } from "node:fs/promises";
import { join as join7, resolve as resolve4 } from "node:path";

// ghost-runner/dist/copy/copier.js
import { spawn } from "node:child_process";
import { chmod, mkdir, readdir as readdir2, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join as join2, resolve } from "node:path";

// ghost-runner/dist/copy/planner.js
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
var CopyAbortedError = class extends Error {
  code = "copy-aborted";
  constructor() {
    super("copy aborted");
    this.name = "CopyAbortedError";
  }
};
function byteOrder(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
async function isRealDirectory(parentAbs, e) {
  if (e.isDirectory())
    return true;
  if (e.isSymbolicLink() || e.isFile())
    return false;
  return (await lstat(join(parentAbs, e.name))).isDirectory();
}
async function planCopy(original, excludeDirs, signal) {
  const excluded = new Set(excludeDirs);
  let excludedCount = 0;
  const walk2 = async (abs, rel) => {
    if (signal?.aborted === true)
      throw new CopyAbortedError();
    const entries = await readdir(abs, { withFileTypes: true });
    const plain = [];
    const marked = [];
    const markedNames = /* @__PURE__ */ new Set();
    let hasExcluded = false;
    for (const e of entries) {
      if (await isRealDirectory(abs, e)) {
        if (excluded.has(e.name)) {
          hasExcluded = true;
          excludedCount += 1;
          continue;
        }
        const childRel = rel === "" ? e.name : `${rel}/${e.name}`;
        const child = await walk2(join(abs, e.name), childRel);
        if (child.marked) {
          marked.push(child);
          markedNames.add(e.name);
        }
      }
    }
    for (const e of entries) {
      if (markedNames.has(e.name))
        continue;
      if (excluded.has(e.name) && await isRealDirectory(abs, e))
        continue;
      plain.push(e.name);
    }
    const isMarked = hasExcluded || marked.length > 0;
    if (!isMarked && rel !== "")
      return { marked: false, dirs: [] };
    const mode = (await lstat(abs)).mode & 4095;
    plain.sort(byteOrder);
    const self = { rel, mode, names: plain };
    const dirs = [self];
    for (const m of marked)
      dirs.push(...m.dirs);
    return { marked: isMarked, dirs };
  };
  const root = await walk2(original, "");
  return { dirs: root.dirs, excludedCount };
}

// ghost-runner/dist/copy/copier.js
var CopyError = class extends Error {
  code = "copy-failed";
  constructor(message2, cause) {
    super(message2, cause === void 0 ? void 0 : { cause });
    this.name = "CopyError";
  }
};
async function dev(p) {
  try {
    return (await stat(p)).dev;
  } catch {
    return void 0;
  }
}
async function placeCopy(original, runId, tmp) {
  const origDev = await dev(original);
  const tmpRoot = join2(tmp, "ghost-run");
  const tmpCopy = join2(tmpRoot, runId);
  await mkdir(tmpRoot, { recursive: true, mode: 448 });
  if (await dev(tmpRoot) === origDev) {
    await mkdir(tmpCopy, { mode: 448 });
    return { copyDir: tmpCopy, cloned: true };
  }
  const sibling = join2(dirname(resolve(original)), `.ghost-run-${runId}`);
  try {
    await mkdir(sibling, { mode: 448 });
    if (await dev(sibling) === origDev)
      return { copyDir: sibling, cloned: true };
    await rm(sibling, { recursive: true, force: true });
  } catch {
  }
  await mkdir(tmpCopy, { mode: 448 });
  return { copyDir: tmpCopy, cloned: false };
}
function cpArgs(platform, cloned, sources, destDir) {
  const flags = platform === "darwin" ? cloned ? ["-cRP"] : ["-RP"] : cloned ? ["--reflink=auto", "-RP"] : ["-RP"];
  return [...flags, "--", ...sources, `${destDir}/`];
}
function runCp(args, signal) {
  return new Promise((res, rej) => {
    if (signal.aborted)
      return rej(new CopyAbortedError());
    const child = spawn("cp", args, { stdio: ["ignore", "ignore", "pipe"], signal });
    let err2 = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => {
      if (err2.length < 4096)
        err2 += d;
    });
    child.on("error", (e) => rej(signal.aborted ? new CopyAbortedError() : new CopyError(`cp failed to start: ${e.message}`, e)));
    child.on("close", (code) => {
      if (signal.aborted)
        rej(new CopyAbortedError());
      else if (code === 0)
        res();
      else
        rej(new CopyError(`cp exited with ${code}: ${err2.trim()}`));
    });
  });
}
var CP_CHUNK = 400;
async function executePlan(plan, original, dest, platform, cloned, signal) {
  for (const d of plan.dirs) {
    const srcDir = d.rel === "" ? original : join2(original, d.rel);
    const dstDir = d.rel === "" ? dest : join2(dest, d.rel);
    if (d.rel !== "")
      await mkdir(dstDir, { mode: 448 });
    for (let i = 0; i < d.names.length; i += CP_CHUNK) {
      const sources = d.names.slice(i, i + CP_CHUNK).map((n) => join2(srcDir, n));
      await runCp(cpArgs(platform, cloned, sources, dstDir), signal);
    }
  }
  for (const d of [...plan.dirs].reverse()) {
    if (d.rel !== "")
      await chmod(join2(dest, d.rel), d.mode);
  }
}
async function readFsClockNs(sentinelPath) {
  await writeFile(sentinelPath, randomUUID());
  return (await stat(sentinelPath, { bigint: true })).ctimeNs.toString();
}
function sentinelPathFor(copyDir) {
  return `${copyDir}.sentinel`;
}
async function removeQuiet(...paths) {
  for (const p of paths)
    await rm(p, { recursive: true, force: true }).catch(() => void 0);
}
async function copyOriginal(opts) {
  const started = performance.now();
  const original = resolve(opts.original);
  const excludeDirs = opts.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
  const platform = opts.platform ?? process.platform;
  const runId = opts.runId ?? randomUUID();
  const limitMs = opts.timeoutMs ?? COPY_LIMIT_SEC * 1e3;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, limitMs);
  let copyDir;
  let ownsDir = true;
  try {
    let cloned;
    if (opts.targetDir !== void 0) {
      copyDir = resolve(opts.targetDir);
      ownsDir = false;
      cloned = await dev(copyDir) === await dev(original);
    } else {
      const p = await placeCopy(original, runId, opts.tmpDir ?? tmpdir());
      copyDir = p.copyDir;
      cloned = p.cloned;
    }
    if (opts.copyStrategy !== void 0) {
      await opts.copyStrategy({ original, dest: copyDir, excludeDirs, cloned, signal: ctrl.signal });
    } else {
      const plan = await planCopy(original, excludeDirs, ctrl.signal);
      await executePlan(plan, original, copyDir, platform, cloned, ctrl.signal);
    }
    if (ctrl.signal.aborted)
      throw new CopyAbortedError();
    const sentinelPath = sentinelPathFor(copyDir);
    const copiedAtNs = await readFsClockNs(sentinelPath);
    return { status: "ok", copyDir, sentinelPath, copiedAtNs, cloned, copyMs: performance.now() - started };
  } catch (e) {
    if (copyDir !== void 0) {
      if (ownsDir)
        await removeQuiet(copyDir, sentinelPathFor(copyDir));
      else
        await emptyDir(copyDir);
    }
    if (timedOut || e instanceof CopyAbortedError) {
      return { status: "copy-timeout", copyMs: performance.now() - started };
    }
    if (e instanceof CopyError)
      throw e;
    throw new CopyError(`copy failed: ${e instanceof Error ? e.message : String(e)}`, e);
  } finally {
    clearTimeout(timer);
  }
}
async function emptyDir(dir) {
  const names = await readdir2(dir).catch(() => []);
  for (const n of names)
    await removeQuiet(join2(dir, n));
  await removeQuiet(sentinelPathFor(dir));
}

// ghost-runner/dist/docker/availability.js
import { createHash as createHash2 } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname as dirname2, join as join3, relative, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// ghost-runner/dist/docker/hardening.js
var MIB = 1024 * 1024;
function tmpMiB(limits) {
  return Math.ceil(limits.tmpBytes / MIB);
}
var BOX_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
var BOX_ENV = {
  PATH: BOX_PATH,
  HOME: "/tmp/home",
  CI: "true",
  NPM_CONFIG_UPDATE_NOTIFIER: "false"
};
var WORK_DIR = "/work";
var REC_DIR = "/ghost-rec";
var LABEL_RUN_ID = "ghost-run.run-id";
var LABEL_POOL = "ghost-run.pool";
var LABEL_POOL_OWNER = "ghost-run.pool-owner";
var LABEL_OWNER = "ghost-run.owner";
var BOX_MAX_LIFETIME_SEC = 120;
function containerName(runId) {
  return `ghost-${runId}`;
}
function assertNoComma(label, value) {
  if (value.includes(",") || value.includes("\0") || value.includes("\n")) {
    throw new Error(`${label} contains a character that cannot be passed to --mount`);
  }
}
function buildRunArgs(opts, runId, mounts) {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  assertNoComma("copy directory", mounts.copyDir);
  assertNoComma("run id", runId);
  const args = [
    "run",
    "-d",
    "--name",
    containerName(runId),
    "--label",
    `${LABEL_RUN_ID}=${runId}`
  ];
  if (opts.owner !== void 0) {
    assertNoComma("owner", opts.owner);
    args.push("--label", `${LABEL_OWNER}=${opts.owner}`);
  }
  if (opts.poolOwner !== void 0) {
    args.push("--label", `${LABEL_POOL}=1`, "--label", `${LABEL_POOL_OWNER}=${opts.poolOwner}`);
  }
  args.push(
    "--network",
    "none",
    "--dns",
    "127.0.0.1",
    // PID 1 of the box is Node (`ghost-init`), which does not reap orphans; `--init` puts a
    // reaping init in front so orphaned children of an action cannot pile up as zombies
    // and exhaust --pids-limit.
    "--init",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    String(limits.pids),
    "--memory",
    limits.memory,
    "--memory-swap",
    limits.memory,
    "--cpus",
    String(limits.cpus),
    "--read-only",
    "--tmpfs",
    `/tmp:rw,exec,nosuid,nodev,size=${tmpMiB(limits)}m`,
    "--user",
    `${opts.uid}:${opts.gid}`,
    "--workdir",
    WORK_DIR,
    "--mount",
    `type=bind,src=${mounts.copyDir},dst=${WORK_DIR}`,
    // Anonymous recorder volume (removed by `rm -v`). Anonymous volumes do not inherit container
    // labels, so the run-id label is set on the volume too; leak checks can then find it.
    "--mount",
    `type=volume,dst=${REC_DIR},volume-label=${LABEL_RUN_ID}=${runId}`
  );
  for (const m of mounts.readonlyMounts ?? []) {
    assertNoComma("read-only mount source", m.source);
    assertNoComma("read-only mount destination", m.destination);
    args.push("--mount", `type=bind,src=${m.source},dst=${m.destination},readonly`);
  }
  for (const [k, v] of Object.entries(BOX_ENV))
    args.push("-e", `${k}=${v}`);
  args.push("--entrypoint", "ghost-init", opts.image, "--max-lifetime", String(opts.maxLifetimeSec ?? BOX_MAX_LIFETIME_SEC));
  return args;
}
function buildExecArgs(container, stepIndex, cwd, action) {
  const rel = (cwd ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
  const workdir = rel === "" ? WORK_DIR : `${WORK_DIR}/${rel}`;
  return ["exec", "-w", workdir, container, "ghost-step", String(stepIndex), rel, action];
}
function expectedMounts(mounts) {
  const list = [
    { type: "bind", source: mounts.copyDir, destination: WORK_DIR, rw: true },
    { type: "volume", destination: REC_DIR, rw: true }
  ];
  for (const m of mounts.readonlyMounts ?? []) {
    list.push({ type: "bind", source: m.source, destination: m.destination, rw: false });
  }
  return list;
}
function obj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function strList(v) {
  if (v === null || v === void 0)
    return [];
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : void 0;
}
function mountKey(type, source, destination, rw) {
  return JSON.stringify([type, source, destination, rw]);
}
function auditInspect(expected, inspectJson) {
  const diffs = [];
  const root = obj(Array.isArray(inspectJson) ? inspectJson[0] : inspectJson);
  const host = obj(root["HostConfig"]);
  const config = obj(root["Config"]);
  if (host["NetworkMode"] !== "none")
    diffs.push('network mode is not "none"');
  if (host["Privileged"] !== false)
    diffs.push("container is privileged or privilege flag missing");
  const capAdd = strList(host["CapAdd"]);
  if (capAdd === void 0 || capAdd.length > 0)
    diffs.push("capabilities were added");
  const capDrop = strList(host["CapDrop"]);
  if (capDrop === void 0 || !capDrop.map((c) => c.toUpperCase()).includes("ALL"))
    diffs.push("capabilities are not all dropped");
  if (host["ReadonlyRootfs"] !== true)
    diffs.push("root file system is not read-only");
  const secOpt = strList(host["SecurityOpt"]);
  if (secOpt === void 0 || !secOpt.some((o) => o === "no-new-privileges" || o === "no-new-privileges=true" || o === "no-new-privileges:true")) {
    diffs.push("no-new-privileges is not set");
  }
  const pid = host["PidMode"];
  const sharesNamespace = (v) => typeof v === "string" && (v === "host" || v.startsWith("container:"));
  if (sharesNamespace(pid))
    diffs.push(`PID mode is "${String(pid)}"`);
  const ipc = host["IpcMode"];
  if (sharesNamespace(ipc))
    diffs.push(`IPC mode is "${String(ipc)}"`);
  const imageMatches = root["Image"] === expected.image || config["Image"] === expected.image;
  if (!imageMatches)
    diffs.push("image differs from the expected image");
  const env = strList(config["Env"]);
  if (env === void 0) {
    diffs.push("environment is missing");
  } else {
    const allowed = /* @__PURE__ */ new Set([
      ...Object.entries(BOX_ENV).map(([k, v]) => `${k}=${v}`),
      ...expected.imageEnv ?? []
    ]);
    const actual = new Set(env);
    for (const e of actual)
      if (!allowed.has(e))
        diffs.push(`unexpected environment entry ${e.split("=")[0] ?? ""}`);
    for (const [k, v] of Object.entries(BOX_ENV))
      if (!actual.has(`${k}=${v}`))
        diffs.push(`environment variable ${k} missing or changed`);
  }
  const rawMounts = root["Mounts"];
  if (!Array.isArray(rawMounts)) {
    diffs.push("mount list is missing");
  } else {
    const actualKeys = rawMounts.map((m) => {
      const mm = obj(m);
      const type = typeof mm["Type"] === "string" ? mm["Type"] : "?";
      const source = type === "volume" ? "" : typeof mm["Source"] === "string" ? mm["Source"] : "?";
      const dest = typeof mm["Destination"] === "string" ? mm["Destination"] : "?";
      return mountKey(type, source, dest, mm["RW"] === true);
    });
    const expectedKeys = expected.mounts.map((m) => mountKey(m.type, m.type === "volume" ? "" : m.source ?? "?", m.destination, m.rw));
    const remaining = [...actualKeys];
    for (const k of expectedKeys) {
      const i = remaining.indexOf(k);
      if (i === -1)
        diffs.push(`expected mount missing: ${JSON.parse(k)[2] ?? ""}`);
      else
        remaining.splice(i, 1);
    }
    for (const k of remaining)
      diffs.push(`unexpected mount: ${JSON.parse(k)[2] ?? ""}`);
  }
  return diffs.length === 0 ? { ok: true } : { ok: false, status: "isolation-violation", differences: diffs };
}

// ghost-runner/dist/docker/availability.js
var AVAILABILITY_LIMIT_MS = 2e3;
var BOX_IMAGE_REPO = "ghost-run/box";
var BOX_HASH_LABEL = "ghost-run.box.hash";
function listFiles(dir) {
  if (!existsSync(dir))
    return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join3(dir, name);
    if (statSync(p).isDirectory())
      out.push(...listFiles(p));
    else
      out.push(p);
  }
  return out;
}
function computeBoxHash(boxDir = resolveBoxDir()) {
  const recorderDir = join3(boxDir, "recorder");
  const h = createHash2("sha256");
  const add = (label, buf) => {
    h.update(`${label}\0${buf.length}\0`);
    h.update(buf);
    h.update("\0");
  };
  add("Dockerfile", readFileSync(join3(boxDir, "Dockerfile")));
  add("BASE_DIGEST", readFileSync(join3(boxDir, "BASE_DIGEST")));
  for (const f of listFiles(recorderDir)) {
    if (f.endsWith(".gitkeep"))
      continue;
    add(`recorder/${relative(recorderDir, f).split("\\").join("/")}`, readFileSync(f));
  }
  return h.digest("hex");
}
var BOX_DIR_ENV = "GHOST_RUN_BOX_DIR";
var SEARCH_DEPTH = 32;
function searchUp(start, layouts) {
  let dir = start;
  for (let i = 0; i < SEARCH_DEPTH; i++) {
    for (const parts of layouts) {
      const candidate = join3(dir, ...parts);
      if (existsSync(join3(candidate, "Dockerfile")))
        return candidate;
    }
    const parent = dirname2(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return void 0;
}
function boxDirFromModule(start) {
  let dir = start ?? dirname2(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join3(dir, "box");
    if (existsSync(join3(candidate, "Dockerfile")))
      return candidate;
    dir = dirname2(dir);
  }
  return void 0;
}
function findBoxDir(sources = {}) {
  if (sources.boxDir !== void 0 && sources.boxDir !== "")
    return sources.boxDir;
  const fromEnv = sources.env?.[BOX_DIR_ENV];
  if (fromEnv !== void 0 && fromEnv !== "")
    return fromEnv;
  const fromModule = boxDirFromModule(sources.moduleDir);
  if (fromModule !== void 0)
    return fromModule;
  if (sources.workspace !== void 0 && sources.workspace !== "") {
    return searchUp(resolve2(sources.workspace), [["ghost-runner", "box"], ["box"]]);
  }
  return void 0;
}
function resolveBoxDir(sources = {}) {
  const found3 = findBoxDir(sources);
  if (found3 === void 0)
    throw new Error("box/ directory not found");
  return found3;
}
function boxImageTag(hash) {
  return `${BOX_IMAGE_REPO}:${hash}`;
}
function asObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
}
var NO_SUCH = /no such (image|object)/i;
async function checkDockerAvailability(client, opts = {}) {
  const limitMs = opts.limitMs ?? AVAILABILITY_LIMIT_MS;
  let tag;
  let expectedHash;
  if (opts.image !== void 0) {
    tag = opts.image;
  } else {
    try {
      const found3 = findBoxDir(opts);
      if (found3 === void 0)
        throw new Error("box/ directory not found");
      expectedHash = computeBoxHash(found3);
    } catch (e) {
      return { available: false, reason: "box-image-missing", detail: `box sources unreadable: ${e.message}`, wakeRetried: false };
    }
    tag = boxImageTag(expectedHash);
  }
  const clock = opts.clock ?? { now: () => Date.now() };
  const inspect = (ms) => {
    const startedAt = clock.now();
    return client.run(["image", "inspect", tag], { timeoutMs: ms, deadlineAt: startedAt + ms });
  };
  let res = await inspect(limitMs);
  let wakeRetried = false;
  if (res.timedOut && res.spawnError === void 0 && opts.wakeRetryLimitMs !== void 0) {
    const left = opts.deadlineAt === void 0 ? Infinity : opts.deadlineAt - clock.now();
    const retryMs = Math.min(opts.wakeRetryLimitMs, left);
    if (retryMs > 0) {
      wakeRetried = true;
      res = await inspect(retryMs);
    }
  }
  if (res.spawnError !== void 0)
    return { available: false, reason: "docker-unavailable", detail: res.spawnError, wakeRetried };
  if (res.timedOut)
    return { available: false, reason: "docker-unavailable", detail: "availability check timed out", wakeRetried };
  if (res.code !== 0) {
    const err2 = res.stderr.toString("utf8");
    if (NO_SUCH.test(err2))
      return { available: false, reason: "box-image-missing", detail: "box image not found", wakeRetried };
    return { available: false, reason: "docker-unavailable", detail: err2.trim().slice(0, 200), wakeRetried };
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout.toString("utf8"));
  } catch {
    return { available: false, reason: "box-image-missing", detail: "image inspect output unreadable", wakeRetried };
  }
  const image = asObj(Array.isArray(parsed) ? parsed[0] : parsed);
  const id = image["Id"];
  if (typeof id !== "string" || !/^sha256:[0-9a-f]{64}$/.test(id)) {
    return { available: false, reason: "box-image-missing", detail: "image id missing", wakeRetried };
  }
  const config = asObj(image["Config"]);
  if (expectedHash !== void 0) {
    const labels = asObj(config["Labels"]);
    if (labels[BOX_HASH_LABEL] !== expectedHash) {
      return { available: false, reason: "box-image-missing", detail: "box image label does not match the box sources", wakeRetried };
    }
  }
  const env = Array.isArray(config["Env"]) ? config["Env"].filter((e) => typeof e === "string") : [];
  const imageEnv = env.filter((e) => !Object.prototype.hasOwnProperty.call(BOX_ENV, e.split("=")[0] ?? ""));
  return {
    available: true,
    imageRef: opts.image ?? id,
    imageId: id,
    tag,
    imageEnv,
    wakeRetried
  };
}

// ghost-runner/dist/recorder/collect.js
import { createHash as createHash4 } from "node:crypto";

// ghost-runner/dist/recorder/events.js
var EventCollector = class {
  seen = /* @__PURE__ */ new Set();
  list = [];
  add(obs) {
    const key = obs.kind === "network-attempt" ? `n\0${obs.stepIndex}\0${obs.destination}` : `s\0${obs.stepIndex}\0${obs.path}`;
    if (this.seen.has(key))
      return void 0;
    this.seen.add(key);
    const event = obs.kind === "network-attempt" ? { kind: "network-attempt", destination: obs.destination, stepIndex: obs.stepIndex } : { kind: "secret-read", path: obs.path, stepIndex: obs.stepIndex };
    this.list.push(event);
    return event;
  }
  events() {
    return [...this.list];
  }
};
function toObservedEvents(observations) {
  const c = new EventCollector();
  for (const o of observations)
    c.add(o);
  return c.events();
}
var PAYLOAD_CAPTURE_CAP_BYTES = 64 * 1024;
var EventBuilder = class {
  counter = 0;
  build(events, bodies) {
    const parts = /* @__PURE__ */ new Map();
    for (const b of bodies) {
      const key = `${b.stepIndex}\0${b.destination}`;
      const list = parts.get(key);
      if (list === void 0)
        parts.set(key, [b.body]);
      else
        list.push(b.body);
    }
    const payloads = /* @__PURE__ */ new Map();
    const out = [];
    for (const ev of events) {
      const list = ev.kind === "network-attempt" && ev.destination !== void 0 ? parts.get(`${ev.stepIndex}\0${ev.destination}`) : void 0;
      if (list === void 0) {
        out.push(ev);
        continue;
      }
      parts.delete(`${ev.stepIndex}\0${ev.destination}`);
      const buf = new Uint8Array(Math.min(PAYLOAD_CAPTURE_CAP_BYTES, list.reduce((n, p) => n + p.length, 0)));
      let off = 0;
      for (const p of list) {
        if (off >= buf.length)
          break;
        const slice = p.subarray(0, buf.length - off);
        buf.set(slice, off);
        off += slice.length;
      }
      const eventId = `ev-${this.counter++}`;
      payloads.set(eventId, buf);
      out.push({ ...ev, eventId });
    }
    return { events: out, payloads };
  }
};
var SourcedCollector = class {
  seen = /* @__PURE__ */ new Set();
  list = [];
  add(obs) {
    const key = obs.kind === "network-attempt" ? `n\0${obs.stepIndex}\0${obs.destination}` : `s\0${obs.stepIndex}\0${obs.path}`;
    if (this.seen.has(key))
      return false;
    this.seen.add(key);
    this.list.push(obs);
    return true;
  }
  observations() {
    return [...this.list];
  }
};

// ghost-runner/dist/recorder/parse-logs.js
import { createHash as createHash3 } from "node:crypto";
var SHA256 = /^[0-9a-f]{64}$/;
var BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function decodeBase64(v) {
  return BASE64.test(v) ? Buffer.from(v, "base64") : void 0;
}
function parseLines(text2) {
  const out = [];
  for (const raw of String(text2).split("\n")) {
    const line = raw.trim();
    if (line === "")
      continue;
    try {
      const v = JSON.parse(line);
      out.push({
        value: typeof v === "object" && v !== null && !Array.isArray(v) ? v : void 0
      });
    } catch {
      out.push({ value: void 0 });
    }
  }
  return out;
}
function stepOf(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : void 0;
}
function hostOf(v) {
  if (typeof v !== "string")
    return void 0;
  const h = v.trim().toLowerCase().replace(/\.$/, "");
  return h === "" || /[\s/]/.test(h) ? void 0 : h;
}
function portOf(v, fallback) {
  if (v === void 0)
    return fallback;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 65535 ? v : void 0;
}
function parseDnsLog(text2) {
  const collector = new SourcedCollector();
  const addressToHost = /* @__PURE__ */ new Map();
  let invalid = 0;
  for (const { value } of parseLines(text2)) {
    const host = hostOf(value?.["host"]);
    const step = stepOf(value?.["step"]);
    const ip = value?.["ip"];
    if (host === void 0 || step === void 0) {
      invalid++;
      continue;
    }
    if (typeof ip === "string" && ip !== "" && !addressToHost.has(ip))
      addressToHost.set(ip, host);
    collector.add({ kind: "network-attempt", stepIndex: step, destination: host, source: "dns" });
  }
  return {
    observations: collector.observations(),
    addressToHost,
    lookup: (address) => addressToHost.get(address),
    invalidLines: invalid
  };
}
function parseListenerLog(text2, source, nameFields, defaultPort) {
  const collector = new SourcedCollector();
  const captures = [];
  const bodies = [];
  let invalid = 0;
  for (const { value } of parseLines(text2)) {
    let host;
    for (const f of nameFields) {
      host = hostOf(value?.[f]);
      if (host !== void 0)
        break;
    }
    const step = stepOf(value?.["step"]);
    const port = portOf(value?.["port"], defaultPort);
    if (host === void 0 || step === void 0 || port === void 0) {
      invalid++;
      continue;
    }
    host = host.replace(/:\d+$/, "");
    const destination = `${host}:${port}`;
    collector.add({ kind: "network-attempt", stepIndex: step, destination, source });
    const bytes = value?.["bytes"];
    const sha = value?.["sha256"];
    if (typeof bytes === "number" && Number.isInteger(bytes) && bytes > 0 && typeof sha === "string" && SHA256.test(sha)) {
      captures.push({ stepIndex: step, destination, source, byteLength: bytes, sha256: sha });
    }
    const rawBody = value?.["body"];
    if (rawBody !== void 0) {
      const decoded = typeof rawBody === "string" ? decodeBase64(rawBody) : void 0;
      if (decoded === void 0 || decoded.length === 0 || decoded.length > PAYLOAD_CAPTURE_CAP_BYTES || decoded.length !== bytes || createHash3("sha256").update(decoded).digest("hex") !== sha) {
        invalid++;
      } else {
        bodies.push({ stepIndex: step, destination, body: new Uint8Array(decoded) });
      }
    }
  }
  return { observations: collector.observations(), captures, bodies, invalidLines: invalid };
}
function parseHttpLog(text2) {
  return parseListenerLog(text2, "http", ["host"], 80);
}
function parseTlsLog(text2) {
  return parseListenerLog(text2, "tls-sni", ["sni", "host"], 443);
}

// ghost-runner/dist/recorder/secret-patterns.js
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}
function normalizeRelative(path8) {
  const parts = [];
  for (const seg of path8.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".")
      continue;
    if (seg === "..")
      parts.pop();
    else
      parts.push(seg);
  }
  return parts.join("/");
}
function createSecretMatcher(patterns) {
  const compiled = patterns.map((p) => {
    const normalized = p.startsWith("./") ? p.slice(2) : p;
    return { re: globToRegExp(normalized), anyDepth: !normalized.includes("/") };
  });
  return (relativePath) => {
    const rel = normalizeRelative(relativePath);
    if (rel === "")
      return false;
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    return compiled.some((c) => c.re.test(rel) || c.anyDepth && c.re.test(base));
  };
}

// ghost-runner/dist/recorder/parse-strace.js
var WORK = "/work";
function normalizeAbsolute(path8) {
  const parts = [];
  for (const seg of path8.split("/")) {
    if (seg === "" || seg === ".")
      continue;
    if (seg === "..")
      parts.pop();
    else
      parts.push(seg);
  }
  return "/" + parts.join("/");
}
function joinPath(base, rel) {
  return normalizeAbsolute(rel.startsWith("/") ? rel : `${base}/${rel}`);
}
function toCopyRelative(abs) {
  const n = normalizeAbsolute(abs);
  if (n === WORK)
    return "";
  if (!n.startsWith(WORK + "/"))
    return void 0;
  return n.slice(WORK.length + 1);
}
function unquote(s) {
  const t = s.trim();
  if (t.length < 2 || t[0] !== '"')
    return void 0;
  const end = t.lastIndexOf('"');
  if (end < 1)
    return void 0;
  const body = t.slice(1, end);
  const bytes = [];
  const enc = new TextEncoder();
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      bytes.push(...enc.encode(c));
      continue;
    }
    const n = body[++i];
    if (n === void 0)
      break;
    const simple = { n: 10, t: 9, r: 13, f: 12, v: 11, a: 7, b: 8, '"': 34, "\\": 92 };
    if (n === "x") {
      const m = /^[0-9a-fA-F]{1,2}/.exec(body.slice(i + 1));
      if (m) {
        bytes.push(parseInt(m[0], 16));
        i += m[0].length;
      }
    } else if (/[0-7]/.test(n)) {
      const m = /^[0-7]{1,3}/.exec(body.slice(i));
      const text2 = m ? m[0] : n;
      bytes.push(parseInt(text2, 8) & 255);
      i += text2.length - 1;
    } else if (n in simple) {
      bytes.push(simple[n]);
    } else {
      bytes.push(...enc.encode(n));
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(bytes));
}
function splitArgs(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"')
        j += s[j] === "\\" ? 2 : 1;
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "<" && i > 0 && /[\w)]/.test(s[i - 1]) && depth === 0) {
      let j = i + 1;
      while (j < s.length && !(s[j] === ">" && (j + 1 >= s.length || /[,)\s]/.test(s[j + 1]))))
        j++;
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "{" || c === "[" || c === "(")
      depth++;
    else if (c === "}" || c === "]" || c === ")")
      depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim() !== "")
    out.push(cur.trim());
  return out;
}
function parseCall(name, rest) {
  const m = /\)\s+=\s+(-?\d+|\?)(<[^]*>)?(?:\s|$)/.exec(rest);
  let argText = rest;
  let ret;
  let retPath;
  const all = [...rest.matchAll(/\)\s+=\s+(-?\d+|\?)(<[^]*?>)?(?=\s|$)/g)];
  const last = all.length > 0 ? all[all.length - 1] : m;
  if (last && last.index !== void 0) {
    argText = rest.slice(0, last.index);
    ret = last[1] === "?" ? void 0 : Number(last[1]);
    const d = last[2];
    if (d && d.length > 2)
      retPath = d.slice(1, -1);
  } else {
    const trimmed = rest.trimEnd();
    argText = trimmed.endsWith(")") ? trimmed.slice(0, -1) : trimmed;
  }
  return { name, args: splitArgs(argText), ret, retPath };
}
function stripDecoration(arg) {
  const m = /^([^<"{[]+)<([^]*)>$/.exec(arg.trim());
  if (m)
    return { value: m[1].trim(), decoration: m[2] };
  return { value: arg.trim(), decoration: void 0 };
}
function formatHost(host, port) {
  return `${host}:${port}`;
}
function parseConnect(arg, opts) {
  if (arg.includes("AF_UNIX"))
    return void 0;
  const portM = /sin6?_port=htons\((\d+)\)/.exec(arg);
  if (!portM)
    return void 0;
  const port = portM[1];
  let ip;
  if (arg.includes("AF_INET6")) {
    ip = /inet_pton\(AF_INET6,\s*"([^"]*)"/.exec(arg)?.[1];
  } else if (arg.includes("AF_INET")) {
    ip = /inet_addr\("([^"]*)"\)/.exec(arg)?.[1];
  }
  if (ip === void 0 || ip === "")
    return void 0;
  ip = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped)
    ip = mapped[1];
  const isV6 = ip.includes(":");
  const loopback = isV6 ? ip === "::1" : ip.startsWith("127.");
  if (loopback) {
    const host = opts.resolveLoopback?.(ip);
    if (host === void 0)
      return void 0;
    return { destination: formatHost(host.toLowerCase(), port), source: "tcp" };
  }
  if (isV6)
    return { destination: `[${ip}]:${port}`, source: "strace-connect" };
  return { destination: formatHost(ip, port), source: "strace-connect" };
}
function opensForRead(flagsArg) {
  if (flagsArg === void 0)
    return false;
  const m = /flags=([^,}]*)/.exec(flagsArg);
  const flags = m ? m[1] : flagsArg;
  return /\bO_RDONLY\b|\bO_RDWR\b/.test(flags);
}
function trailingCandidates(rel) {
  const norm = normalizeRelative(rel);
  return norm === "" ? [] : [norm];
}
function parseStrace(text2, options) {
  const collector = new SourcedCollector();
  const isSecret = createSecretMatcher(options.secretPatterns);
  const step = options.stepIndex;
  const seedCwd = (() => {
    const c = options.cwd ?? "";
    return c.startsWith("/") ? normalizeAbsolute(c) : joinPath(WORK, c);
  })();
  const cwds = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  let ignored = 0;
  const cwdOf = (pid) => cwds.get(pid) ?? seedCwd;
  const emitSecret = (rel) => {
    if (rel !== "" && isSecret(rel)) {
      collector.add({ kind: "secret-read", stepIndex: step, path: normalizeRelative(rel), source: "strace-openat" });
    }
  };
  const handleOpen = (pid, call) => {
    if (call.ret === void 0 || call.ret < 0)
      return;
    const name = call.name;
    let dirfdArg;
    let pathArg;
    let flagsArg;
    if (name === "open") {
      [pathArg, flagsArg] = call.args;
    } else {
      [dirfdArg, pathArg, flagsArg] = call.args;
    }
    if (pathArg === void 0 || !opensForRead(flagsArg))
      return;
    const path8 = unquote(pathArg);
    if (path8 === void 0 || path8 === "")
      return;
    const candidates = /* @__PURE__ */ new Set();
    let resolved = false;
    if (path8.startsWith("/")) {
      const rel = toCopyRelative(path8);
      if (rel !== void 0)
        candidates.add(rel);
      resolved = true;
    } else if (dirfdArg === void 0 || dirfdArg.startsWith("AT_FDCWD")) {
      let base = cwdOf(pid);
      if (dirfdArg !== void 0) {
        const dec = stripDecoration(dirfdArg).decoration;
        if (dec?.startsWith("/"))
          base = normalizeAbsolute(dec);
      }
      const rel = toCopyRelative(joinPath(base, path8));
      if (rel !== void 0)
        candidates.add(rel);
      resolved = true;
    } else {
      const dec = stripDecoration(dirfdArg).decoration;
      if (dec?.startsWith("/")) {
        const rel = toCopyRelative(joinPath(dec, path8));
        if (rel !== void 0)
          candidates.add(rel);
        resolved = true;
      }
    }
    if (call.retPath?.startsWith("/")) {
      const rel = toCopyRelative(call.retPath);
      if (rel !== void 0)
        candidates.add(rel);
      resolved = true;
    }
    if (!resolved) {
      for (const c of trailingCandidates(path8))
        candidates.add(c);
    }
    for (const rel of candidates)
      emitSecret(rel);
  };
  const handleCall = (pid, call) => {
    switch (call.name) {
      case "openat":
      case "open":
      case "openat2":
        handleOpen(pid, call);
        return;
      case "connect": {
        const sock = call.args[1];
        if (sock === void 0)
          return;
        const c = parseConnect(sock, options);
        if (c)
          collector.add({ kind: "network-attempt", stepIndex: step, destination: c.destination, source: c.source });
        return;
      }
      case "chdir": {
        if (call.ret !== 0 || call.args[0] === void 0)
          return;
        const p = unquote(call.args[0]);
        if (p !== void 0)
          cwds.set(pid, joinPath(cwdOf(pid), p));
        return;
      }
      case "fchdir": {
        if (call.ret !== 0 || call.args[0] === void 0)
          return;
        const dec = stripDecoration(call.args[0]).decoration;
        if (dec?.startsWith("/"))
          cwds.set(pid, normalizeAbsolute(dec));
        return;
      }
      default:
        return;
    }
  };
  for (const raw of String(text2).split("\n")) {
    try {
      const line = raw.trim();
      if (line === "")
        continue;
      const pm = /^(?:\[pid\s+(\d+)\]\s*|(\d+)\s+)/.exec(line);
      const pid = pm ? Number(pm[1] ?? pm[2]) : 0;
      const body = pm ? line.slice(pm[0].length) : line;
      const resumed = /^<\.\.\.\s+(\w+)\s+resumed>(.*)$/.exec(body);
      if (resumed) {
        const key = `${pid}:${resumed[1]}`;
        const p = pending.get(key);
        if (!p) {
          ignored++;
          continue;
        }
        pending.delete(key);
        handleCall(pid, parseCall(p.name, p.prefix + resumed[2]));
        continue;
      }
      const unfinished = /^(\w+)\((.*?)\s*<unfinished \.\.\.>\s*$/.exec(body);
      if (unfinished) {
        const name = unfinished[1];
        const prefix = unfinished[2];
        pending.set(`${pid}:${name}`, { name, prefix });
        if (name === "connect")
          handleCall(pid, parseCall(name, prefix));
        continue;
      }
      const call = /^(\w+)\((.*)$/.exec(body);
      if (call) {
        handleCall(pid, parseCall(call[1], call[2]));
      } else {
        ignored++;
      }
    } catch {
      ignored++;
    }
  }
  return { observations: collector.observations(), ignoredLines: ignored };
}

// ghost-runner/dist/recorder/collect.js
var RECORDER_MAX_BYTES = 64 * 1024 * 1024;
var REC_DIR2 = "ghost-rec";
var BLOCK = 512;
var TAR_OVERHEAD_BYTES = 4 * 1024 * 1024;
function cstr(buf, start, len) {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul < 0 ? len : nul).toString("utf8");
}
function octal(buf, start, len) {
  const s = cstr(buf, start, len).trim();
  if (!/^[0-7]+$/.test(s))
    return void 0;
  const n = parseInt(s, 8);
  return Number.isSafeInteger(n) ? n : void 0;
}
function flatName(full) {
  if (!full.startsWith(`${REC_DIR2}/`))
    return void 0;
  const rest = full.slice(REC_DIR2.length + 1);
  if (rest === "" || rest.includes("/") || rest.includes("\\") || rest.includes("\0"))
    return void 0;
  if (rest.startsWith(".") || rest === "..")
    return void 0;
  return rest;
}
var MAX_PAX_BYTES = 64 * 1024;
function parsePax(body) {
  const out = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < body.length) {
    if (body[i] === 0)
      break;
    const sp = body.indexOf(32, i);
    if (sp < 0)
      return void 0;
    const lenText = body.subarray(i, sp).toString("ascii");
    if (!/^[0-9]+$/.test(lenText))
      return void 0;
    const len = parseInt(lenText, 10);
    if (len <= sp - i + 1 || i + len > body.length || body[i + len - 1] !== 10)
      return void 0;
    const rec = body.subarray(sp + 1, i + len - 1).toString("utf8");
    const eq = rec.indexOf("=");
    if (eq <= 0)
      return void 0;
    out.set(rec.slice(0, eq), rec.slice(eq + 1));
    i += len;
  }
  return out;
}
function readTar(data, limits) {
  const files = /* @__PURE__ */ new Map();
  const bad = (detail) => ({ ok: false, reason: "tar-invalid", detail });
  let off = 0;
  let total = 0;
  let pax;
  for (; ; ) {
    if (off + BLOCK > data.length)
      return bad("truncated archive");
    const h = data.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0))
      return { ok: true, files };
    const stored = octal(h, 148, 8);
    if (stored === void 0)
      return bad("bad checksum field");
    let sum = 0;
    for (let i = 0; i < BLOCK; i++)
      sum += i >= 148 && i < 156 ? 32 : h[i];
    if (sum !== stored)
      return bad("checksum mismatch");
    const prefix = cstr(h, 345, 155);
    const nm = cstr(h, 0, 100);
    const type = String.fromCharCode(h[156]);
    const headerSize = octal(h, 124, 12);
    if (headerSize === void 0)
      return bad("bad size field");
    off += BLOCK;
    if (type === "x" || type === "g") {
      if (headerSize > MAX_PAX_BYTES)
        return bad("oversized extended header");
      const padded2 = Math.ceil(headerSize / BLOCK) * BLOCK;
      if (off + padded2 > data.length)
        return bad("truncated extended header");
      const records = parsePax(data.subarray(off, off + headerSize));
      if (records === void 0)
        return bad("malformed extended header");
      off += padded2;
      if (type === "x") {
        if (pax !== void 0)
          return bad("consecutive extended headers");
        pax = records;
      }
      continue;
    }
    const paxPath = pax?.get("path");
    const paxSize = pax?.get("size");
    pax = void 0;
    const full = paxPath ?? (prefix === "" ? nm : `${prefix}/${nm}`);
    let size = headerSize;
    if (paxSize !== void 0) {
      if (!/^[0-9]+$/.test(paxSize))
        return bad("bad extended size");
      size = Number(paxSize);
      if (!Number.isSafeInteger(size))
        return bad("bad extended size");
    }
    if (type === "5") {
      if (full !== `${REC_DIR2}/` && full !== REC_DIR2)
        return bad("unexpected directory entry");
      continue;
    }
    if (type !== "0" && type !== "\0")
      return bad(`unsupported entry type ${JSON.stringify(type)}`);
    const name = flatName(full);
    if (name === void 0)
      return bad("rejected entry name");
    if (files.has(name))
      return bad("duplicate entry");
    if (size > limits.maxEntryBytes)
      return { ok: false, reason: "over-cap", detail: "oversized entry" };
    total += size;
    if (total > limits.maxTotalBytes)
      return { ok: false, reason: "over-cap", detail: "total size over cap" };
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    if (off + padded > data.length)
      return bad("truncated entry");
    files.set(name, Buffer.from(data.subarray(off, off + size)));
    off += padded;
  }
}
var RECORDER = { location: "in-box", tamperResistant: false };
function failure(reason, stepIndex) {
  return {
    name: "recorder-failure",
    ...stepIndex !== void 0 ? { stepIndex } : {},
    detail: { reason }
  };
}
function failed(reason, extra = []) {
  return {
    observations: [],
    events: [],
    captures: [],
    payloads: /* @__PURE__ */ new Map(),
    payloadCaptures: [],
    diagnostics: [failure(reason), ...extra],
    recorderOk: false,
    recorder: RECORDER
  };
}
function parseMarkers(text2) {
  const markers = /* @__PURE__ */ new Map();
  let bad = false;
  for (const raw of text2.split("\n")) {
    const line = raw.trim();
    if (line === "")
      continue;
    let v;
    try {
      v = JSON.parse(line);
    } catch {
      bad = true;
      continue;
    }
    const o = typeof v === "object" && v !== null && !Array.isArray(v) ? v : void 0;
    const end = o?.["end"];
    if (o === void 0 || typeof end !== "number" || !Number.isInteger(end) || end < 0) {
      bad = true;
      continue;
    }
    if (markers.has(end)) {
      bad = true;
      continue;
    }
    const exit = o["exit"];
    markers.set(end, { exit: typeof exit === "number" ? exit : void 0, probe: o["probe"] === true });
  }
  return { markers, bad };
}
async function collectRecorder(client, containerId, opts) {
  const maxBytes = opts.maxBytes ?? RECORDER_MAX_BYTES;
  const outCap = maxBytes + TAR_OVERHEAD_BYTES;
  const res = await client.run(["cp", `${containerId}:/${REC_DIR2}`, "-"], {
    maxOutputBytes: outCap + 1,
    ...opts.timeoutMs !== void 0 ? { timeoutMs: opts.timeoutMs } : {},
    ...opts.deadlineAt !== void 0 ? { deadlineAt: opts.deadlineAt } : {}
  });
  if (res.spawnError !== void 0 || res.timedOut || res.code !== 0)
    return failed("cp-failed");
  if (res.stdout.length > outCap)
    return failed("over-cap");
  const tar = readTar(res.stdout, { maxTotalBytes: maxBytes, maxEntryBytes: maxBytes });
  if (!tar.ok)
    return failed(tar.reason);
  const files = tar.files;
  const text2 = (name) => files.get(name)?.toString("utf8") ?? "";
  const diagnostics = [];
  const { markers, bad: markersBad } = parseMarkers(text2("steps.jsonl"));
  if (markersBad)
    diagnostics.push(failure("unparseable"));
  const dns = parseDnsLog(text2("dns.jsonl"));
  const http2 = parseHttpLog(text2("http.jsonl"));
  const tls = parseTlsLog(text2("tls.jsonl"));
  if (dns.invalidLines + http2.invalidLines + tls.invalidLines > 0)
    diagnostics.push(failure("unparseable"));
  const merged = new SourcedCollector();
  const add = (list) => {
    for (const o of list)
      merged.add(o);
  };
  add(dns.observations);
  add(http2.observations);
  add(tls.observations);
  for (let i = 0; i < opts.executedSteps; i++) {
    const strace = files.get(`step-${i}.strace`);
    if (strace === void 0)
      diagnostics.push(failure("missing-strace", i));
    const marker = markers.get(i);
    if (marker === void 0)
      diagnostics.push(failure("missing-end-marker", i));
    else if (!marker.probe)
      diagnostics.push(failure("probe-failed", i));
    if (strace !== void 0) {
      const cwd = opts.cwds?.[i];
      add(parseStrace(strace.toString("utf8"), {
        stepIndex: i,
        ...cwd !== void 0 ? { cwd } : {},
        secretPatterns: opts.secretPatterns,
        resolveLoopback: dns.lookup
      }).observations);
    }
  }
  const observations = merged.observations();
  const built = (opts.eventBuilder ?? new EventBuilder()).build(toObservedEvents(observations), [
    ...http2.bodies,
    ...tls.bodies
  ]);
  const payloadCaptures = [...built.payloads].map(([eventId, bytes]) => ({
    eventId,
    byteLength: bytes.length,
    sha256: createHash4("sha256").update(bytes).digest("hex")
  }));
  return {
    observations,
    events: built.events,
    captures: [...http2.captures, ...tls.captures],
    payloads: built.payloads,
    payloadCaptures,
    diagnostics,
    recorderOk: diagnostics.length === 0,
    recorder: RECORDER
  };
}

// ghost-runner/dist/docker/owner.js
import { execFileSync } from "node:child_process";
var UNKNOWN_START = "unknown";
function processStartTime(pid) {
  try {
    const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2e3,
      stdio: ["ignore", "pipe", "ignore"],
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LC_ALL: "C" }
    });
    const t = out.trim().replace(/\s+/g, " ");
    return t === "" ? void 0 : t;
  } catch {
    return void 0;
  }
}
function parseOwner(owner) {
  const i = owner.indexOf(":");
  if (i <= 0)
    return void 0;
  const pid = Number(owner.slice(0, i));
  if (!Number.isInteger(pid) || pid <= 0)
    return void 0;
  return { pid, start: owner.slice(i + 1) };
}
function ownerIsAlive(owner) {
  const parsed = parseOwner(owner);
  if (parsed === void 0)
    return true;
  try {
    process.kill(parsed.pid, 0);
  } catch (e) {
    return e.code === "EPERM";
  }
  if (parsed.start === UNKNOWN_START)
    return true;
  const now = processStartTime(parsed.pid);
  return now === void 0 || now === parsed.start;
}
function currentProcessInfo() {
  const pid = process.pid;
  const owner = `${String(pid)}:${processStartTime(pid) ?? UNKNOWN_START}`;
  return { pid, owner, isAlive: ownerIsAlive };
}
var cached;
function processInfo() {
  if (cached === void 0 || cached.pid !== process.pid)
    cached = currentProcessInfo();
  return cached;
}

// ghost-runner/dist/docker/reaper.js
import { spawnSync } from "node:child_process";
var SYNC_BUDGET_MS = 4e3;
var active = /* @__PURE__ */ new Set();
var installed = false;
function trackRun(runId) {
  active.add(runId);
  install();
}
function untrackRun(runId) {
  active.delete(runId);
}
function trackedRunIds() {
  return [...active];
}
function reapRunsSync(runIds = trackedRunIds(), docker = "docker") {
  const done = [];
  const deadline = Date.now() + SYNC_BUDGET_MS;
  for (const runId of runIds) {
    const left = deadline - Date.now();
    if (left <= 0)
      break;
    const ps = spawnSync(docker, ["ps", "-a", "-q", "--filter", `label=${LABEL_RUN_ID}=${runId}`], {
      encoding: "utf8",
      timeout: left,
      stdio: ["ignore", "pipe", "ignore"]
    });
    if (ps.status !== 0)
      continue;
    const ids = ps.stdout.split("\n").map((s) => s.trim()).filter((s) => s !== "");
    let ok = true;
    for (const id of ids) {
      const rm4 = spawnSync(docker, ["rm", "-f", "-v", id], {
        timeout: Math.max(500, deadline - Date.now()),
        stdio: "ignore"
      });
      if (rm4.status !== 0)
        ok = false;
    }
    if (ok) {
      active.delete(runId);
      done.push(runId);
    }
  }
  return done;
}
function install() {
  if (installed)
    return;
  installed = true;
  process.on("exit", () => {
    if (active.size > 0)
      reapRunsSync();
  });
  for (const sig of ["SIGINT", "SIGTERM"]) {
    const onSignal = () => {
      if (active.size > 0)
        reapRunsSync();
      process.off(sig, onSignal);
      if (process.listenerCount(sig) === 0)
        process.kill(process.pid, sig);
    };
    process.on(sig, onSignal);
  }
}

// ghost-runner/dist/fs/sqlite.js
var BOX_WORKDIR = "/work";
var GHOST_COUNT = "ghost-count";
function buildCountInvocation(relPaths) {
  if (relPaths.length === 0)
    return void 0;
  const unique = [...new Set(relPaths)].sort();
  return [GHOST_COUNT, "--", ...unique.map((p) => `${BOX_WORKDIR}/${p}`)];
}
function isCounts(v) {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    return false;
  return Object.values(v).every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0);
}
function parseCountOutput(stdout, exitCode, relPaths) {
  const entries = (value) => relPaths.map((p) => [p, value(p)]);
  const allUnreadable = () => Object.fromEntries(entries(() => "unreadable"));
  if (exitCode !== 0)
    return allUnreadable();
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return allUnreadable();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return allUnreadable();
  const obj2 = parsed;
  return Object.fromEntries(entries((p) => {
    const key = `${BOX_WORKDIR}/${p}`;
    if (!Object.hasOwn(obj2, key))
      return "unreadable";
    const v = obj2[key];
    if (v === "unreadable")
      return "unreadable";
    if (!isCounts(v))
      return "unreadable";
    return Object.fromEntries(Object.entries(v));
  }));
}
function nextSqliteState(previous, counted, existing) {
  const out = [];
  for (const [p, c] of Object.entries(previous)) {
    if (existing.has(p) && !Object.hasOwn(counted, p))
      out.push([p, c]);
  }
  for (const [p, c] of Object.entries(counted)) {
    if (existing.has(p))
      out.push([p, c]);
  }
  return Object.fromEntries(out.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
}

// ghost-runner/dist/docker/cli.js
import { spawn as spawn2 } from "node:child_process";
var PIPELINE_DEADLINE_MS = 55e3;
var systemClock = { now: () => Date.now() };
function remainingMs(deadlineAt, clock = systemClock) {
  return Math.max(0, deadlineAt - clock.now());
}
function effectiveTimeoutMs(opts, clock = systemClock) {
  const candidates = [];
  if (opts.timeoutMs !== void 0)
    candidates.push(Math.max(0, opts.timeoutMs));
  if (opts.deadlineAt !== void 0)
    candidates.push(remainingMs(opts.deadlineAt, clock));
  return candidates.length === 0 ? PIPELINE_DEADLINE_MS : Math.min(...candidates);
}
var DEFAULT_MAX_OUTPUT = 16 * 1024 * 1024;
function createDockerClient(file = "docker", clock = systemClock) {
  return {
    run(args, opts = {}) {
      const timeoutMs = effectiveTimeoutMs(opts, clock);
      const cap = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
      return new Promise((resolve7) => {
        if (timeoutMs <= 0) {
          resolve7({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: true });
          return;
        }
        const out = [];
        const err2 = [];
        let outLen = 0;
        let errLen = 0;
        let timedOut = false;
        let settled = false;
        const child = spawn2(file, [...args], {
          shell: false,
          stdio: [opts.stdin ? "pipe" : "ignore", "pipe", "pipe"]
        });
        const finish = (r) => {
          if (settled)
            return;
          settled = true;
          clearTimeout(timer);
          resolve7(r);
        };
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutMs);
        child.stdout?.on("data", (c) => {
          if (outLen < cap) {
            out.push(c);
            outLen += c.length;
          }
        });
        child.stderr?.on("data", (c) => {
          if (errLen < cap) {
            err2.push(c);
            errLen += c.length;
          }
        });
        child.on("error", (e) => {
          finish({ code: null, stdout: Buffer.concat(out), stderr: Buffer.concat(err2), timedOut, spawnError: e.message });
        });
        child.on("close", (code) => {
          finish({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err2), timedOut });
        });
        if (opts.stdin && child.stdin) {
          child.stdin.on("error", () => void 0);
          child.stdin.end(opts.stdin);
        }
      });
    }
  };
}

// ghost-runner/dist/docker/box.js
var systemClock2 = { now: () => Date.now() };
var CREATE_TIMEOUT_MS = 1e4;
var INSPECT_TIMEOUT_MS = 5e3;
var KILL_TIMEOUT_MS = 5e3;
var COLLECT_TIMEOUT_MS = 1e4;
var COUNT_TIMEOUT_MS = 15e3;
var COLLECT_GRACE_MS = 2e3;
var CLEANUP_RM_TIMEOUT_MS = 5e3;
var CLEANUP_LIST_TIMEOUT_MS = 3e3;
var RUN_ID_CHECK_TIMEOUT_MS = 3e3;
function text(b) {
  return b.toString("utf8");
}
async function findRunIdContainers(client, runId) {
  const r = await client.run(["ps", "-a", "-q", "--filter", `label=${LABEL_RUN_ID}=${runId}`], {
    timeoutMs: RUN_ID_CHECK_TIMEOUT_MS
  });
  if (r.code !== 0)
    return { ok: false, detail: r.timedOut ? "timeout" : r.spawnError ?? `exit ${String(r.code)}` };
  return { ok: true, ids: text(r.stdout).split("\n").map((s) => s.trim()).filter((s) => s !== "") };
}
async function removeRunContainers(client, runId, ref) {
  const details = [];
  if (ref !== void 0) {
    const r = await client.run(["rm", "-f", "-v", ref], { timeoutMs: CLEANUP_RM_TIMEOUT_MS });
    if (r.code === 0)
      return { ok: true };
    const err2 = text(r.stderr);
    if (r.code !== null && /no such container/i.test(err2))
      return { ok: true };
    details.push(`rm ${ref}: ${r.timedOut ? "timeout" : r.spawnError ?? (err2.trim() || `exit ${String(r.code)}`)}`);
  }
  const list = await client.run(["ps", "-a", "-q", "--filter", `label=${LABEL_RUN_ID}=${runId}`], {
    timeoutMs: CLEANUP_LIST_TIMEOUT_MS
  });
  if (list.code !== 0) {
    details.push("ps by run-id label failed");
    return { ok: false, detail: details.join("; ") };
  }
  const ids = text(list.stdout).split("\n").map((s) => s.trim()).filter((s) => s !== "");
  let failed2 = 0;
  for (const id of ids) {
    const r = await client.run(["rm", "-f", "-v", id], { timeoutMs: CLEANUP_RM_TIMEOUT_MS });
    if (r.code !== 0 && !(r.code !== null && /no such container/i.test(text(r.stderr))))
      failed2 += 1;
  }
  if (failed2 > 0)
    details.push(`${String(failed2)} container(s) could not be removed`);
  return details.length === 0 ? { ok: true } : { ok: false, detail: details.join("; ") };
}
async function createBox(client, p) {
  const clock = p.clock ?? systemClock2;
  trackRun(p.runId);
  const args = buildRunArgs({
    image: p.image,
    ...p.limits !== void 0 ? { limits: p.limits } : {},
    uid: p.uid,
    gid: p.gid,
    owner: p.owner ?? p.poolOwner ?? processInfo().owner,
    ...p.poolOwner !== void 0 ? { poolOwner: p.poolOwner } : {},
    ...p.maxLifetimeSec !== void 0 ? { maxLifetimeSec: p.maxLifetimeSec } : {}
  }, p.runId, p.mounts);
  const created = await client.run(args, { timeoutMs: CREATE_TIMEOUT_MS, deadlineAt: p.deadlineAt });
  const lines = text(created.stdout).split("\n").map((s) => s.trim()).filter((s) => s !== "");
  const containerId = lines[lines.length - 1];
  if (created.code !== 0 || containerId === void 0 || !/^[A-Za-z0-9_.-]+$/.test(containerId)) {
    const why = created.timedOut ? "docker run timed out" : created.spawnError ?? (text(created.stderr).trim() || "docker run failed");
    const cleanup2 = await removeRunContainers(client, p.runId);
    if (cleanup2.ok)
      untrackRun(p.runId);
    return { ok: false, kind: "create-failed", detail: why.slice(0, 300), cleanup: cleanup2 };
  }
  const inspect = await client.run(["inspect", containerId], { timeoutMs: INSPECT_TIMEOUT_MS, deadlineAt: p.deadlineAt });
  let differences;
  if (inspect.code !== 0) {
    differences = [inspect.timedOut ? "inspect timed out" : "inspect failed"];
  } else {
    let json;
    try {
      json = JSON.parse(text(inspect.stdout));
    } catch {
      json = void 0;
    }
    if (json === void 0) {
      differences = ["inspect output is not valid JSON"];
    } else {
      const audit = auditInspect({
        image: p.image,
        mounts: expectedMounts(p.mounts),
        ...p.imageEnv !== void 0 ? { imageEnv: p.imageEnv } : {}
      }, json);
      if (!audit.ok)
        differences = audit.differences;
    }
  }
  if (differences !== void 0) {
    const cleanup2 = await removeRunContainers(client, p.runId, containerId);
    if (cleanup2.ok)
      untrackRun(p.runId);
    return { ok: false, kind: "isolation-violation", differences, cleanup: cleanup2 };
  }
  return { ok: true, box: new DockerBox(client, p, containerId, clock) };
}
var DockerBox = class {
  client;
  p;
  containerId;
  clock;
  killed = false;
  execUsedMs = 0;
  deadlineAt;
  execLimitMs;
  cleaned;
  constructor(client, p, containerId, clock) {
    this.client = client;
    this.p = p;
    this.containerId = containerId;
    this.clock = clock;
    this.deadlineAt = p.deadlineAt;
    this.execLimitMs = p.execLimitMs;
  }
  rearm(deadlineAt, execLimitMs) {
    this.deadlineAt = deadlineAt;
    this.execLimitMs = execLimitMs;
    this.execUsedMs = 0;
  }
  get runId() {
    return this.p.runId;
  }
  execBudgetLeftMs() {
    return Math.max(0, this.execLimitMs - this.execUsedMs);
  }
  async kill() {
    this.killed = true;
    await this.client.run(["kill", this.containerId], { timeoutMs: KILL_TIMEOUT_MS });
  }
  async exec(stepIndex, action, cwd) {
    if (this.killed)
      return { kind: "error", detail: "box was already killed" };
    const execLeft = this.execBudgetLeftMs();
    const pipelineLeft = remainingMs(this.deadlineAt, this.clock);
    const reason = pipelineLeft <= execLeft ? "pipeline-deadline" : "exec-limit";
    const budget = Math.min(execLeft, pipelineLeft);
    if (budget <= 0) {
      await this.kill();
      return { kind: "timeout", reason, durationMs: 0 };
    }
    const started = this.clock.now();
    const res = await this.client.run(buildExecArgs(this.containerId, stepIndex, cwd, action), { timeoutMs: budget });
    const durationMs = Math.max(0, this.clock.now() - started);
    this.execUsedMs += durationMs;
    if (res.timedOut) {
      await this.kill();
      return { kind: "timeout", reason, durationMs };
    }
    if (res.spawnError !== void 0 || res.code === null) {
      return { kind: "error", detail: res.spawnError ?? "docker exec ended without an exit code" };
    }
    return { kind: "exited", exitCode: res.code, stdout: res.stdout, stderr: res.stderr, durationMs };
  }
  async countSqlite(relPaths) {
    const argv = buildCountInvocation(relPaths);
    if (argv === void 0)
      return {};
    if (this.killed)
      return parseCountOutput("", 1, relPaths);
    const res = await this.client.run(["exec", "-w", "/work", this.containerId, ...argv], {
      timeoutMs: COUNT_TIMEOUT_MS,
      deadlineAt: this.deadlineAt + COLLECT_GRACE_MS
    });
    const code = res.timedOut || res.spawnError !== void 0 ? 1 : res.code ?? 1;
    return parseCountOutput(text(res.stdout), code, relPaths);
  }
  collect(opts) {
    return collectRecorder(this.client, this.containerId, {
      ...opts,
      timeoutMs: COLLECT_TIMEOUT_MS,
      deadlineAt: this.deadlineAt + COLLECT_GRACE_MS
    });
  }
  async cleanup() {
    if (this.cleaned?.ok === true)
      return this.cleaned;
    this.cleaned = await removeRunContainers(this.client, this.p.runId, this.containerId);
    if (this.cleaned.ok)
      untrackRun(this.p.runId);
    return this.cleaned;
  }
};

// ghost-runner/dist/fs/differ.js
import { constants as fsc } from "node:fs";
import { lstat as lstat3, open, readlink as readlink2 } from "node:fs/promises";
import { createHash as createHash5 } from "node:crypto";
import { join as join5 } from "node:path";

// ghost-runner/dist/fs/manifest.js
import { lstat as lstat2, readdir as readdir3, readlink } from "node:fs/promises";
import { join as join4 } from "node:path";
function compareBytes(a, b) {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
function entryTypeOf(st) {
  if (st.isSymbolicLink())
    return "symlink";
  if (st.isDirectory())
    return "dir";
  if (st.isFile())
    return "file";
  return "other";
}
function entryFromStats(path8, st, target) {
  const base = {
    path: path8,
    type: entryTypeOf(st),
    size: Number(st.size),
    mode: Number(st.mode),
    mtimeNs: st.mtimeNs.toString(),
    ctimeNs: st.ctimeNs.toString()
  };
  return target === void 0 ? base : { ...base, target };
}
async function walkManifest(root, opts = {}) {
  const exclude = new Set(opts.excludeDirs ?? []);
  const out = [];
  async function visit(absDir, relDir) {
    let names;
    try {
      names = await readdir3(absDir);
    } catch (e) {
      throw new FingerprintReadError(relDir === "" ? "." : relDir, e);
    }
    const subdirs = [];
    await Promise.all(names.map(async (name) => {
      const abs = join4(absDir, name);
      const rel = relDir === "" ? name : `${relDir}/${name}`;
      let st;
      try {
        st = await lstat2(abs, { bigint: true });
      } catch (e) {
        throw new FingerprintReadError(rel, e);
      }
      const type = entryTypeOf(st);
      if (type === "dir" && exclude.has(name))
        return;
      let target;
      if (type === "symlink") {
        try {
          target = await readlink(abs);
        } catch (e) {
          throw new FingerprintReadError(rel, e);
        }
      }
      out.push(entryFromStats(rel, st, target));
      if (type === "dir")
        subdirs.push([abs, rel]);
    }));
    await Promise.all(subdirs.map(([abs, rel]) => visit(abs, rel)));
  }
  await visit(root, "");
  out.sort((a, b) => compareBytes(a.path, b.path));
  return out;
}

// ghost-runner/dist/fs/differ.js
function sameFileContent(a, b) {
  if (a.size !== b.size)
    return false;
  if (a.hash === void 0 || b.hash === void 0)
    return true;
  return a.hash === b.hash;
}
function compareChanges(a, b) {
  const pa = String(a["path"]);
  const pb = String(b["path"]);
  return compareBytes(pa, pb) || compareBytes(a.kind, b.kind) || compareBytes(String(a["table"] ?? ""), String(b["table"] ?? ""));
}
function indexByPath(entries) {
  return new Map(entries.map((e) => [e.path, e]));
}
function diff(before, after) {
  const out = [];
  const b = indexByPath(before.entries);
  const a = indexByPath(after.entries);
  for (const [path8, be] of b) {
    const ae = a.get(path8);
    if (ae === void 0) {
      out.push({ kind: "file-deleted", path: path8, entryType: be.type });
    } else if (ae.type !== be.type) {
      out.push({ kind: "file-deleted", path: path8, entryType: be.type });
      out.push({ kind: "file-created", path: path8, entryType: ae.type });
    } else if (be.type === "file") {
      if (!sameFileContent(be, ae)) {
        out.push({ kind: "file-overwritten", path: path8, sizeBefore: be.size, sizeAfter: ae.size });
      }
    } else if (be.type === "symlink") {
      if ((be.target ?? "") !== (ae.target ?? "")) {
        out.push({
          kind: "symlink-changed",
          path: path8,
          targetBefore: be.target ?? "",
          targetAfter: ae.target ?? ""
        });
      }
    }
  }
  for (const [path8, ae] of a) {
    if (!b.has(path8))
      out.push({ kind: "file-created", path: path8, entryType: ae.type });
  }
  out.push(...sqlChanges(before.sqlite, after.sqlite, a));
  return out.sort(compareChanges);
}
function sqlChanges(before, after, afterEntries) {
  const out = [];
  const paths = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const path8 of paths) {
    const bc = Object.hasOwn(before, path8) ? before[path8] : void 0;
    const fileExists = afterEntries.has(path8);
    const ac = Object.hasOwn(after, path8) ? after[path8] : fileExists ? void 0 : {};
    if (ac === void 0 || ac === "unreadable" || bc === "unreadable")
      continue;
    const bt = bc ?? {};
    const tables = /* @__PURE__ */ new Set([...Object.keys(bt), ...Object.keys(ac)]);
    for (const table of tables) {
      const inBefore = Object.hasOwn(bt, table);
      const inAfter = Object.hasOwn(ac, table);
      const rowsBefore = inBefore ? bt[table] : 0;
      const rowsAfter = inAfter ? ac[table] : 0;
      if (inBefore && !inAfter) {
        out.push({ kind: "sql-row-count", path: path8, table, rowsBefore, rowsAfter: 0, dropped: true });
      } else if (!inBefore && inAfter) {
        out.push({ kind: "sql-row-count", path: path8, table, rowsBefore: 0, rowsAfter });
      } else if (rowsBefore !== rowsAfter) {
        out.push({ kind: "sql-row-count", path: path8, table, rowsBefore, rowsAfter });
      }
    }
  }
  return out;
}
function diffDiagnostics(before, after, stepIndex) {
  const out = [];
  const b = indexByPath(before.entries);
  const a = indexByPath(after.entries);
  for (const [path8, ae] of a) {
    const be = b.get(path8);
    if (be === void 0 || be.type !== ae.type || ae.type === "symlink")
      continue;
    if (be.mode === ae.mode)
      continue;
    if (ae.type === "file" && !sameFileContent(be, ae))
      continue;
    out.push({
      name: "mode-changed",
      stepIndex,
      path: path8,
      detail: { modeBefore: be.mode, modeAfter: ae.mode }
    });
  }
  for (const [path8, c] of Object.entries(after.sqlite)) {
    if (c !== "unreadable")
      continue;
    const wasUnreadable = Object.hasOwn(before.sqlite, path8) && before.sqlite[path8] === "unreadable";
    const be = b.get(path8);
    const ae = a.get(path8);
    const changed = be === void 0 || ae === void 0 || !sameFileContent(be, ae);
    if (!wasUnreadable || changed)
      out.push({ name: "sqlite-unreadable", stepIndex, path: path8 });
  }
  return out.sort((x, y) => compareBytes(x.path ?? "", y.path ?? "") || compareBytes(x.name, y.name));
}
var CHUNK = 64 * 1024;
var SwappedError = class extends Error {
};
async function hashRound(root, path8) {
  const abs = join5(root, path8);
  let fh;
  try {
    fh = await open(abs, fsc.O_RDONLY | fsc.O_NOFOLLOW | fsc.O_NONBLOCK);
  } catch (e) {
    throw new SwappedError(String(e));
  }
  try {
    const walked = await lstat3(abs, { bigint: true }).catch(() => void 0);
    const pre = await fh.stat({ bigint: true });
    if (walked === void 0 || !pre.isFile() || !walked.isFile() || pre.ino !== walked.ino || pre.dev !== walked.dev) {
      throw new SwappedError("identity changed");
    }
    const h = createHash5("sha256");
    const buf = Buffer.allocUnsafe(CHUNK);
    for (; ; ) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, null);
      if (bytesRead === 0)
        break;
      h.update(buf.subarray(0, bytesRead));
    }
    const post = await fh.stat({ bigint: true });
    const stable = pre.ctimeNs === post.ctimeNs && pre.mtimeNs === post.mtimeNs && pre.size === post.size;
    return { hash: h.digest("hex"), pre, stable };
  } finally {
    await fh.close().catch(() => void 0);
  }
}
async function relstat(root, path8) {
  const abs = join5(root, path8);
  let st;
  try {
    st = await lstat3(abs, { bigint: true });
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") {
      return void 0;
    }
    throw new FingerprintReadError(path8, e);
  }
  let target;
  if (st.isSymbolicLink()) {
    try {
      target = await readlink2(abs);
    } catch (e) {
      throw new FingerprintReadError(path8, e);
    }
  }
  return entryFromStats(path8, st, target);
}
async function hashCandidate(root, entry, stepIndex, diagnostics) {
  let current = entry;
  for (let swaps = 0; ; swaps++) {
    if (current.type !== "file")
      return current;
    try {
      let round = await hashRound(root, current.path);
      if (!round.stable) {
        round = await hashRound(root, current.path);
        if (!round.stable)
          diagnostics.push({ name: "diff-unstable", stepIndex, path: current.path });
      }
      return { ...entryFromStats(current.path, round.pre), hash: round.hash };
    } catch (e) {
      if (!(e instanceof SwappedError)) {
        throw e instanceof FingerprintReadError ? e : new FingerprintReadError(current.path, e);
      }
      diagnostics.push({ name: "baseline-race", stepIndex, path: current.path });
      const fresh = await relstat(root, current.path);
      if (fresh === void 0)
        return void 0;
      if (swaps >= 1 && fresh.type === "file")
        throw new FingerprintReadError(current.path, e);
      current = fresh;
    }
  }
}
function isCandidate(e, prev, baseline) {
  if (prev === void 0 || prev.type !== "file" || prev.hash === void 0)
    return true;
  return BigInt(e.ctimeNs) >= baseline || e.size !== prev.size || e.mode !== prev.mode || e.mtimeNs !== prev.mtimeNs;
}
async function advanceEntries(opts) {
  const now = opts.nowNs ?? (() => BigInt(Date.now()) * 1000000n);
  const walkStart = now();
  const baseline = BigInt(opts.baselineNs);
  const diagnostics = [];
  const prev = indexByPath(opts.previous);
  const walked = await walkManifest(opts.root, opts.excludeDirs === void 0 ? {} : { excludeDirs: opts.excludeDirs });
  const resolved = /* @__PURE__ */ new Map();
  const todo = [];
  for (const e of walked) {
    if (e.type !== "file") {
      resolved.set(e.path, e);
      continue;
    }
    const p = prev.get(e.path);
    if (p !== void 0 && p.hash !== void 0 && !isCandidate(e, p, baseline)) {
      resolved.set(e.path, { ...e, hash: p.hash });
    } else {
      todo.push(e);
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const e = todo[next++];
      resolved.set(e.path, await hashCandidate(opts.root, e, opts.stepIndex, diagnostics));
    }
  };
  await Promise.all(Array.from({ length: Math.min(16, todo.length) }, worker));
  const entries = [];
  for (const e of walked) {
    const r = resolved.get(e.path);
    if (r === void 0)
      continue;
    entries.push(r);
    if (r.type === "file" && BigInt(r.ctimeNs) >= walkStart && !diagnostics.some((d) => d.path === r.path && d.name === "baseline-race")) {
      diagnostics.push({ name: "baseline-race", stepIndex: opts.stepIndex, path: r.path });
    }
  }
  entries.sort((x, y) => compareBytes(x.path, y.path));
  diagnostics.sort((x, y) => compareBytes(x.path ?? "", y.path ?? "") || compareBytes(x.name, y.name));
  return { entries, diagnostics, nextBaselineNs: walkStart.toString() };
}

// ghost-runner/dist/fs/fingerprint.js
import { constants as fsc2 } from "node:fs";
import { open as open2 } from "node:fs/promises";
import { createHash as createHash6 } from "node:crypto";
import { join as join6 } from "node:path";
import { lstat as lstat4 } from "node:fs/promises";
var SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");
var RACY_WINDOW_NS = 2000000000n;
var HASH_CONCURRENCY = 16;
var CHUNK2 = 64 * 1024;
function octal2(mode) {
  return (mode & 4095).toString(8);
}
async function hashFile(root, e) {
  const abs = join6(root, e.path);
  let fh;
  try {
    fh = await open2(abs, fsc2.O_RDONLY | fsc2.O_NOFOLLOW | fsc2.O_NONBLOCK);
  } catch (err2) {
    throw new FingerprintReadError(e.path, err2);
  }
  try {
    const walked = await lstat4(abs, { bigint: true });
    const st = await fh.stat({ bigint: true });
    if (!st.isFile() || !walked.isFile() || st.ino !== walked.ino || st.dev !== walked.dev) {
      throw new FingerprintReadError(e.path, new Error("file identity changed during fingerprint"));
    }
    const h = createHash6("sha256");
    const buf = Buffer.allocUnsafe(CHUNK2);
    let total = 0;
    let head = Buffer.alloc(0);
    for (; ; ) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK2, null);
      if (bytesRead === 0)
        break;
      const slice = buf.subarray(0, bytesRead);
      h.update(slice);
      if (total < SQLITE_HEADER.length) {
        head = Buffer.concat([head, slice.subarray(0, SQLITE_HEADER.length - total)]);
      }
      total += bytesRead;
    }
    return { hash: h.digest("hex"), sqlite: head.length === SQLITE_HEADER.length && head.equals(SQLITE_HEADER) };
  } catch (err2) {
    if (err2 instanceof FingerprintReadError)
      throw err2;
    throw new FingerprintReadError(e.path, err2);
  } finally {
    await fh.close().catch(() => void 0);
  }
}
async function mapLimited(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
async function fingerprintOriginal(root, opts = {}) {
  const startedAtNs = (BigInt(Date.now()) * 1000000n).toString();
  const walked = await walkManifest(root, opts.excludeDirs === void 0 ? {} : { excludeDirs: opts.excludeDirs });
  const useShortcut = opts.fingerprintMode !== "full" && opts.baseline !== void 0;
  const prior = /* @__PURE__ */ new Map();
  const priorSqlite = /* @__PURE__ */ new Set();
  let priorStart = 0n;
  if (useShortcut && opts.baseline) {
    for (const e of opts.baseline.entries)
      prior.set(e.path, e);
    for (const p of opts.baseline.sqliteCandidates)
      priorSqlite.add(p);
    priorStart = BigInt(opts.baseline.startedAtNs);
  }
  const hashes = /* @__PURE__ */ new Map();
  const sqlite = /* @__PURE__ */ new Set();
  const toHash = [];
  for (const e of walked) {
    if (e.type !== "file")
      continue;
    const p = prior.get(e.path);
    if (p !== void 0 && p.type === "file" && p.hash !== void 0 && p.size === e.size && p.mode === e.mode && p.mtimeNs === e.mtimeNs && p.ctimeNs === e.ctimeNs && BigInt(p.ctimeNs) < priorStart - RACY_WINDOW_NS) {
      hashes.set(e.path, p.hash);
      if (priorSqlite.has(e.path))
        sqlite.add(e.path);
    } else {
      toHash.push(e);
    }
  }
  await mapLimited(toHash, HASH_CONCURRENCY, async (e) => {
    const r = await hashFile(root, e);
    hashes.set(e.path, r.hash);
    if (r.sqlite)
      sqlite.add(e.path);
  });
  const entries = walked.map((e) => {
    const h = hashes.get(e.path);
    return h === void 0 ? e : { ...e, hash: h };
  });
  const manifest = /* @__PURE__ */ Object.create(null);
  for (const e of entries) {
    manifest[e.path] = e.type === "file" ? e.hash : e.type === "symlink" ? `symlink:${e.target ?? ""}` : e.type === "dir" ? `dir:${octal2(e.mode)}` : `other:${octal2(e.mode)}`;
  }
  const top = createHash6("sha256");
  for (const e of entries) {
    top.update(e.path);
    top.update("\0");
    top.update(manifest[e.path]);
    top.update("\n");
  }
  return {
    fingerprint: { hash: top.digest("hex"), manifest: { ...manifest } },
    entries,
    sqliteCandidates: [...sqlite].sort(compareBytes),
    startedAtNs
  };
}

// ghost-runner/dist/static/analyzer.js
var import_shell_quote = __toESM(require_shell_quote(), 1);
import { posix as posix2 } from "node:path";

// ghost-runner/dist/static/devices.js
import { posix } from "node:path";
var HARMLESS_DEVICE_PATHS = [
  "/dev/null",
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty"
];
var FD_RE = /^\/dev\/fd\/[0-9]+$/;
function isHarmlessDevicePath(p) {
  if (!p.startsWith("/dev/"))
    return false;
  const n = posix.normalize(p);
  return HARMLESS_DEVICE_PATHS.includes(n) || FD_RE.test(n);
}

// ghost-runner/dist/static/analyzer.js
var WORK_ROOT = "/work";
var DB_SCHEMES = [
  "postgres",
  "postgresql",
  "mysql",
  "mariadb",
  "mongodb",
  "mongodb+srv",
  "redis",
  "rediss",
  "amqp",
  "amqps"
];
var URL_RE = /\b([a-z][a-z0-9+.-]*):\/\/[^\s'"`<>|;&()\\]+/gi;
var UNPARSEABLE_KIND = "unparseable-command";
var isUnder = (n, root) => n === root || n.startsWith(`${root}/`);
var isInside = (p, originalRoots) => {
  const n = posix2.normalize(p);
  return isUnder(n, WORK_ROOT) || originalRoots.some((r) => isUnder(n, posix2.normalize(r)));
};
var pathCandidates = (token) => {
  const out = [token];
  const eq = token.indexOf("=");
  if (eq > 0 && !token.includes("://"))
    out.push(token.slice(eq + 1));
  return out;
};
function analyze(action, originalRoots = []) {
  const effects = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (kind, destination) => {
    const key = `${kind}\0${destination}`;
    if (seen.has(key))
      return;
    seen.add(key);
    effects.push({ kind, destination });
  };
  let entries;
  try {
    entries = (0, import_shell_quote.parse)(action.command, (name) => `$${name}`);
  } catch (e) {
    const reason = e instanceof Error && e.message.length > 0 ? e.message.slice(0, 80) : "parse error";
    add(UNPARSEABLE_KIND, `unparseable shell command (${reason})`);
    entries = [];
    for (const m of action.command.matchAll(URL_RE)) {
      const scheme = (m[1] ?? "").toLowerCase();
      add(DB_SCHEMES.includes(scheme) ? "db-connection" : "url", m[0]);
    }
  }
  for (const entry of entries) {
    if (typeof entry !== "string")
      continue;
    const urlSpans = [];
    for (const m of entry.matchAll(URL_RE)) {
      const scheme = (m[1] ?? "").toLowerCase();
      add(DB_SCHEMES.includes(scheme) ? "db-connection" : "url", m[0]);
      urlSpans.push([m.index, m.index + m[0].length]);
    }
    if (urlSpans.length > 0)
      continue;
    for (const cand of pathCandidates(entry)) {
      if (cand.startsWith("~"))
        add("external-path", cand);
      else if (cand.startsWith("/") && !isInside(cand, originalRoots) && !isHarmlessDevicePath(cand))
        add("external-path", cand);
    }
  }
  return effects;
}

// ghost-runner/dist/static/original-roots.js
import { realpathSync } from "node:fs";
import { resolve as resolve3 } from "node:path";
var COPY_ROOT = "/work";
function originalRootsOf(original) {
  const given = resolve3(original);
  const roots = /* @__PURE__ */ new Set([given]);
  try {
    roots.add(realpathSync(given));
  } catch {
  }
  roots.delete("/");
  return [...roots];
}
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
function mapOriginalToCopy(text2, roots) {
  const usable = roots.filter((r) => r.startsWith("/") && r !== "/").sort((a, b) => b.length - a.length);
  if (usable.length === 0)
    return text2;
  const re = new RegExp(`(?<![\\w.~/-])(?:${usable.map(escapeRe).join("|")})(?=$|[/\\s'"\`;&|<>()])`, "g");
  return text2.replace(re, COPY_ROOT);
}
function mapCwdToCopy(cwd, roots) {
  const mapped = mapOriginalToCopy(cwd, roots);
  if (mapped === cwd)
    return cwd;
  const below = mapped.slice(COPY_ROOT.length).replace(/^\/+/, "");
  return below === "" ? void 0 : below;
}

// ghost-runner/dist/world/repo-world.js
function describeFailure(outcome) {
  switch (outcome.kind) {
    case "exited":
      return outcome.exitCode === 0 ? void 0 : `action exited with code ${String(outcome.exitCode)}`;
    case "timeout":
      return outcome.reason === "exec-limit" ? "action killed: execution limit exceeded" : "action killed: pipeline deadline exceeded";
    case "error":
      return `box error: ${outcome.detail || "docker exec failed"}`;
  }
}
async function stepInSession(session, index, action) {
  const roots = session.originalRoots ?? [];
  const command = mapOriginalToCopy(action.command, roots);
  const cwd = action.cwd === void 0 ? void 0 : mapCwdToCopy(action.cwd, roots);
  session.cwds[index] = cwd;
  if (session.sentinelPath !== void 0)
    session.baselineNs = await readFsClockNs(session.sentinelPath);
  const outcome = await session.box.exec(index, command, cwd);
  const adv = await advanceEntries({
    root: session.copyDir,
    excludeDirs: session.excludeDirs,
    previous: session.entries,
    baselineNs: session.baselineNs,
    stepIndex: index
  });
  const diagnostics = [...adv.diagnostics];
  const before = new Map(session.entries.map((e) => [e.path, e]));
  const after = new Map(adv.entries.map((e) => [e.path, e]));
  const toCount = Object.keys(session.sqlite).filter((p) => {
    const a = after.get(p);
    const b = before.get(p);
    return a !== void 0 && a.type === "file" && (b === void 0 || b.hash !== a.hash || b.size !== a.size);
  });
  const countStart = performance.now();
  const counted = toCount.length === 0 ? {} : await session.box.countSqlite(toCount);
  if (session.timings !== void 0)
    session.timings.sqliteMs += performance.now() - countStart;
  const existing = new Set(adv.entries.filter((e) => e.type === "file").map((e) => e.path));
  const sqlite = nextSqliteState(session.sqlite, counted, existing);
  let events = [];
  if (session.collectPerStep) {
    const res = await session.box.collect({
      executedSteps: index + 1,
      cwds: session.cwds,
      secretPatterns: session.secretPatterns,
      eventBuilder: session.eventBuilder
    });
    events = res.events.filter((e) => e.stepIndex === index);
    for (const e of events) {
      const bytes = e.eventId === void 0 ? void 0 : res.payloads.get(e.eventId);
      if (e.eventId !== void 0 && bytes !== void 0)
        session.payloads.set(e.eventId, bytes);
    }
    diagnostics.push(...res.diagnostics.filter((d) => d.stepIndex === void 0 || d.stepIndex === index));
  }
  session.entries = adv.entries;
  session.sqlite = sqlite;
  const lastStep = {
    stepIndex: index,
    outcome: outcome.kind,
    exitCode: outcome.kind === "exited" ? outcome.exitCode : null,
    events,
    diagnostics
  };
  const state = { rootPath: session.copyDir, entries: adv.entries, sqlite, lastStep };
  const error = describeFailure(outcome);
  return { state, success: error === void 0, ...error !== void 0 ? { error } : {}, outcome };
}
function effectiveSecretPatterns(opts) {
  const out = [...opts.secretPatterns];
  for (const w of opts.wardSet.wards) {
    if (w.kind !== "egress")
      continue;
    for (const s of w.secrets)
      if (!out.includes(s))
        out.push(s);
  }
  return out;
}
async function readonlyMountsFor(original, excludeDirs, mode) {
  if (mode !== "readonly-mount")
    return [];
  const out = [];
  for (const name of excludeDirs) {
    const source = join7(original, name);
    const st = await lstat5(source).catch(() => void 0);
    if (st?.isDirectory() === true)
      out.push({ source, destination: `/work/${name}` });
  }
  return out;
}
function inheritHashes(walked, baseline) {
  const base = new Map(baseline.map((e) => [e.path, e]));
  let complete = true;
  const entries = walked.map((e) => {
    if (e.type !== "file")
      return e;
    const b = base.get(e.path);
    if (b !== void 0 && b.type === "file" && b.hash !== void 0 && b.size === e.size) {
      return { ...e, hash: b.hash };
    }
    complete = false;
    return e;
  });
  return { entries, complete };
}

// ghost-runner/dist/pipeline.js
import { spawn as spawn3 } from "node:child_process";
import { randomUUID as randomUUID2 } from "node:crypto";
import { constants } from "node:fs";
import { open as open3, realpath as realpath2, rm as rm3, stat as stat2 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { dirname as dirname3, isAbsolute, join as join8, normalize, resolve as resolve5, sep } from "node:path";

// core/src/types.ts
var VERDICT_ORDER = {
  pass: 0,
  warn: 1,
  block: 2
};

// core/src/fingerprint.ts
var hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function compareFingerprints(before, after) {
  const b = before.manifest;
  const a = after.manifest;
  const keys = /* @__PURE__ */ new Set([...Object.keys(b), ...Object.keys(a)]);
  const changedPaths = [];
  for (const key of keys) {
    const inB = hasOwn(b, key);
    const inA = hasOwn(a, key);
    if (inB !== inA || inB && b[key] !== a[key]) {
      changedPaths.push(key);
    }
  }
  changedPaths.sort((x, y) => x < y ? -1 : x > y ? 1 : 0);
  return { changed: before.hash !== after.hash, changedPaths };
}

// core/src/judge/bytes.ts
function utf8Encode(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 55296 && cp <= 56319) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 56320 && next <= 57343) {
        cp = 65536 + (cp - 55296 << 10) + (next - 56320);
        i++;
      } else {
        cp = 65533;
      }
    } else if (cp >= 56320 && cp <= 57343) {
      cp = 65533;
    }
    if (cp < 128) {
      out.push(cp);
    } else if (cp < 2048) {
      out.push(192 | cp >> 6, 128 | cp & 63);
    } else if (cp < 65536) {
      out.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
    } else {
      out.push(
        240 | cp >> 18,
        128 | cp >> 12 & 63,
        128 | cp >> 6 & 63,
        128 | cp & 63
      );
    }
  }
  return Uint8Array.from(out);
}
function compareCodePoints(a, b) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = codePointAt(a, i);
    const cb = codePointAt(b, j);
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 65535 ? 2 : 1;
    j += cb > 65535 ? 2 : 1;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}
function codePointAt(s, i) {
  const hi = s.charCodeAt(i);
  if (hi >= 55296 && hi <= 56319 && i + 1 < s.length) {
    const lo = s.charCodeAt(i + 1);
    if (lo >= 56320 && lo <= 57343) {
      return 65536 + (hi - 55296 << 10) + (lo - 56320);
    }
  }
  if (hi >= 55296 && hi <= 57343) return 65533;
  return hi;
}
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64Encode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64.charAt(b0 >> 2);
    out += B64.charAt((b0 & 3) << 4 | b1 >> 4);
    out += i + 1 < bytes.length ? B64.charAt((b1 & 15) << 2 | b2 >> 6) : "=";
    out += i + 2 < bytes.length ? B64.charAt(b2 & 63) : "=";
  }
  return out;
}

// core/src/judge/canary.ts
var MIN_LENGTH = 8;
var MAX_LENGTH = 16384;
var MAX_CANDIDATES = 256;
var CR = 13;
var LF = 10;
var SPACE = 32;
var TAB = 9;
var HASH = 35;
var EQUALS = 61;
var SINGLE_QUOTE = 39;
var DOUBLE_QUOTE = 34;
var UNDERSCORE = 95;
function isBlank(b) {
  return b === SPACE || b === TAB;
}
function isKeyStart(b) {
  return b >= 65 && b <= 90 || b >= 97 && b <= 122 || b === UNDERSCORE;
}
function isKeyPart(b) {
  return isKeyStart(b) || b >= 48 && b <= 57;
}
function isEnvFileName(secretPath) {
  const cut = Math.max(secretPath.lastIndexOf("/"), secretPath.lastIndexOf("\\"));
  const base = secretPath.slice(cut + 1).replace(/[A-Z]/g, (c) => c.toLowerCase());
  return base === ".env" || base.startsWith(".env.");
}
function byteKey(bytes) {
  let key = "";
  const chunk = 4096;
  for (let i = 0; i < bytes.length; i += chunk) {
    key += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return key;
}
function parseEnvLine(content, start, end) {
  let i = start;
  if (end > i && content[end - 1] === CR) end -= 1;
  while (i < end && isBlank(content[i])) i += 1;
  if (i >= end || content[i] === HASH) return void 0;
  if (end - i > 6 && content[i] === 101 && // e
  content[i + 1] === 120 && // x
  content[i + 2] === 112 && // p
  content[i + 3] === 111 && // o
  content[i + 4] === 114 && // r
  content[i + 5] === 116 && // t
  isBlank(content[i + 6])) {
    i += 6;
    while (i < end && isBlank(content[i])) i += 1;
  }
  if (i >= end || !isKeyStart(content[i])) return void 0;
  i += 1;
  while (i < end && isKeyPart(content[i])) i += 1;
  if (i >= end || content[i] !== EQUALS) return void 0;
  i += 1;
  let vs = i;
  let ve = end;
  while (vs < ve && isBlank(content[vs])) vs += 1;
  while (ve > vs && isBlank(content[ve - 1])) ve -= 1;
  if (ve - vs >= 2) {
    const first = content[vs];
    if ((first === SINGLE_QUOTE || first === DOUBLE_QUOTE) && content[ve - 1] === first) {
      vs += 1;
      ve -= 1;
    }
  }
  return content.slice(vs, ve);
}
function extractCanariesDetailed(secretPath, content) {
  const raw = [];
  let wholeEnd = content.length;
  while (wholeEnd > 0 && (content[wholeEnd - 1] === CR || content[wholeEnd - 1] === LF)) wholeEnd -= 1;
  raw.push(content.slice(0, wholeEnd));
  if (isEnvFileName(secretPath)) {
    let lineStart = 0;
    for (let i = 0; i <= content.length; i += 1) {
      if (i === content.length || content[i] === LF) {
        const value = parseEnvLine(content, lineStart, i);
        if (value !== void 0) raw.push(value);
        lineStart = i + 1;
      }
    }
  }
  let tooShort = 0;
  let tooLong = 0;
  let tooMany = 0;
  const seen = /* @__PURE__ */ new Set();
  const candidates = [];
  for (const candidate of raw) {
    if (candidate.length < MIN_LENGTH) {
      tooShort += 1;
      continue;
    }
    if (candidate.length > MAX_LENGTH) {
      tooLong += 1;
      continue;
    }
    const key = byteKey(candidate);
    if (seen.has(key)) continue;
    if (candidates.length >= MAX_CANDIDATES) {
      tooMany += 1;
      continue;
    }
    seen.add(key);
    candidates.push(candidate);
  }
  return { candidates, discarded: { tooShort, tooLong, tooMany } };
}

// core/src/judge/normalize.ts
function resolvePath(p) {
  const stack = [];
  let escapes = false;
  for (const segment of p.normalize("NFC").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      const top = stack[stack.length - 1];
      if (top !== void 0 && top !== "..") {
        stack.pop();
      } else {
        stack.push("..");
        escapes = true;
      }
      continue;
    }
    stack.push(segment);
  }
  return { segments: stack, escapes };
}
function normalizePath(p) {
  return resolvePath(p).segments.join("/");
}
function foldPath(p) {
  let out = "";
  for (const c of normalizePath(p)) {
    const lower = c.toLowerCase();
    out += [...lower].length === 1 ? lower : c;
  }
  return out.normalize("NFC");
}

// core/src/judge/sanitize.ts
var HIDDEN_RANGES = [
  [0, 31],
  [127, 127],
  [8203, 8205],
  [8288, 8288],
  [65279, 65279],
  [8234, 8238],
  [8294, 8297],
  [917504, 917631]
];
function isHiddenCodePoint(cp) {
  for (const [lo, hi] of HIDDEN_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}
function hasHiddenChar(s) {
  for (let i = 0; i < s.length; i++) {
    if (isHiddenCodePoint(s.charCodeAt(i))) return true;
  }
  for (const ch of s) {
    if (isHiddenCodePoint(ch.codePointAt(0))) return true;
  }
  return false;
}
function sanitizeText(s, maxCodePoints = 120) {
  const max2 = Math.max(3, Math.floor(maxCodePoints));
  const tokens = [];
  let total = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const token = isHiddenCodePoint(cp) ? `\\u{${cp.toString(16).toUpperCase()}}` : ch;
    tokens.push(token);
    total += token.length === ch.length ? [...token].length : token.length;
  }
  if (total <= max2) return tokens.join("");
  let out = "";
  let len = 0;
  for (const token of tokens) {
    const tokenLen = [...token].length;
    if (len + tokenLen > max2 - 3) break;
    out += token;
    len += tokenLen;
  }
  return `${out}...`;
}

// core/src/judge/glob.ts
var MAX_PATTERN_LENGTH = 512;
var STAR = 42;
var QUESTION = 63;
var OPEN = 91;
var CLOSE = 93;
var BANG = 33;
var DASH = 45;
var BRACE_OPEN = 123;
var BRACE_CLOSE = 125;
var BACKSLASH = 92;
var SLASH = 47;
function toCodePoints(s) {
  const out = [];
  for (const ch of s) out.push(ch.codePointAt(0));
  return out;
}
function single(s) {
  const cp = s.codePointAt(0);
  if (cp === void 0) return void 0;
  return s.length === (cp > 65535 ? 2 : 1) ? cp : void 0;
}
function lower1(cp) {
  return single(String.fromCodePoint(cp).toLowerCase()) ?? cp;
}
function upper1(cp) {
  return single(String.fromCodePoint(cp).toUpperCase()) ?? cp;
}
function parseClass(cps, i) {
  let j = i + 1;
  let neg = false;
  if (cps[j] === BANG) {
    neg = true;
    j++;
  }
  if (j >= cps.length) return { ok: false, code: "unterminated-class" };
  if (cps[j] === CLOSE) return { ok: false, code: "empty-class" };
  const items = [];
  let descending = false;
  while (j < cps.length) {
    const c = cps[j];
    if (c === CLOSE) {
      if (descending) return { ok: false, code: "descending-range" };
      return { ok: true, neg, items, next: j + 1 };
    }
    if (cps[j + 1] === DASH && j + 2 < cps.length && cps[j + 2] !== CLOSE) {
      const hi = cps[j + 2];
      if (c > hi) descending = true;
      items.push([c, hi]);
      j += 3;
    } else {
      items.push(c);
      j++;
    }
  }
  return { ok: false, code: "unterminated-class" };
}
function err(code, message2) {
  return { code, message: message2 };
}
function validateGlob(pattern) {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return err("pattern-too-long", `pattern is longer than ${MAX_PATTERN_LENGTH} characters`);
  }
  if (pattern === "") return err("empty-pattern", "pattern is empty");
  if (hasHiddenChar(pattern)) {
    return err("invalid-character", "pattern contains a control or hidden character");
  }
  if (pattern.startsWith("/")) {
    return err("absolute-pattern", "pattern must be relative to the Copy root");
  }
  const cps = toCodePoints(pattern);
  if (cps[0] === BANG) return err("unsupported-glob-syntax", "negation with a leading ! is not supported");
  let inClass = false;
  for (const c of cps) {
    if (c === SLASH) {
      inClass = false;
    } else if (c === BACKSLASH) {
      return err("unsupported-glob-syntax", "backslash escapes are not supported");
    } else if (inClass) {
      if (c === CLOSE) inClass = false;
    } else if (c === OPEN) {
      inClass = true;
    } else if (c === BRACE_OPEN || c === BRACE_CLOSE) {
      return err("unsupported-glob-syntax", "brace expansion is not supported");
    }
  }
  const segments = pattern.split("/");
  if (segments.includes("..")) return err("parent-segment", "pattern contains a .. segment");
  for (const seg of segments) {
    if (seg !== "**" && seg.includes("**")) {
      return err("partial-doublestar", "** must be a whole path segment");
    }
    const sc = toCodePoints(seg);
    let i = 0;
    while (i < sc.length) {
      if (sc[i] === OPEN) {
        const r = parseClass(sc, i);
        if (!r.ok) {
          const message2 = r.code === "unterminated-class" ? "character class is missing a closing ]" : r.code === "empty-class" ? "character class is empty" : "character class range is descending";
          return err(r.code, message2);
        }
        i = r.next;
      } else {
        i++;
      }
    }
  }
  return null;
}
function normalizePattern(pattern) {
  return normalizePath(pattern);
}
function foldCp(cp) {
  return lower1(cp);
}
function tokenizeSegment(seg, caseSensitive) {
  const cps = toCodePoints(seg);
  const toks = [];
  let i = 0;
  while (i < cps.length) {
    const c = cps[i];
    if (c === STAR) {
      if (toks[toks.length - 1]?.k !== "star") toks.push({ k: "star" });
      i++;
    } else if (c === QUESTION) {
      toks.push({ k: "any" });
      i++;
    } else if (c === OPEN) {
      const r = parseClass(cps, i);
      if (r.ok) {
        toks.push({ k: "cls", neg: r.neg, items: r.items });
        i = r.next;
      } else {
        toks.push({ k: "lit", cp: caseSensitive ? c : foldCp(c) });
        i++;
      }
    } else {
      toks.push({ k: "lit", cp: caseSensitive ? c : foldCp(c) });
      i++;
    }
  }
  return toks;
}
function compileGlob(pattern, caseSensitive) {
  const normalized = normalizePattern(pattern);
  const segs = [];
  if (normalized !== "") {
    for (const seg of normalized.split("/")) {
      if (seg === "**") segs.push({ ds: true });
      else segs.push({ ds: false, toks: tokenizeSegment(seg, caseSensitive) });
    }
  }
  return { segs, caseSensitive };
}
function pathCodePoints(segments) {
  return segments.map(toCodePoints);
}
function inItems(items, c) {
  for (const it of items) {
    if (typeof it === "number") {
      if (it === c) return true;
    } else if (c >= it[0] && c <= it[1]) {
      return true;
    }
  }
  return false;
}
function unitMatches(t, c, caseSensitive) {
  switch (t.k) {
    case "lit":
      return caseSensitive ? t.cp === c : t.cp === foldCp(c);
    case "any":
      return true;
    case "cls": {
      const hit = caseSensitive ? inItems(t.items, c) : inItems(t.items, c) || inItems(t.items, lower1(c)) || inItems(t.items, upper1(c));
      return t.neg ? !hit : hit;
    }
    default:
      return false;
  }
}
function matchSegment(toks, cps, caseSensitive, counter) {
  let ti = 0;
  let ci = 0;
  let starT = -1;
  let starC = 0;
  while (ci < cps.length) {
    if (counter) counter.steps++;
    const t = toks[ti];
    if (t !== void 0 && t.k === "star") {
      starT = ti;
      starC = ci;
      ti++;
    } else if (t !== void 0 && unitMatches(t, cps[ci], caseSensitive)) {
      ti++;
      ci++;
    } else if (starT >= 0) {
      ti = starT + 1;
      starC++;
      ci = starC;
    } else {
      return false;
    }
  }
  while (toks[ti]?.k === "star") ti++;
  return ti === toks.length;
}
function matchCompiled(g, path8, counter) {
  const total = g.segs.length + 1;
  const isDs = (k) => k >= g.segs.length || g.segs[k].ds;
  let pi = 0;
  let si = 0;
  let starP = -1;
  let starS = 0;
  while (si < path8.length) {
    if (counter) counter.steps++;
    if (pi < total && isDs(pi)) {
      starP = pi;
      starS = si;
      pi++;
    } else if (pi < total) {
      const seg = g.segs[pi];
      if (!seg.ds && matchSegment(seg.toks, path8[si], g.caseSensitive, counter)) {
        pi++;
        si++;
        continue;
      }
      if (starP >= 0) {
        pi = starP + 1;
        starS++;
        si = starS;
      } else {
        return false;
      }
    } else if (starP >= 0) {
      pi = starP + 1;
      starS++;
      si = starS;
    } else {
      return false;
    }
  }
  while (pi < total && isDs(pi)) pi++;
  return pi === total;
}

// core/src/judge/host.ts
function urlHostname(text2) {
  const ctor = globalThis.URL;
  if (typeof ctor !== "function") return null;
  try {
    return new ctor(text2).hostname;
  } catch {
    return null;
  }
}
var MESSAGES = {
  "empty-host": "host entry has no host",
  "scheme-not-allowed": "host entry must not contain a scheme",
  "path-not-allowed": "host entry must not contain a path, query, or fragment",
  "userinfo-not-allowed": "host entry must not contain userinfo",
  "invalid-port": "port must be an integer from 1 to 65535",
  "invalid-hostname": "host is not a valid host name",
  "invalid-wildcard": "wildcard must be the whole leftmost label followed by at least two more labels",
  "invalid-ip": "invalid IP literal or numeric host",
  "invalid-character": "host entry contains a control or hidden character"
};
var SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
var PORT_RE = /^[0-9]{1,5}$/;
var OCTET_RE = /^(0|[1-9][0-9]{0,2})$/;
function fail(code) {
  return { ok: false, code };
}
function parsePort(text2) {
  if (!PORT_RE.test(text2)) return null;
  const n = Number(text2);
  return n >= 1 && n <= 65535 ? n : null;
}
function endsInNumber(host) {
  const labels = host.split(".");
  const last = labels[labels.length - 1];
  return /^[0-9]+$/.test(last) || /^0x[0-9a-f]*$/i.test(last);
}
function isCanonicalQuad(host) {
  const labels = host.split(".");
  if (labels.length !== 4) return false;
  for (const l of labels) {
    if (!OCTET_RE.test(l) || Number(l) > 255) return false;
  }
  return true;
}
function validName(host) {
  if (host.length === 0 || host.length > 253) return false;
  for (const label of host.split(".")) {
    if (label.length < 1 || label.length > 63) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }
  return true;
}
function withPort(kind, host, port) {
  return port === null ? { kind, host } : { kind, host, port };
}
function parseAuthority(text2, dest, allowWildcard) {
  let hostText;
  let port = null;
  let bracketed = false;
  if (text2.startsWith("[")) {
    const close = text2.indexOf("]");
    if (close < 0) return fail("invalid-ip");
    hostText = text2.slice(1, close);
    bracketed = true;
    const rest = text2.slice(close + 1);
    if (rest !== "") {
      if (!rest.startsWith(":")) return fail("invalid-ip");
      port = parsePort(rest.slice(1));
      if (port === null) return fail("invalid-port");
    }
  } else {
    const colon = text2.indexOf(":");
    if (colon >= 0) {
      if (text2.indexOf(":", colon + 1) >= 0) return fail("invalid-ip");
      port = parsePort(text2.slice(colon + 1));
      if (port === null) return fail("invalid-port");
      hostText = text2.slice(0, colon);
    } else {
      hostText = text2;
    }
  }
  if (bracketed) {
    if (hostText === "") return fail("empty-host");
    if (!/^[0-9a-fA-F:.]+$/.test(hostText) || !hostText.includes(":")) return fail("invalid-ip");
    const canon2 = urlHostname("http://[" + hostText + "]");
    if (canon2 === null || !canon2.startsWith("[") || !canon2.endsWith("]")) return fail("invalid-ip");
    return { ok: true, ref: withPort("ipv6", canon2.slice(1, -1), port), wildcard: false };
  }
  if (hostText.endsWith(".")) hostText = hostText.slice(0, -1);
  if (hostText === "") return fail("empty-host");
  let wildcard = false;
  if (hostText.includes("*")) {
    if (!allowWildcard || !hostText.startsWith("*.")) return fail("invalid-wildcard");
    hostText = hostText.slice(2);
    if (hostText.includes("*") || !hostText.includes(".")) return fail("invalid-wildcard");
    if (hostText.split(".").some((l) => l === "")) return fail("invalid-wildcard");
    wildcard = true;
  }
  if (hasHiddenChar(hostText)) return fail("invalid-character");
  if (endsInNumber(hostText)) {
    if (!wildcard && isCanonicalQuad(hostText)) {
      return { ok: true, ref: withPort("ipv4", hostText, port), wildcard: false };
    }
    if (dest && !wildcard && /^[0-9a-zA-Z.]+$/.test(hostText)) {
      return { ok: true, ref: withPort("name", hostText.toLowerCase(), port), wildcard: false };
    }
    return fail(dest ? "invalid-hostname" : "invalid-ip");
  }
  if (!/^[A-Za-z0-9.\-\u0080-\u{10FFFF}]+$/u.test(hostText)) return fail("invalid-hostname");
  const canon = urlHostname("http://" + hostText);
  if (canon === null) return fail("invalid-hostname");
  const host = canon.endsWith(".") ? canon.slice(0, -1) : canon;
  if (endsInNumber(host)) return fail(dest ? "invalid-hostname" : "invalid-ip");
  if (!validName(host)) return fail("invalid-hostname");
  if (wildcard && !host.includes(".")) return fail("invalid-wildcard");
  return { ok: true, ref: withPort("name", host, port), wildcard };
}
function parseDestination(d) {
  if (typeof d !== "string") return null;
  let text2 = d.replace(SCHEME_RE, "");
  const cut = text2.search(/[/?#]/);
  if (cut >= 0) text2 = text2.slice(0, cut);
  if (text2.includes("\\")) return null;
  const at = text2.lastIndexOf("@");
  if (at >= 0) text2 = text2.slice(at + 1);
  const parsed = parseAuthority(text2, true, false);
  return parsed.ok ? parsed.ref : null;
}
function parseEntry(entry) {
  if (typeof entry !== "string") return fail("empty-host");
  if (hasHiddenChar(entry)) return fail("invalid-character");
  if (entry === "") return fail("empty-host");
  if (SCHEME_RE.test(entry)) return fail("scheme-not-allowed");
  if (/[/?#\\]/.test(entry)) return fail("path-not-allowed");
  if (entry.includes("@")) return fail("userinfo-not-allowed");
  return parseAuthority(entry, false, true);
}
function validateHostEntry(entry) {
  const parsed = parseEntry(entry);
  if (parsed.ok) return null;
  return { code: parsed.code, message: MESSAGES[parsed.code] };
}
function hostEntryKey(entry) {
  const parsed = parseEntry(entry);
  if (!parsed.ok) return "x:" + String(entry).toLowerCase();
  const { ref, wildcard } = parsed;
  const port = ref.port === void 0 ? "" : ":" + String(ref.port);
  if (wildcard) return "w:" + ref.host + port;
  if (ref.kind === "ipv4") return "i4:" + ref.host + port;
  if (ref.kind === "ipv6") return "i6:[" + ref.host + "]" + port;
  return "n:" + ref.host + port;
}
function entryAllows(e, ref) {
  if (e.port !== void 0 && e.port !== ref.port) return false;
  if (e.wildcard) {
    if (ref.kind !== "name") return false;
    const tail = "." + e.host;
    if (ref.host.length <= tail.length || !ref.host.endsWith(tail)) return false;
    const prefix = ref.host.slice(0, ref.host.length - tail.length);
    return !prefix.includes(".");
  }
  return e.kind === ref.kind && e.host === ref.host;
}
function compileAllowHosts(entries) {
  const compiled = [];
  for (const entry of entries) {
    const parsed = parseEntry(entry);
    if (!parsed.ok) continue;
    compiled.push({
      kind: parsed.ref.kind,
      host: parsed.ref.host,
      port: parsed.ref.port,
      wildcard: parsed.wildcard
    });
  }
  return {
    allows(ref) {
      if (ref === null) return false;
      for (const e of compiled) {
        if (entryAllows(e, ref)) return true;
      }
      return false;
    }
  };
}
function redactDestination(d) {
  const ref = parseDestination(d);
  if (ref === null) return sanitizeText(typeof d === "string" ? d : "");
  const host = ref.kind === "ipv6" ? "[" + ref.host + "]" : ref.host;
  return ref.port === void 0 ? host : host + ":" + String(ref.port);
}

// core/src/judge/inspect.ts
var ENCODING_ORDER = ["raw", "base64", "base64url", "hex", "percent"];
var PAYLOAD_CAP = 65536;
var WINDOW = 8;
var BLOOM_BITS = 1 << 18;
var BLOOM_WORDS = BLOOM_BITS >>> 5;
var MAX_SAMPLES = 8;
var HASH_BASE = 16777619;
var BASE_POW = (() => {
  let p = 1;
  for (let i = 0; i < WINDOW - 1; i++) p = Math.imul(p, HASH_BASE);
  return p;
})();
function slot(hash) {
  return Math.imul(hash, 2654435761) >>> 14;
}
function windowHash(b, start) {
  let h = 0;
  for (let i = 0; i < WINDOW; i++) h = Math.imul(h, HASH_BASE) + b[start + i] | 0;
  return h;
}
function bloomOf(v) {
  if (v.bloom) return v.bloom;
  const bloom = new Uint32Array(BLOOM_WORDS);
  const b = v.bytes;
  if (b.length >= WINDOW) {
    let h = windowHash(b, 0);
    for (let i = 0; ; i++) {
      const s = slot(h);
      bloom[s >>> 5] = bloom[s >>> 5] | 1 << (s & 31);
      if (i + WINDOW >= b.length) break;
      const out = Math.imul(b[i], BASE_POW);
      h = Math.imul(h - out | 0, HASH_BASE) + b[i + WINDOW] | 0;
    }
  }
  v.bloom = bloom;
  return bloom;
}
function bloomMayContain(v, needle) {
  const bloom = bloomOf(v);
  const last = needle.length - WINDOW;
  const samples = Math.min(MAX_SAMPLES, last + 1);
  for (let k = 0; k < samples; k++) {
    const pos = samples === 1 ? 0 : Math.floor(k * last / (samples - 1));
    const s = slot(windowHash(needle, pos));
    if ((bloom[s >>> 5] & 1 << (s & 31)) === 0) return false;
  }
  return true;
}
function kmpContains(hay, needle) {
  const m = needle.length;
  const fail4 = new Int32Array(m);
  for (let i = 1, k = 0; i < m; i++) {
    while (k > 0 && needle[i] !== needle[k]) k = fail4[k - 1];
    if (needle[i] === needle[k]) k++;
    fail4[i] = k;
  }
  for (let i = 0, k = 0; i < hay.length; i++) {
    while (k > 0 && hay[i] !== needle[k]) k = fail4[k - 1];
    if (hay[i] === needle[k]) k++;
    if (k === m) return true;
  }
  return false;
}
function found(v, needle) {
  if (needle.length < WINDOW || needle.length > v.bytes.length) return false;
  if (!bloomMayContain(v, needle)) return false;
  return kmpContains(v.bytes, needle);
}
function isWs(b) {
  return b === 13 || b === 10 || b === 32 || b === 9;
}
function stripWs(b) {
  let count = 0;
  for (let i = 0; i < b.length; i++) if (isWs(b[i])) count++;
  if (count === 0) return b;
  const out = new Uint8Array(b.length - count);
  for (let i = 0, j = 0; i < b.length; i++) {
    const c = b[i];
    if (!isWs(c)) out[j++] = c;
  }
  return out;
}
function hexVal(c) {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 65 + 10;
  if (c >= 97 && c <= 102) return c - 97 + 10;
  return -1;
}
function percentDecode(b) {
  let changed = false;
  const out = new Uint8Array(b.length);
  let j = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 37 && i + 2 < b.length) {
      const hi = hexVal(b[i + 1]);
      const lo = hexVal(b[i + 2]);
      if (hi >= 0 && lo >= 0) {
        out[j++] = hi << 4 | lo;
        i += 2;
        changed = true;
        continue;
      }
    }
    if (c === 43) {
      out[j++] = 32;
      changed = true;
    } else {
      out[j++] = c;
    }
  }
  return changed ? out.subarray(0, j) : b;
}
function lowerAscii(b) {
  let upper = false;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c >= 65 && c <= 90) {
      upper = true;
      break;
    }
  }
  if (!upper) return b;
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    out[i] = c >= 65 && c <= 90 ? c + 32 : c;
  }
  return out;
}
function buildViews(payload) {
  const b0 = payload.length > PAYLOAD_CAP ? payload.subarray(0, PAYLOAD_CAP) : payload;
  const b1 = stripWs(b0);
  const b2 = percentDecode(b0);
  const b3 = b2 === b0 ? b1 : stripWs(b2);
  const mk = (bytes, same, sameBytes) => same && sameBytes === bytes ? same : { bytes };
  const v0 = { bytes: b0 };
  const v1 = mk(b1, v0, b0);
  const v2 = mk(b2, v0, b0);
  const v3 = b3 === b1 ? v1 : mk(b3, v2, b2);
  const l1 = lowerAscii(b1);
  const l3 = lowerAscii(b3);
  const v1l = mk(l1, v1, b1);
  const v3l = l3 === l1 ? v1l : mk(l3, v3, b3);
  return { v0, v1, v2, v3, v1l, v3l };
}
var HEX = "0123456789abcdef";
function hexNeedle(c) {
  const out = new Uint8Array(c.length * 2);
  for (let i = 0; i < c.length; i++) {
    const v = c[i];
    out[2 * i] = HEX.charCodeAt(v >> 4);
    out[2 * i + 1] = HEX.charCodeAt(v & 15);
  }
  return out;
}
function asciiBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function base64Needles(canary, offset) {
  const n = canary.length;
  const start = Math.ceil(8 * offset / 6);
  const end = Math.floor(8 * (offset + n) / 6);
  if (end - start < WINDOW) return void 0;
  const padded = new Uint8Array(offset + n);
  padded.set(canary, offset);
  const text2 = base64Encode(padded).slice(start, end);
  return {
    std: asciiBytes(text2),
    url: asciiBytes(text2.replace(/\+/g, "-").replace(/\//g, "_"))
  };
}
function hasWs(c) {
  for (let i = 0; i < c.length; i++) if (isWs(c[i])) return true;
  return false;
}
function prepareCanaries(canaries) {
  return canaries.map((canary) => {
    const stripped = hasWs(canary) ? stripWs(canary) : void 0;
    const b64 = [];
    for (let o = 0; o < 3; o++) {
      const nd = base64Needles(canary, o);
      if (nd) b64.push(nd);
    }
    return { canary, stripped, b64, hex: hexNeedle(canary) };
  });
}
function kindsFor(views, prepared) {
  const seen = /* @__PURE__ */ new Set();
  for (const pc of prepared) {
    const canary = pc.canary;
    const rawInV0 = found(views.v0, canary);
    if (rawInV0) seen.add("raw");
    else {
      if (!seen.has("raw") && pc.stripped !== void 0) {
        const stripped = pc.stripped;
        if (stripped.length >= WINDOW && (found(views.v1, stripped) || found(views.v3, stripped))) seen.add("raw");
      }
      if (!seen.has("percent") && found(views.v2, canary)) seen.add("percent");
    }
    for (const nd of pc.b64) {
      if (seen.has("base64") && seen.has("base64url")) break;
      if (!seen.has("base64") && (found(views.v1, nd.std) || found(views.v3, nd.std))) seen.add("base64");
      if (!seen.has("base64url") && (found(views.v1, nd.url) || found(views.v3, nd.url))) seen.add("base64url");
    }
    if (!seen.has("hex")) {
      if (found(views.v1l, pc.hex) || found(views.v3l, pc.hex)) seen.add("hex");
    }
  }
  return ENCODING_ORDER.filter((k) => seen.has(k));
}
function detectKinds(payload, canaries) {
  const prepared = isPrepared(canaries) ? canaries : prepareCanaries(canaries);
  return kindsFor(buildViews(payload), prepared);
}
function isPrepared(c) {
  return c.length > 0 && !(c[0] instanceof Uint8Array);
}
function createInspector(payloads) {
  const entries = [];
  for (const [id, payload] of payloads) entries.push({ id, payload });
  return {
    hits(canaries) {
      const out = /* @__PURE__ */ new Map();
      if (canaries.length === 0) return out;
      const prepared = prepareCanaries(canaries);
      for (const e of entries) {
        e.views ??= buildViews(e.payload);
        const kinds = kindsFor(e.views, prepared);
        if (kinds.length > 0) out.set(e.id, kinds);
      }
      return out;
    }
  };
}

// core/src/judge/pathset.ts
function isLiteral(pattern) {
  return !pattern.includes("*") && !pattern.includes("?") && !pattern.includes("[");
}
function foldSegment(s) {
  return foldPath(s);
}
function compilePathSet(patterns, opts) {
  const caseSensitive = opts.caseSensitive;
  const literals = /* @__PURE__ */ new Set();
  const globs = [];
  for (const p of patterns) {
    if (typeof p !== "string") continue;
    if (isLiteral(p)) literals.add(caseSensitive ? normalizePath(p) : foldPath(p));
    else globs.push(compileGlob(p, caseSensitive));
  }
  function matchSegments(segments) {
    if (literals.has("")) return true;
    if (literals.size > 0) {
      let prefix = "";
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        prefix = i === 0 ? seg : `${prefix}/${seg}`;
        if (literals.has(caseSensitive ? prefix : foldSegment(prefix))) return true;
      }
    }
    if (globs.length > 0) {
      const cps = pathCodePoints(segments);
      for (const g of globs) {
        if (matchCompiled(g, cps)) return true;
      }
    }
    return false;
  }
  function spelling(path8) {
    const r = resolvePath(path8);
    if (r.escapes) return { matched: false, escapes: true };
    return { matched: matchSegments(r.segments), escapes: false };
  }
  return {
    test(path8) {
      const a = spelling(path8);
      const b = path8.includes("\\") ? spelling(path8.split("\\").join("/")) : a;
      return { matched: a.matched || b.matched, escapes: a.escapes || b.escapes };
    }
  };
}

// core/src/wards.ts
function isFileChange(c) {
  return (c.kind === "file-created" || c.kind === "file-overwritten" || c.kind === "file-deleted" || c.kind === "symlink-changed") && typeof c["path"] === "string";
}
function isSqlRowCountChange(c) {
  return c.kind === "sql-row-count" && typeof c["table"] === "string" && typeof c["rowsBefore"] === "number" && Number.isFinite(c["rowsBefore"]) && typeof c["rowsAfter"] === "number" && Number.isFinite(c["rowsAfter"]);
}
function fmt(n) {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function asciiLower(s) {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}
var MAX_PATH_ESCAPE_NOTICES = 20;
function checkPath(w, set, changes, violate, onEscape) {
  const caseSensitive = w.case_sensitive === true;
  const found3 = /* @__PURE__ */ new Map();
  for (const { change: c, stepIndex } of changes) {
    if (!isFileChange(c)) continue;
    const op = c.kind === "file-deleted" ? "delete" : c.kind === "file-overwritten" || c.kind === "symlink-changed" ? "overwrite" : null;
    if (op === null || !w.deny.includes(op)) continue;
    const r = set.test(c.path);
    if (r.escapes) onEscape(c.path, stepIndex);
    if (!r.matched) continue;
    const normalized = normalizePath(c.path);
    const key = `${op}\0${caseSensitive ? normalized : foldPath(c.path)}`;
    const display = sanitizeText(c.path);
    const prev = found3.get(key);
    if (prev === void 0 || compareCodePoints(normalized, prev.sortKey) < 0 || normalized === prev.sortKey && compareCodePoints(display, prev.display) < 0) {
      found3.set(key, { display, sortKey: normalized, op });
    }
  }
  const sorted = [...found3.values()].sort(
    (x, y) => compareCodePoints(x.sortKey, y.sortKey) || (x.op === y.op ? 0 : x.op === "delete" ? -1 : 1)
  );
  for (const f of sorted) violate(`would ${f.op} protected path ${f.display}`);
}
function checkSql(w, changes, violate) {
  const declared = /* @__PURE__ */ new Map();
  for (const t of w.tables) {
    const k = asciiLower(t);
    if (!declared.has(k)) declared.set(k, t);
  }
  const lost = /* @__PURE__ */ new Map();
  let total = 0;
  for (const { change: c } of changes) {
    if (!isSqlRowCountChange(c)) continue;
    const key = asciiLower(c.table);
    if (!declared.has(key)) continue;
    const n = Math.max(0, c.dropped === true ? c.rowsBefore : c.rowsBefore - c.rowsAfter);
    if (n === 0) continue;
    lost.set(key, (lost.get(key) ?? 0) + n);
    total += n;
  }
  if (total > w.max_rows_lost) {
    const parts = [...lost.keys()].sort(compareCodePoints).map((k) => `${fmt(lost.get(k))} rows from ${sanitizeText(declared.get(k))}`);
    const max2 = w.max_rows_lost > 0 ? ` (max allowed ${fmt(w.max_rows_lost)})` : "";
    violate(`would delete ${parts.join(", ")}${max2}`);
  }
}
var MAX_EGRESS_VIOLATIONS = 20;
function checkEgress(w, report, violate) {
  const secrets = compilePathSet(w.secrets, { caseSensitive: false });
  let firstRead;
  for (const e of report.observedEvents) {
    if (e.kind !== "secret-read" || typeof e.path !== "string") continue;
    if (!secrets.test(e.path).matched) continue;
    if (firstRead === void 0 || e.stepIndex < firstRead) firstRead = e.stepIndex;
  }
  if (firstRead === void 0) return;
  const allowed = compileAllowHosts(w.allow_hosts);
  const found3 = [];
  for (const e of report.observedEvents) {
    if (e.kind !== "network-attempt" || e.stepIndex < firstRead) continue;
    if (allowed.allows(parseDestination(e.destination))) continue;
    found3.push({
      stepIndex: e.stepIndex,
      dest: e.destination === void 0 ? "(unknown)" : redactDestination(e.destination)
    });
  }
  found3.sort((a, b) => a.stepIndex - b.stepIndex || compareCodePoints(a.dest, b.dest));
  for (const f of found3.slice(0, MAX_EGRESS_VIOLATIONS)) {
    violate(
      `network attempt to ${f.dest} at step ${f.stepIndex} after secret read at step ${firstRead}; host not in allow_hosts`
    );
  }
  if (found3.length > MAX_EGRESS_VIOLATIONS) {
    violate(`${found3.length - MAX_EGRESS_VIOLATIONS} more network attempts not listed`);
  }
}
var MAX_PAYLOAD_HITS = 20;
var REDACTED = "[redacted: contains a secret value]";
function addContentNotice(ctx, reason, stepIndex, path8) {
  const key = `${stepIndex}\0${reason}`;
  if (ctx.noticeKeys.has(key)) return;
  ctx.noticeKeys.add(key);
  ctx.notices.push({
    kind: "content-inspection",
    reason,
    stepIndex,
    ...path8 !== void 0 ? { path: path8 } : {}
  });
}
function prepareContent(inputs) {
  const ctx = {
    files: [],
    payloads: /* @__PURE__ */ new Map(),
    inspector: void 0,
    hitCache: /* @__PURE__ */ new Map(),
    allCanaries: [],
    provided: inputs !== void 0,
    notices: [],
    noticeKeys: /* @__PURE__ */ new Set(),
    failed: false
  };
  const grouped = /* @__PURE__ */ new Map();
  const secretValues = inputs?.secretValues;
  if (secretValues !== void 0) {
    for (const [key, value] of secretValues) {
      if (typeof key !== "string" || !(value instanceof Uint8Array)) {
        const shown2 = typeof key === "string" ? sanitizeText(key) : "(non-string key)";
        addContentNotice(ctx, `secret value entry ${shown2} is malformed and was skipped`, 0);
        continue;
      }
      const norm = normalizePath(key);
      const g = grouped.get(norm);
      if (g === void 0) grouped.set(norm, { bytes: [value] });
      else g.bytes.push(value);
    }
  }
  const files = [];
  const all = [];
  for (const path8 of [...grouped.keys()].sort(compareCodePoints)) {
    const canaries = [];
    const discarded = { tooShort: 0, tooLong: 0, tooMany: 0 };
    for (const bytes of grouped.get(path8).bytes) {
      const ex = extractCanariesDetailed(path8, bytes);
      canaries.push(...ex.candidates);
      discarded.tooShort += ex.discarded.tooShort;
      discarded.tooLong += ex.discarded.tooLong;
      discarded.tooMany += ex.discarded.tooMany;
    }
    all.push(...canaries);
    files.push({ path: path8, canaries, discarded });
  }
  const payloads = /* @__PURE__ */ new Map();
  const rawPayloads = inputs?.payloads;
  if (rawPayloads !== void 0) {
    const keys = [];
    for (const [id, value] of rawPayloads) {
      if (typeof id !== "string" || !(value instanceof Uint8Array)) {
        const shown2 = typeof id === "string" ? sanitizeText(id) : "(non-string key)";
        addContentNotice(ctx, `payload ${shown2} is malformed and was skipped`, 0);
        continue;
      }
      keys.push(id);
    }
    keys.sort(compareCodePoints);
    for (const id of keys) payloads.set(id, rawPayloads.get(id));
  }
  return {
    ...ctx,
    files,
    payloads,
    inspector: payloads.size > 0 ? createInspector(payloads) : void 0,
    allCanaries: all
  };
}
function hitsFor(ctx, file) {
  const cached2 = ctx.hitCache.get(file.path);
  if (cached2 !== void 0) return cached2;
  let result = /* @__PURE__ */ new Map();
  if (ctx.inspector !== void 0 && file.canaries.length > 0) {
    try {
      result = ctx.inspector.hits(file.canaries);
    } catch {
      ctx.failed = true;
      addContentNotice(ctx, "content inspection failed", 0);
    }
  }
  ctx.hitCache.set(file.path, result);
  return result;
}
function checkContent(w, report, ctx, violate) {
  const secrets = compilePathSet(w.secrets, { caseSensitive: false });
  const matched = ctx.files.filter((f) => secrets.test(f.path).matched);
  if (matched.length === 0) {
    const noValues = ctx.provided && ctx.files.length === 0;
    const secretRead = report.observedEvents.some(
      (e) => e.kind === "secret-read" && typeof e.path === "string" && secrets.test(e.path).matched
    );
    if (noValues && (secretRead || ctx.payloads.size > 0)) {
      addContentNotice(
        ctx,
        `content inspection did not run for ward ${sanitizeText(w.id)}: no secret values were provided`,
        0
      );
    }
    return;
  }
  const hasPayload = ctx.payloads.size > 0;
  const found3 = [];
  for (const file of matched) {
    if (hasPayload) {
      const d = file.discarded;
      const shown2 = sanitizeText(file.path);
      if (d.tooShort > 0) {
        addContentNotice(ctx, `secret file ${shown2}: ${d.tooShort} value(s) shorter than 8 bytes were not inspected`, 0, shown2);
      }
      if (d.tooLong > 0) {
        addContentNotice(ctx, `secret file ${shown2}: ${d.tooLong} value(s) longer than 16,384 bytes were not inspected`, 0, shown2);
      }
      if (d.tooMany > 0) {
        addContentNotice(ctx, `secret file ${shown2}: ${d.tooMany} value(s) beyond the first 256 were not inspected`, 0, shown2);
      }
    }
    for (const [eventId, kinds] of hitsFor(ctx, file)) found3.push({ eventId, path: file.path, kinds });
  }
  found3.sort((a, b) => compareCodePoints(a.eventId, b.eventId) || compareCodePoints(a.path, b.path));
  for (const f of found3.slice(0, MAX_PAYLOAD_HITS)) {
    violate(
      `payload of event ${sanitizeText(f.eventId)} contains a value from secret file ${sanitizeText(f.path)} (encoding: ${f.kinds.join(", ")})`
    );
  }
  if (found3.length > MAX_PAYLOAD_HITS) {
    violate(`${found3.length - MAX_PAYLOAD_HITS} more payload hits not listed`);
  }
}
function guardString(s, canaries) {
  if (s.length === 0) return s;
  return detectKinds(utf8Encode(s), canaries).length > 0 ? REDACTED : s;
}
function leakGuard(violations, notices, canaries) {
  if (canaries.length === 0) return { violations, notices };
  const prepared = prepareCanaries(canaries);
  const g = (s) => guardString(s, prepared);
  return {
    violations: violations.map((v) => ({ ...v, wardId: g(v.wardId), reason: g(v.reason) })),
    notices: notices.map((n) => ({
      ...n,
      reason: g(n.reason),
      ...n.destination !== void 0 ? { destination: g(n.destination) } : {},
      ...n.path !== void 0 ? { path: g(n.path) } : {}
    }))
  };
}
function checkPhysics(w, report, violate) {
  const vs = report.variantResults;
  if (vs.length === 0) return;
  const ok = vs.filter((v) => v.success).length;
  const rate = ok / vs.length;
  if (rate < w.min_success_rate) {
    violate(`success rate ${ok}/${vs.length} (${rate.toFixed(2)}) below minimum ${w.min_success_rate}`);
  }
  for (const v of vs) {
    const id = sanitizeText(v.variantId);
    if (v.jointLimitExceeded === true) violate(`joint limit exceeded in variant ${id}`);
    if (v.selfCollisionOccurred === true) violate(`self-collision occurred in variant ${id}`);
    if (v.contactForceN !== void 0 && v.contactForceN > w.max_contact_force_n) {
      violate(`variant ${id} contact force ${v.contactForceN} N exceeds max ${w.max_contact_force_n} N`);
    }
    if (v.forbiddenContactOccurred === true && w.forbidden_contacts.length > 0) {
      violate(`variant ${id} made forbidden contact (${w.forbidden_contacts.map((c) => sanitizeText(c)).join(", ")})`);
    }
  }
}
function worse(a, b) {
  return VERDICT_ORDER[a] >= VERDICT_ORDER[b] ? a : b;
}
function collectNotices(report) {
  const effectNotices = [];
  report.effectsOutside.forEach((effects, stepIndex) => {
    for (const e of effects) {
      const dest = redactDestination(e.destination);
      effectNotices.push({
        kind: "effect-outside",
        reason: `step ${stepIndex} has side effect outside the copy: ${sanitizeText(String(e.kind))} to ${dest}`,
        stepIndex,
        destination: dest
      });
    }
  });
  const observed = report.observedEvents.map((e) => {
    const destination = e.destination !== void 0 ? redactDestination(e.destination) : void 0;
    const path8 = e.path !== void 0 ? sanitizeText(e.path) : void 0;
    const target = destination ?? path8 ?? "(unknown)";
    const notice = {
      kind: "observed-event",
      reason: `observed ${sanitizeText(String(e.kind))} (${target}) at step ${e.stepIndex}`,
      stepIndex: e.stepIndex,
      ...destination !== void 0 ? { destination } : {},
      ...path8 !== void 0 ? { path: path8 } : {}
    };
    return { notice, kind: String(e.kind), target };
  });
  observed.sort(
    (a, b) => a.notice.stepIndex - b.notice.stepIndex || compareCodePoints(a.kind, b.kind) || compareCodePoints(a.target, b.target)
  );
  return [...effectNotices, ...observed.map((o) => o.notice)];
}
var WardEngine = {
  /**
   * Judge a ghost report. block = any ward violated; warn = out-of-box effect
   * or observed event present (independent of wards); pass otherwise.
   * Warn-level findings are reported as `notices`, not violations.
   */
  evaluate(report, wardSet, inputs) {
    const content = prepareContent(inputs);
    const changes = [];
    report.changes.forEach((step, stepIndex) => {
      for (const change of step) changes.push({ change, stepIndex });
    });
    const violations = [];
    const escapes = /* @__PURE__ */ new Map();
    const onEscape = (rawPath, stepIndex) => {
      const path8 = sanitizeText(rawPath);
      if (!escapes.has(path8)) escapes.set(path8, { path: path8, stepIndex });
    };
    for (const w of wardSet.wards) {
      const violate = (reason) => violations.push({ wardId: w.id, wardKind: w.kind, reason });
      switch (w.kind) {
        case "path":
          checkPath(
            w,
            compilePathSet(w.paths, { caseSensitive: w.case_sensitive === true }),
            changes,
            violate,
            onEscape
          );
          break;
        case "sql":
          checkSql(w, changes, violate);
          break;
        case "egress":
          checkEgress(w, report, violate);
          checkContent(w, report, content, violate);
          break;
        case "physics":
          checkPhysics(w, report, violate);
          break;
      }
    }
    const notices = collectNotices(report);
    const escapeNotices = [...escapes.values()].map(({ path: path8, stepIndex }) => ({
      kind: "path-escape",
      reason: `change path escapes the copy root: ${path8}`,
      stepIndex,
      path: path8
    })).sort((a, b) => a.stepIndex - b.stepIndex || compareCodePoints(a.reason, b.reason)).slice(0, MAX_PATH_ESCAPE_NOTICES);
    notices.push(...escapeNotices);
    if (wardSet.wards.some((w) => w.kind === "egress")) {
      const ids = /* @__PURE__ */ new Set();
      for (const e of report.observedEvents) if (e.eventId !== void 0) ids.add(e.eventId);
      for (const id of content.payloads.keys()) {
        if (!ids.has(id)) {
          addContentNotice(content, `payload ${sanitizeText(id)} has no matching observed event`, 0);
        }
      }
    }
    const contentNotices = [...content.notices].sort(
      (a, b) => a.stepIndex - b.stepIndex || compareCodePoints(a.reason, b.reason)
    );
    notices.splice(notices.length - escapeNotices.length, 0, ...contentNotices);
    let verdict = "pass";
    if (notices.length > 0) verdict = worse(verdict, "warn");
    if (violations.length > 0) verdict = worse(verdict, "block");
    const guarded = leakGuard(violations, notices, content.allCanaries);
    return { verdict, violations: guarded.violations, notices: guarded.notices };
  }
};

// ghost-runner/dist/docker/stale-sweep.js
var STALE_LIST_TIMEOUT_MS = 3e3;
var STALE_RM_TIMEOUT_MS = 4e3;
var STALE_MAX_REMOVALS = 20;
async function sweepStaleBoxes(client, info = processInfo()) {
  try {
    const list = await client.run([
      "ps",
      "-a",
      "--filter",
      `label=${LABEL_OWNER}`,
      "--format",
      `{{.ID}}	{{.Label "${LABEL_OWNER}"}}	{{.Label "${LABEL_RUN_ID}"}}`
    ], { timeoutMs: STALE_LIST_TIMEOUT_MS });
    if (list.code !== 0) {
      return { removed: 0, error: list.timedOut ? "list timeout" : list.spawnError ?? `list exit ${String(list.code)}` };
    }
    const ids = [];
    for (const line of list.stdout.toString("utf8").split("\n")) {
      if (line.trim() === "")
        continue;
      const [id, owner, runId] = line.split("	");
      if (id === void 0 || id === "" || owner === void 0 || owner === "" || runId === void 0 || runId === "")
        continue;
      if (owner === info.owner || info.isAlive(owner))
        continue;
      ids.push(id);
      if (ids.length >= STALE_MAX_REMOVALS)
        break;
    }
    let removed = 0;
    let failed2 = 0;
    for (const id of ids) {
      const r = await client.run(["rm", "-f", "-v", id], { timeoutMs: STALE_RM_TIMEOUT_MS });
      if (r.code === 0 || /no such container/i.test(r.stderr.toString("utf8")))
        removed += 1;
      else
        failed2 += 1;
    }
    return failed2 > 0 ? { removed, error: `${String(failed2)} removal(s) failed` } : { removed };
  } catch (e) {
    return { removed: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
var swept = false;
async function sweepStaleBoxesOnce(client) {
  if (swept)
    return void 0;
  swept = true;
  return sweepStaleBoxes(client);
}

// ghost-runner/dist/verdict.js
var WARN_FLOOR_DIAGNOSTICS = Object.freeze([
  "recorder-failure",
  "secret-values-unreadable",
  "sqlite-unreadable",
  "protected-path-excluded"
]);
function maxVerdict(a, b) {
  return VERDICT_ORDER[a] >= VERDICT_ORDER[b] ? a : b;
}
function hasDiagnostic(diagnostics, name) {
  return diagnostics.some((d) => d.name === name);
}
function verdictFloor(i) {
  if (i.status === "isolation-violation" || i.originalChange?.classification === "isolation-violation") {
    return "block";
  }
  if (i.status !== "ok" || i.mode === "static-analysis" || i.diagnostics.some((d) => WARN_FLOOR_DIAGNOSTICS.includes(d.name)) || i.originalChange?.classification === "external-change" || i.fingerprintUnreadable === true || i.egressWardPresent === true && i.secretReadRecordingActive !== true) {
    return "warn";
  }
  return "pass";
}
function runnerVerdict(i) {
  return maxVerdict(i.wardVerdict ?? "pass", verdictFloor(i));
}
function p1Claimed(c) {
  return c.mode === "docker-box" && c.fingerprintsEqual && c.mountAuditPassed;
}
function p5Claimed(c) {
  return p1Claimed(c) && !hasDiagnostic(c.diagnostics, "protected-path-excluded");
}
function p6Claimed(c) {
  return c.mode === "docker-box" && c.secretReadRecordingActive && c.recorderHealthy && !hasDiagnostic(c.diagnostics, "recorder-failure") && !hasDiagnostic(c.diagnostics, "secret-values-unreadable");
}
function classifyOriginalChange(before, after, mountAuditPassed) {
  const { changed, changedPaths } = compareFingerprints(before, after);
  if (!changed && changedPaths.length === 0)
    return { originalUnchanged: true };
  return {
    originalUnchanged: false,
    originalChange: {
      classification: mountAuditPassed ? "external-change" : "isolation-violation",
      changedPaths: [...changedPaths]
    }
  };
}
function globCanMatchExcludedDir(glob, excludeDirs) {
  if (excludeDirs.length === 0)
    return false;
  return glob.split("/").some((seg) => seg !== "" && seg !== "." && excludeDirs.includes(seg));
}
function detectProtectedPathExcluded(wardSet, excludeDirs, _mode) {
  const out = [];
  for (const ward of wardSet?.wards ?? []) {
    if (ward.kind !== "path")
      continue;
    for (const p of ward.paths) {
      if (globCanMatchExcludedDir(p, excludeDirs))
        out.push({ wardId: ward.id, path: p });
    }
  }
  return out;
}
function protectedPathExcludedDiagnostics(found3) {
  return found3.map((f) => ({
    name: "protected-path-excluded",
    path: f.path,
    detail: {
      wardId: f.wardId,
      note: "changes inside an excluded directory are not visible to the Differ"
    }
  }));
}

// ghost-runner/dist/pipeline.js
var PLAN_B_NOTICE = "P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.";
var BOX_BUILD_HINT = "The box image is missing. Build it with: pnpm --filter @ghost-run/ghost-runner box:build";
var systemClock3 = { now: () => Date.now() };
var NO_PHASES = () => ({
  dockerCheckMs: 0,
  fingerprintBeforeMs: 0,
  copyMs: 0,
  baselineMs: 0,
  boxOverheadMs: 0,
  execMs: 0,
  diffMs: 0,
  sqliteMs: 0,
  fingerprintAfterMs: 0,
  cleanupMs: 0
});
var perf = () => performance.now();
function message(e) {
  return e instanceof Error ? e.message : String(e);
}
function validateActions(plan) {
  for (const a of plan) {
    const o = a;
    if (typeof o !== "object" || o === null || typeof o.command !== "string" || o.cwd !== void 0 && typeof o.cwd !== "string") {
      throw new TypeError("every action must be { command: string, cwd?: string }");
    }
  }
}
function raceTimeout(p, ms) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => res({ timedOut: true }), Math.max(0, ms));
    p.then((value) => {
      clearTimeout(timer);
      res({ timedOut: false, value });
    }, (e) => {
      clearTimeout(timer);
      rej(e instanceof Error ? e : new Error(String(e)));
    });
  });
}
function chmodRecursive(path8) {
  return new Promise((done) => {
    const child = spawn3("chmod", ["-R", "u+rwX", "--", path8], { stdio: "ignore", shell: false });
    child.on("error", () => done());
    child.on("close", () => done());
  });
}
async function removeTree(path8) {
  try {
    await rm3(path8, { recursive: true, force: true });
  } catch {
    await chmodRecursive(path8);
    await rm3(path8, { recursive: true, force: true });
  }
}
async function assertDirectory(original) {
  const st = await stat2(original).catch(() => void 0);
  if (st === void 0 || !st.isDirectory()) {
    throw new ConfigError("original", "existing directory", original);
  }
}
function capText(text2, max2 = 300) {
  return text2.length > max2 ? `${text2.slice(0, max2)}...` : text2;
}
async function scanSymlinksOutside(original, excludeDirs) {
  const roots = /* @__PURE__ */ new Set([resolve5(original)]);
  roots.add(await realpath2(original).catch(() => resolve5(original)));
  const entries = await walkManifest(original, { excludeDirs });
  const out = [];
  for (const e of entries) {
    if (e.type !== "symlink" || e.target === void 0)
      continue;
    const abs = isAbsolute(e.target) ? normalize(e.target) : resolve5(dirname3(join8(original, e.path)), e.target);
    const inside = [...roots].some((r) => abs === r || abs.startsWith(r.endsWith(sep) ? r : r + sep));
    if (!inside)
      out.push({ kind: "symlink-outside-original", destination: e.target, path: e.path });
  }
  return out;
}
async function planB(plan, resolved, original, avail, runId, phases, onNotice) {
  const notices = [PLAN_B_NOTICE];
  if (avail.reason === "box-image-missing")
    notices.push(BOX_BUILD_HINT);
  for (const n of notices) {
    try {
      onNotice?.(n);
    } catch {
    }
  }
  const diagnostics = protectedPathExcludedDiagnostics(detectProtectedPathExcluded(resolved.wardSet, resolved.excludeDirs, resolved.excludedDirMode));
  const perAction = plan.map((a) => analyze(a, originalRootsOf(original)));
  const staticFindings = perAction.flat();
  try {
    staticFindings.push(...await scanSymlinksOutside(original, resolved.excludeDirs));
  } catch (e) {
    diagnostics.push({
      name: "plan-b-scan-failed",
      detail: { reason: e instanceof FingerprintReadError ? "unreadable-path" : "error" },
      ...e instanceof FingerprintReadError ? { path: e.path } : {}
    });
  }
  const report = {
    snapshots: [],
    changes: plan.map(() => []),
    effectsOutside: perAction,
    observedEvents: [],
    variantResults: []
  };
  const wardVerdict = WardEngine.evaluate(report, resolved.wardSet);
  const status = "ok";
  const isolation = {
    mode: "static-analysis",
    reason: avail.reason,
    p1Claimed: false,
    p5Claimed: false,
    p6Claimed: false,
    readOnlyMounts: []
  };
  const result = {
    schemaVersion: 1,
    runId,
    status,
    rehearsed: false,
    verdict: runnerVerdict({ status, mode: "static-analysis", wardVerdict: wardVerdict.verdict, diagnostics }),
    wardVerdict,
    report,
    exitCodes: [],
    copy: { cloned: false, location: "" },
    isolation,
    recorder: { location: "in-box", tamperResistant: false },
    captures: [],
    diagnostics,
    staticFindings,
    notices,
    phases,
    dockerWakeRetried: avail.wakeRetried
  };
  return { result, payloads: /* @__PURE__ */ new Map() };
}
async function loadSecretValues(copyDir, wardSet, excludeDirs, diagnostics) {
  const patterns = [];
  let hasEgress = false;
  for (const w of wardSet.wards) {
    if (w.kind !== "egress")
      continue;
    hasEgress = true;
    for (const s of w.secrets)
      if (!patterns.includes(s))
        patterns.push(s);
  }
  if (!hasEgress)
    return void 0;
  const values = /* @__PURE__ */ new Map();
  let entries;
  try {
    entries = await walkManifest(copyDir, { excludeDirs });
  } catch (e) {
    diagnostics.push({
      name: "secret-values-unreadable",
      path: e instanceof FingerprintReadError ? e.path : "."
    });
    return values;
  }
  const matches = createSecretMatcher(patterns);
  const matching = entries.filter((e) => (e.type === "file" || e.type === "symlink" || e.type === "other") && matches(e.path)).sort((a, b) => compareBytes(a.path, b.path));
  for (let i = 0; i < matching.length; i++) {
    const entry = matching[i];
    if (i >= MAX_SECRET_FILES) {
      diagnostics.push({
        name: SECRET_VALUES_CAPPED,
        path: entry.path,
        detail: { reason: "count", byteLength: entry.size, cap: MAX_SECRET_FILES }
      });
      continue;
    }
    if (entry.type !== "file") {
      diagnostics.push({ name: "secret-values-unreadable", path: entry.path });
      continue;
    }
    let handle;
    try {
      handle = await open3(join8(copyDir, entry.path), constants.O_RDONLY | constants.O_NOFOLLOW);
      const total = (await handle.stat()).size;
      const buf = Buffer.alloc(Math.min(total, MAX_SECRET_FILE_BYTES));
      let got = 0;
      while (got < buf.length) {
        const { bytesRead } = await handle.read(buf, got, buf.length - got, got);
        if (bytesRead === 0)
          break;
        got += bytesRead;
      }
      values.set(entry.path, new Uint8Array(buf.subarray(0, got)));
      if (total > MAX_SECRET_FILE_BYTES) {
        diagnostics.push({
          name: SECRET_VALUES_CAPPED,
          path: entry.path,
          detail: { reason: "size", byteLength: total, cap: MAX_SECRET_FILE_BYTES }
        });
      }
    } catch {
      diagnostics.push({ name: "secret-values-unreadable", path: entry.path });
    } finally {
      await handle?.close().catch(() => void 0);
    }
  }
  return values;
}
function newRun() {
  return {
    status: "ok",
    snapshots: [],
    changes: [],
    effects: [],
    exitCodes: [],
    observedEvents: [],
    captures: [],
    payloads: /* @__PURE__ */ new Map(),
    diagnostics: [],
    mountAuditPassed: true,
    boxCreated: false,
    boxAttempted: false,
    recorderHealthy: true,
    fingerprintUnreadable: false,
    readOnlyMounts: []
  };
}
async function execute(c, run3) {
  const { resolved, original, clock, phases } = c;
  const left = () => c.deadlineAt - clock.now();
  const excludeDirs = resolved.excludeDirs;
  const secretPatterns2 = effectiveSecretPatterns(resolved);
  run3.diagnostics.push(...protectedPathExcludedDiagnostics(detectProtectedPathExcluded(resolved.wardSet, excludeDirs, resolved.excludedDirMode)));
  const fpP = (async () => {
    const t = perf();
    try {
      const value = await fingerprintOriginal(original, { excludeDirs });
      return { ok: true, value, ms: perf() - t };
    } catch (error) {
      return { ok: false, error, ms: perf() - t };
    }
  })();
  const boxP = (async () => {
    const t = perf();
    try {
      const placed = await placeCopy(original, c.runId, tmpdir2());
      run3.copyDir = placed.copyDir;
      const readonlyMounts = await readonlyMountsFor(original, excludeDirs, resolved.excludedDirMode);
      run3.readOnlyMounts = readonlyMounts.map((m) => m.destination.replace(/^\/work\//, ""));
      run3.boxAttempted = true;
      const created = await createBox(c.client, {
        runId: c.runId,
        image: c.avail.imageRef,
        imageEnv: c.avail.imageEnv,
        mounts: { copyDir: await realpath2(placed.copyDir), readonlyMounts },
        limits: resolved.limits,
        uid: process.getuid?.() ?? 1e3,
        gid: process.getgid?.() ?? 1e3,
        execLimitMs: resolved.execLimitSec * 1e3,
        deadlineAt: c.deadlineAt,
        clock
      });
      if (created.ok)
        return { kind: "ok", box: created.box };
      const cleanupDetail = created.cleanup.ok ? void 0 : created.cleanup.detail;
      return created.kind === "create-failed" ? { kind: "create-failed", detail: created.detail, ...cleanupDetail !== void 0 ? { cleanupDetail } : {} } : {
        kind: "isolation-violation",
        differences: created.differences,
        ...cleanupDetail !== void 0 ? { cleanupDetail } : {}
      };
    } catch (error) {
      return { kind: "threw", error };
    } finally {
      phases.boxOverheadMs += perf() - t;
    }
  })();
  const [fpBefore, attempt] = await Promise.all([fpP, boxP]);
  phases.fingerprintBeforeMs = fpBefore.ms;
  if (attempt.kind === "threw")
    throw attempt.error;
  if (attempt.kind !== "ok") {
    if (attempt.cleanupDetail !== void 0) {
      run3.diagnostics.push({ name: "cleanup-failed", detail: { target: "container", detail: capText(attempt.cleanupDetail) } });
    }
    if (attempt.kind === "create-failed") {
      run3.status = "internal-error";
      run3.diagnostics.push({ name: "box-create-failed", detail: { detail: capText(attempt.detail) } });
    } else {
      run3.status = "isolation-violation";
      run3.mountAuditPassed = false;
      run3.diagnostics.push({
        name: "isolation-violation",
        detail: { differences: capText(attempt.differences.join("; "), 500) }
      });
    }
    return;
  }
  const box = attempt.box;
  run3.box = box;
  run3.boxCreated = true;
  const copyDir = run3.copyDir;
  let fp;
  if (fpBefore.ok) {
    fp = fpBefore.value;
  } else if (fpBefore.error instanceof FingerprintReadError) {
    run3.fingerprintUnreadable = true;
    run3.diagnostics.push({ name: "fingerprint-unreadable", path: fpBefore.error.path });
  } else {
    throw fpBefore.error;
  }
  if (left() <= 0) {
    run3.status = "pipeline-deadline";
    return;
  }
  const copyBudget = Math.min(COPY_LIMIT_SEC * 1e3, left());
  const copyStart = perf();
  const copied = await copyOriginal({
    original,
    excludeDirs,
    runId: c.runId,
    targetDir: copyDir,
    timeoutMs: copyBudget
  });
  phases.copyMs = perf() - copyStart;
  if (copied.status !== "ok") {
    run3.status = copyBudget < COPY_LIMIT_SEC * 1e3 ? "pipeline-deadline" : "copy-timeout";
    return;
  }
  run3.copy = { cloned: copied.cloned, location: copyDir, copiedAtNs: copied.copiedAtNs };
  let secretValues;
  try {
    secretValues = await loadSecretValues(copyDir, resolved.wardSet, excludeDirs, run3.diagnostics);
    if (left() <= 0) {
      run3.status = "pipeline-deadline";
      return;
    }
    const baseStart = perf();
    let entries;
    let counted = {};
    if (fp !== void 0) {
      const [walked, c0] = await Promise.all([walkManifest(copyDir, { excludeDirs }), box.countSqlite(fp.sqliteCandidates)]);
      const inherited = inheritHashes(walked, fp.entries);
      if (inherited.complete) {
        entries = inherited.entries;
        counted = c0;
      }
    }
    if (entries === void 0) {
      const copyFp = await fingerprintOriginal(copyDir, { excludeDirs, fingerprintMode: "full" });
      entries = [...copyFp.entries];
      counted = await box.countSqlite(copyFp.sqliteCandidates);
    }
    const files = new Set(entries.filter((e) => e.type === "file").map((e) => e.path));
    const sqlite0 = nextSqliteState({}, counted, files);
    for (const [path8, v] of Object.entries(sqlite0)) {
      if (v === "unreadable")
        run3.diagnostics.push({ name: "sqlite-unreadable", path: path8 });
    }
    phases.baselineMs = perf() - baseStart;
    const state0 = { rootPath: copyDir, entries, sqlite: sqlite0 };
    run3.snapshots.push({ id: "repo-0", state: state0, result: { success: true } });
    const timings = { sqliteMs: 0 };
    const session = {
      box,
      copyDir,
      sentinelPath: copied.sentinelPath,
      excludeDirs,
      secretPatterns: secretPatterns2,
      collectPerStep: false,
      eventBuilder: new EventBuilder(),
      payloads: /* @__PURE__ */ new Map(),
      cwds: [],
      originalRoots: originalRootsOf(original),
      timings,
      entries,
      sqlite: sqlite0,
      baselineNs: copied.copiedAtNs
    };
    for (let i = 0; i < c.plan.length; i++) {
      if (left() <= 0) {
        run3.status = "pipeline-deadline";
        break;
      }
      const action = c.plan[i];
      const stepStart = perf();
      const sqliteBefore = timings.sqliteMs;
      const r = await stepInSession(session, i, action);
      const stepMs = perf() - stepStart;
      const execMs = r.outcome.kind === "error" ? 0 : r.outcome.durationMs;
      phases.execMs += execMs;
      phases.diffMs += Math.max(0, stepMs - execMs - (timings.sqliteMs - sqliteBefore));
      const diffStart = perf();
      const prev = run3.snapshots[i];
      let error = r.error;
      if (r.outcome.kind === "timeout") {
        if (r.outcome.reason === "exec-limit") {
          run3.status = "timeout";
          error = `timeout after ${String(resolved.execLimitSec)} s`;
        } else {
          run3.status = "pipeline-deadline";
          error = `pipeline deadline of ${String(resolved.pipelineDeadlineSec)} s reached`;
        }
      }
      const snap = {
        id: `repo-${String(i + 1)}`,
        state: r.state,
        result: error === void 0 ? { success: true } : { success: false, error }
      };
      run3.snapshots.push(snap);
      run3.changes.push(diff(prev.state, snap.state));
      run3.effects.push(analyze(action, session.originalRoots ?? []));
      run3.exitCodes.push(r.outcome.kind === "exited" ? r.outcome.exitCode : -1);
      run3.diagnostics.push(...snap.state.lastStep?.diagnostics ?? [], ...diffDiagnostics(prev.state, snap.state, i));
      phases.diffMs += perf() - diffStart;
      if (run3.status !== "ok")
        break;
    }
    phases.sqliteMs = timings.sqliteMs;
    const executed = run3.exitCodes.length;
    if (executed > 0) {
      const rec = await box.collect({
        executedSteps: executed,
        cwds: session.cwds,
        secretPatterns: secretPatterns2,
        eventBuilder: session.eventBuilder
      });
      run3.observedEvents = rec.events;
      run3.captures = [...rec.payloadCaptures];
      run3.payloads = rec.payloads;
      run3.recorderHealthy = rec.recorderOk;
      run3.diagnostics.push(...rec.diagnostics);
    }
    const fpLeft = left();
    if (fp !== void 0 && fpLeft > 0) {
      const afterStart = perf();
      try {
        const after = await raceTimeout(fingerprintOriginal(original, { excludeDirs, baseline: fp }), fpLeft);
        if (after.timedOut) {
          run3.status = "pipeline-deadline";
        } else {
          run3.originalClass = classifyOriginalChange(fp.fingerprint, after.value.fingerprint, run3.mountAuditPassed);
        }
      } catch (e) {
        if (!(e instanceof FingerprintReadError))
          throw e;
        run3.fingerprintUnreadable = true;
        run3.diagnostics.push({ name: "fingerprint-unreadable", path: e.path });
      }
      phases.fingerprintAfterMs = perf() - afterStart;
    } else if (fp !== void 0) {
      run3.status = "pipeline-deadline";
    }
    const externallyChanged = run3.originalClass?.originalChange?.changedPaths;
    if (externallyChanged !== void 0 && externallyChanged.length > 0) {
      const changedByGhost = /* @__PURE__ */ new Set();
      for (const ch of run3.changes.flat()) {
        if (typeof ch["path"] === "string")
          changedByGhost.add(ch["path"]);
      }
      for (const p of externallyChanged) {
        if (changedByGhost.has(p) && !run3.diagnostics.some((d) => d.name === "baseline-race" && d.path === p)) {
          run3.diagnostics.push({ name: "baseline-race", path: p, detail: { origin: "original-changed-during-run" } });
        }
      }
    }
    const report = buildReport(run3);
    run3.wardVerdict = WardEngine.evaluate(report, resolved.wardSet, {
      payloads: run3.payloads,
      ...secretValues !== void 0 ? { secretValues } : {}
    });
  } finally {
    secretValues?.clear();
    secretValues = void 0;
  }
}
function buildReport(run3) {
  return {
    snapshots: run3.snapshots,
    changes: run3.changes,
    effectsOutside: run3.effects,
    observedEvents: run3.observedEvents,
    variantResults: []
  };
}
async function cleanup(c, run3) {
  const start = perf();
  try {
    if (run3.boxAttempted) {
      const r = run3.box !== void 0 ? await run3.box.cleanup() : await removeRunContainers(c.client, c.runId);
      if (!r.ok) {
        run3.diagnostics.push({ name: "cleanup-failed", detail: { target: "container", detail: capText(r.detail ?? "unknown") } });
      }
    }
  } catch (e) {
    run3.diagnostics.push({ name: "cleanup-failed", detail: { target: "container", detail: capText(message(e)) } });
  }
  if (run3.copyDir !== void 0) {
    for (const p of [run3.copyDir, sentinelPathFor(run3.copyDir)]) {
      try {
        await removeTree(p);
      } catch (e) {
        run3.diagnostics.push({ name: "cleanup-failed", detail: { target: "copy", detail: capText(message(e)) } });
      }
    }
  }
  c.phases.cleanupMs = perf() - start;
}
function assemble(c, run3) {
  const { resolved } = c;
  const executed = run3.exitCodes.length;
  const mode = "docker-box";
  const oc = run3.originalClass;
  const originalChange = oc?.originalChange;
  const egressWardPresent = resolved.wardSet.wards.some((w) => w.kind === "egress");
  const fingerprintsEqual = oc?.originalUnchanged === true && !run3.fingerprintUnreadable;
  const claims = {
    mode,
    diagnostics: run3.diagnostics,
    fingerprintsEqual,
    mountAuditPassed: run3.mountAuditPassed && run3.boxCreated,
    secretReadRecordingActive: run3.boxCreated,
    recorderHealthy: run3.recorderHealthy
  };
  const isolation = {
    mode,
    p1Claimed: p1Claimed(claims),
    p5Claimed: p5Claimed(claims),
    p6Claimed: p6Claimed(claims),
    ...oc !== void 0 ? { originalUnchanged: oc.originalUnchanged } : {},
    readOnlyMounts: run3.readOnlyMounts,
    mountAuditPassed: run3.mountAuditPassed && run3.boxCreated
  };
  const verdict = runnerVerdict({
    status: run3.status,
    mode,
    ...run3.wardVerdict !== void 0 ? { wardVerdict: run3.wardVerdict.verdict } : {},
    diagnostics: run3.diagnostics,
    ...originalChange !== void 0 ? { originalChange } : {},
    fingerprintUnreadable: run3.fingerprintUnreadable,
    egressWardPresent,
    secretReadRecordingActive: run3.boxCreated
  });
  const result = {
    schemaVersion: 1,
    runId: c.runId,
    status: run3.status,
    rehearsed: executed > 0,
    verdict,
    ...run3.wardVerdict !== void 0 ? { wardVerdict: run3.wardVerdict } : {},
    report: buildReport(run3),
    exitCodes: run3.exitCodes,
    ...run3.copy !== void 0 ? { copiedAt: run3.copy.copiedAtNs } : {},
    copy: run3.copy !== void 0 ? { cloned: run3.copy.cloned, location: run3.copy.location } : { cloned: false, location: "" },
    ...run3.boxCreated ? { box: { source: "fresh", image: c.avail.tag } } : {},
    isolation,
    ...originalChange !== void 0 ? { originalChange } : {},
    recorder: { location: "in-box", tamperResistant: false },
    captures: run3.captures,
    diagnostics: run3.diagnostics,
    staticFindings: [],
    notices: [],
    phases: c.phases,
    dockerWakeRetried: c.avail.wakeRetried
  };
  return { result, payloads: run3.payloads };
}
async function runPlan(plan, opts) {
  validatePlanSize(plan.length);
  const resolved = resolveRunnerOptions(opts);
  validateActions(plan);
  const original = resolve5(resolved.original);
  await assertDirectory(original);
  const image = resolved.image ?? imageFromEnv(process.env);
  const clock = opts.clock ?? systemClock3;
  const client = opts.client ?? createDockerClient("docker", clock);
  let deadlineAt = clock.now() + resolved.pipelineDeadlineSec * 1e3;
  const runId = resolved.runId ?? randomUUID2();
  const phases = NO_PHASES();
  const checkStart = perf();
  const avail = await checkDockerAvailability(client, {
    ...image !== void 0 ? { image } : {},
    ...resolved.boxDir !== void 0 ? { boxDir: resolved.boxDir } : {},
    env: process.env,
    workspace: original,
    clock,
    ...resolved.dockerWakeRetryMs !== void 0 ? { wakeRetryLimitMs: resolved.dockerWakeRetryMs, deadlineAt } : {}
  });
  phases.dockerCheckMs = perf() - checkStart;
  if (!avail.available)
    return planB(plan, resolved, original, avail, runId, phases, opts.onNotice);
  const sweepDiagnostics = [];
  const sweepStart = clock.now();
  const swept2 = await sweepStaleBoxesOnce(client);
  deadlineAt += Math.max(0, clock.now() - sweepStart);
  if (swept2?.error !== void 0) {
    sweepDiagnostics.push({ name: "stale-sweep-failed", detail: { detail: capText(swept2.error), removed: swept2.removed } });
  }
  const ctx = { plan, resolved, original, client, clock, runId, deadlineAt, avail, phases };
  const run3 = newRun();
  run3.diagnostics.push(...sweepDiagnostics);
  if (resolved.runId !== void 0) {
    const dup = await findRunIdContainers(client, runId);
    if (!dup.ok) {
      run3.diagnostics.push({ name: "run-id-check-failed", detail: { detail: capText(dup.detail) } });
    } else if (dup.ids.length > 0) {
      throw new ConfigError("runId", "a run id not used by an existing ghost-run container", runId);
    }
  }
  const signal = opts.signal;
  try {
    if (signal === void 0) {
      await execute(ctx, run3);
    } else {
      signal.throwIfAborted();
      const work = execute(ctx, run3);
      let onAbort;
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        await Promise.race([work, aborted]);
      } catch (e) {
        if (signal.aborted) {
          void work.then(() => void 0, () => void 0).then(() => cleanup(ctx, run3)).catch(() => void 0);
        }
        throw e;
      } finally {
        if (onAbort !== void 0)
          signal.removeEventListener("abort", onAbort);
      }
    }
  } finally {
    await cleanup(ctx, run3);
  }
  return assemble(ctx, run3);
}

// integrations/kiro-hook/gate-config.mjs
var WARN_MODE = "ask";
var DOCKER_WAKE_RETRY_MS = 1e4;
var SEMAPHORE_SLOTS = 2;
var SEMAPHORE_WAIT_MS = 5e3;
var COMMAND_MAX_CODE_POINTS = 4096;
var STORE_CAPS = Object.freeze({
  sessions: 20,
  runs: 200,
  graveyardLines: 2e3,
  provenancePerSession: 1e3,
  recordBytes: 1048576
});
var RUNNER_SUPPORTS_RUN_ID = true;
var FILE_EVENT_PATH_FIELDS = Object.freeze(["file_path"]);
var POST_RESPONSE_FIELDS = Object.freeze(["tool_response"]);

// integrations/kiro-hook/lib/event.mjs
var NOT_RECOGNIZED_MESSAGE = "tool or input not recognized by the gate: not allowed.";
var TARGET_PATH_FIELDS = Object.freeze(["path", "targetFile", "file_path"]);
var REQUIRED_FIELDS = (
  /** @type {const} */
  ["cwd", "session_id", "tool_name"]
);
function parseHookEvent(text2) {
  let raw;
  try {
    raw = JSON.parse(text2);
  } catch {
    return { ok: false, field: "stdin" };
  }
  if (!isPlainObject(raw)) return { ok: false, field: "stdin" };
  const name = ownString(raw, "hook_event_name");
  if (name !== "PreToolUse") return { ok: false, field: "hook_event_name" };
  const strings = {};
  for (const f of REQUIRED_FIELDS) {
    const v = ownString(raw, f);
    if (v === void 0) return { ok: false, field: f };
    strings[f] = v;
  }
  const input = Object.hasOwn(raw, "tool_input") ? raw["tool_input"] : void 0;
  if (!isPlainObject(input)) return { ok: false, field: "tool_input" };
  const toolInput = {};
  for (const key of Object.keys(input)) {
    Object.defineProperty(toolInput, key, {
      value: input[key],
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return {
    ok: true,
    event: {
      hook_event_name: "PreToolUse",
      cwd: (
        /** @type {string} */
        strings["cwd"]
      ),
      session_id: (
        /** @type {string} */
        strings["session_id"]
      ),
      tool_name: (
        /** @type {string} */
        strings["tool_name"]
      ),
      tool_input: toolInput
    }
  };
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function ownString(obj2, key) {
  if (!Object.hasOwn(obj2, key)) return void 0;
  const v = obj2[key];
  return typeof v === "string" ? v : void 0;
}
var TOOL_TABLE = Object.freeze({
  execute_bash: { class: "shell", targetFields: [], textFields: [] },
  fs_write: { class: "write", targetFields: ["path"], textFields: ["text"] },
  fs_append: { class: "write", targetFields: ["path"], textFields: ["text"] },
  str_replace: { class: "write", targetFields: ["path"], textFields: ["newStr"] },
  // Unobserved in the Kiro CLI 3.4.0 default agent; kept per the design table.
  delete_file: { class: "write", targetFields: ["targetFile"], textFields: [] },
  // `code` is write or read-only depending on `operation`; see classifyTool.
  code: {
    class: "write",
    targetFields: ["file_path", "path"],
    textFields: ["replacement", "new_name"]
  }
});
var CODE_READ_ONLY_OPERATIONS = Object.freeze(
  /* @__PURE__ */ new Set([
    "search_symbols",
    "lookup_symbols",
    "get_document_symbols",
    "generate_codebase_overview",
    "search_codebase_map",
    "pattern_search",
    "goto_definition",
    "find_references",
    "hover",
    "completion",
    "diagnostics"
  ])
);
function deny(reason = NOT_RECOGNIZED_MESSAGE) {
  return { class: "deny", targets: [], texts: [], reason };
}
function classifyTool(event) {
  const name = event.tool_name;
  if (!Object.hasOwn(TOOL_TABLE, name)) return deny();
  const entry = (
    /** @type {ToolEntry} */
    TOOL_TABLE[name]
  );
  const input = event.tool_input;
  const order = [...entry.targetFields, ...TARGET_PATH_FIELDS.filter((f) => !entry.targetFields.includes(f))];
  const targets = [];
  for (const field of order) {
    if (!Object.hasOwn(input, field)) continue;
    const v = input[field];
    if (typeof v !== "string") return deny();
    if (v !== "") targets.push(v);
  }
  const texts = [];
  for (const field of entry.textFields) {
    if (!Object.hasOwn(input, field)) continue;
    const v = input[field];
    if (typeof v !== "string") return deny();
    texts.push(v);
  }
  if (name === "execute_bash") {
    const command = Object.hasOwn(input, "command") ? input["command"] : void 0;
    if (typeof command !== "string") return deny();
    return { class: "shell", targets, texts, command };
  }
  if (name === "code") {
    const op = Object.hasOwn(input, "operation") ? input["operation"] : void 0;
    if (typeof op === "string" && CODE_READ_ONLY_OPERATIONS.has(op)) {
      return { class: "read-only", targets, texts };
    }
  }
  if (targets.length === 0) return deny();
  return { class: "write", targets, texts };
}

// integrations/kiro-hook/lib/hook-io.mjs
var FATAL_LINES = Object.freeze({
  unavailable: "GHOST RUN GATE UNAVAILABLE: build the packages first (pnpm -r build).",
  "internal-error": "GHOST RUN GATE ERROR: internal-error; the tool call was not allowed.",
  timeout: "GHOST RUN GATE TIMEOUT: no verdict within 50 s; the tool call was not allowed."
});

// integrations/kiro-hook/lib/store/ghost-store.mjs
import { randomBytes } from "node:crypto";
import { constants as fsc3 } from "node:fs";
import fsp2 from "node:fs/promises";
import path2 from "node:path";

// core/dist/src/types.js
var VERDICT_ORDER2 = {
  pass: 0,
  warn: 1,
  block: 2
};

// core/dist/src/judge/bytes.js
function utf8Encode2(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 55296 && cp <= 56319) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 56320 && next <= 57343) {
        cp = 65536 + (cp - 55296 << 10) + (next - 56320);
        i++;
      } else {
        cp = 65533;
      }
    } else if (cp >= 56320 && cp <= 57343) {
      cp = 65533;
    }
    if (cp < 128) {
      out.push(cp);
    } else if (cp < 2048) {
      out.push(192 | cp >> 6, 128 | cp & 63);
    } else if (cp < 65536) {
      out.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
    } else {
      out.push(240 | cp >> 18, 128 | cp >> 12 & 63, 128 | cp >> 6 & 63, 128 | cp & 63);
    }
  }
  return Uint8Array.from(out);
}
function compareCodePoints2(a, b) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = codePointAt2(a, i);
    const cb = codePointAt2(b, j);
    if (ca !== cb)
      return ca < cb ? -1 : 1;
    i += ca > 65535 ? 2 : 1;
    j += cb > 65535 ? 2 : 1;
  }
  if (i < a.length)
    return 1;
  if (j < b.length)
    return -1;
  return 0;
}
function codePointAt2(s, i) {
  const hi = s.charCodeAt(i);
  if (hi >= 55296 && hi <= 56319 && i + 1 < s.length) {
    const lo = s.charCodeAt(i + 1);
    if (lo >= 56320 && lo <= 57343) {
      return 65536 + (hi - 55296 << 10) + (lo - 56320);
    }
  }
  if (hi >= 55296 && hi <= 57343)
    return 65533;
  return hi;
}
var B642 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64Encode2(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B642.charAt(b0 >> 2);
    out += B642.charAt((b0 & 3) << 4 | b1 >> 4);
    out += i + 1 < bytes.length ? B642.charAt((b1 & 15) << 2 | b2 >> 6) : "=";
    out += i + 2 < bytes.length ? B642.charAt(b2 & 63) : "=";
  }
  return out;
}

// core/dist/src/judge/canary.js
var MIN_LENGTH2 = 8;
var MAX_LENGTH2 = 16384;
var MAX_CANDIDATES2 = 256;
var CR2 = 13;
var LF2 = 10;
var SPACE2 = 32;
var TAB2 = 9;
var HASH2 = 35;
var EQUALS2 = 61;
var SINGLE_QUOTE2 = 39;
var DOUBLE_QUOTE2 = 34;
var UNDERSCORE2 = 95;
function isBlank2(b) {
  return b === SPACE2 || b === TAB2;
}
function isKeyStart2(b) {
  return b >= 65 && b <= 90 || b >= 97 && b <= 122 || b === UNDERSCORE2;
}
function isKeyPart2(b) {
  return isKeyStart2(b) || b >= 48 && b <= 57;
}
function isEnvFileName2(secretPath) {
  const cut = Math.max(secretPath.lastIndexOf("/"), secretPath.lastIndexOf("\\"));
  const base = secretPath.slice(cut + 1).replace(/[A-Z]/g, (c) => c.toLowerCase());
  return base === ".env" || base.startsWith(".env.");
}
function byteKey2(bytes) {
  let key = "";
  const chunk = 4096;
  for (let i = 0; i < bytes.length; i += chunk) {
    key += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return key;
}
function parseEnvLine2(content, start, end) {
  let i = start;
  if (end > i && content[end - 1] === CR2)
    end -= 1;
  while (i < end && isBlank2(content[i]))
    i += 1;
  if (i >= end || content[i] === HASH2)
    return void 0;
  if (end - i > 6 && content[i] === 101 && // e
  content[i + 1] === 120 && // x
  content[i + 2] === 112 && // p
  content[i + 3] === 111 && // o
  content[i + 4] === 114 && // r
  content[i + 5] === 116 && // t
  isBlank2(content[i + 6])) {
    i += 6;
    while (i < end && isBlank2(content[i]))
      i += 1;
  }
  if (i >= end || !isKeyStart2(content[i]))
    return void 0;
  i += 1;
  while (i < end && isKeyPart2(content[i]))
    i += 1;
  if (i >= end || content[i] !== EQUALS2)
    return void 0;
  i += 1;
  let vs = i;
  let ve = end;
  while (vs < ve && isBlank2(content[vs]))
    vs += 1;
  while (ve > vs && isBlank2(content[ve - 1]))
    ve -= 1;
  if (ve - vs >= 2) {
    const first = content[vs];
    if ((first === SINGLE_QUOTE2 || first === DOUBLE_QUOTE2) && content[ve - 1] === first) {
      vs += 1;
      ve -= 1;
    }
  }
  return content.slice(vs, ve);
}
function extractCanariesDetailed2(secretPath, content) {
  const raw = [];
  let wholeEnd = content.length;
  while (wholeEnd > 0 && (content[wholeEnd - 1] === CR2 || content[wholeEnd - 1] === LF2))
    wholeEnd -= 1;
  raw.push(content.slice(0, wholeEnd));
  if (isEnvFileName2(secretPath)) {
    let lineStart = 0;
    for (let i = 0; i <= content.length; i += 1) {
      if (i === content.length || content[i] === LF2) {
        const value = parseEnvLine2(content, lineStart, i);
        if (value !== void 0)
          raw.push(value);
        lineStart = i + 1;
      }
    }
  }
  let tooShort = 0;
  let tooLong = 0;
  let tooMany = 0;
  const seen = /* @__PURE__ */ new Set();
  const candidates = [];
  for (const candidate of raw) {
    if (candidate.length < MIN_LENGTH2) {
      tooShort += 1;
      continue;
    }
    if (candidate.length > MAX_LENGTH2) {
      tooLong += 1;
      continue;
    }
    const key = byteKey2(candidate);
    if (seen.has(key))
      continue;
    if (candidates.length >= MAX_CANDIDATES2) {
      tooMany += 1;
      continue;
    }
    seen.add(key);
    candidates.push(candidate);
  }
  return { candidates, discarded: { tooShort, tooLong, tooMany } };
}
function extractCanaries(secretPath, content) {
  return extractCanariesDetailed2(secretPath, content).candidates;
}

// core/dist/src/judge/normalize.js
function resolvePath2(p) {
  const stack = [];
  let escapes = false;
  for (const segment of p.normalize("NFC").split("/")) {
    if (segment === "" || segment === ".")
      continue;
    if (segment === "..") {
      const top = stack[stack.length - 1];
      if (top !== void 0 && top !== "..") {
        stack.pop();
      } else {
        stack.push("..");
        escapes = true;
      }
      continue;
    }
    stack.push(segment);
  }
  return { segments: stack, escapes };
}
function normalizePath2(p) {
  return resolvePath2(p).segments.join("/");
}
function foldPath2(p) {
  let out = "";
  for (const c of normalizePath2(p)) {
    const lower = c.toLowerCase();
    out += [...lower].length === 1 ? lower : c;
  }
  return out.normalize("NFC");
}

// core/dist/src/judge/sanitize.js
var HIDDEN_RANGES2 = [
  [0, 31],
  [127, 127],
  [8203, 8205],
  [8288, 8288],
  [65279, 65279],
  [8234, 8238],
  [8294, 8297],
  [917504, 917631]
];
function isHiddenCodePoint2(cp) {
  for (const [lo, hi] of HIDDEN_RANGES2) {
    if (cp >= lo && cp <= hi)
      return true;
  }
  return false;
}
function hasHiddenChar2(s) {
  for (let i = 0; i < s.length; i++) {
    if (isHiddenCodePoint2(s.charCodeAt(i)))
      return true;
  }
  for (const ch of s) {
    if (isHiddenCodePoint2(ch.codePointAt(0)))
      return true;
  }
  return false;
}
function sanitizeText2(s, maxCodePoints = 120) {
  const max2 = Math.max(3, Math.floor(maxCodePoints));
  const tokens = [];
  let total = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const token = isHiddenCodePoint2(cp) ? `\\u{${cp.toString(16).toUpperCase()}}` : ch;
    tokens.push(token);
    total += token.length === ch.length ? [...token].length : token.length;
  }
  if (total <= max2)
    return tokens.join("");
  let out = "";
  let len = 0;
  for (const token of tokens) {
    const tokenLen = [...token].length;
    if (len + tokenLen > max2 - 3)
      break;
    out += token;
    len += tokenLen;
  }
  return `${out}...`;
}

// core/dist/src/judge/glob.js
var STAR2 = 42;
var QUESTION2 = 63;
var OPEN2 = 91;
var CLOSE2 = 93;
var BANG2 = 33;
var DASH2 = 45;
function toCodePoints2(s) {
  const out = [];
  for (const ch of s)
    out.push(ch.codePointAt(0));
  return out;
}
function single2(s) {
  const cp = s.codePointAt(0);
  if (cp === void 0)
    return void 0;
  return s.length === (cp > 65535 ? 2 : 1) ? cp : void 0;
}
function lower12(cp) {
  return single2(String.fromCodePoint(cp).toLowerCase()) ?? cp;
}
function upper12(cp) {
  return single2(String.fromCodePoint(cp).toUpperCase()) ?? cp;
}
function parseClass2(cps, i) {
  let j = i + 1;
  let neg = false;
  if (cps[j] === BANG2) {
    neg = true;
    j++;
  }
  if (j >= cps.length)
    return { ok: false, code: "unterminated-class" };
  if (cps[j] === CLOSE2)
    return { ok: false, code: "empty-class" };
  const items = [];
  let descending = false;
  while (j < cps.length) {
    const c = cps[j];
    if (c === CLOSE2) {
      if (descending)
        return { ok: false, code: "descending-range" };
      return { ok: true, neg, items, next: j + 1 };
    }
    if (cps[j + 1] === DASH2 && j + 2 < cps.length && cps[j + 2] !== CLOSE2) {
      const hi = cps[j + 2];
      if (c > hi)
        descending = true;
      items.push([c, hi]);
      j += 3;
    } else {
      items.push(c);
      j++;
    }
  }
  return { ok: false, code: "unterminated-class" };
}
function normalizePattern2(pattern) {
  return normalizePath2(pattern);
}
function foldCp2(cp) {
  return lower12(cp);
}
function tokenizeSegment2(seg, caseSensitive) {
  const cps = toCodePoints2(seg);
  const toks = [];
  let i = 0;
  while (i < cps.length) {
    const c = cps[i];
    if (c === STAR2) {
      if (toks[toks.length - 1]?.k !== "star")
        toks.push({ k: "star" });
      i++;
    } else if (c === QUESTION2) {
      toks.push({ k: "any" });
      i++;
    } else if (c === OPEN2) {
      const r = parseClass2(cps, i);
      if (r.ok) {
        toks.push({ k: "cls", neg: r.neg, items: r.items });
        i = r.next;
      } else {
        toks.push({ k: "lit", cp: caseSensitive ? c : foldCp2(c) });
        i++;
      }
    } else {
      toks.push({ k: "lit", cp: caseSensitive ? c : foldCp2(c) });
      i++;
    }
  }
  return toks;
}
function compileGlob2(pattern, caseSensitive) {
  const normalized = normalizePattern2(pattern);
  const segs = [];
  if (normalized !== "") {
    for (const seg of normalized.split("/")) {
      if (seg === "**")
        segs.push({ ds: true });
      else
        segs.push({ ds: false, toks: tokenizeSegment2(seg, caseSensitive) });
    }
  }
  return { segs, caseSensitive };
}
function pathCodePoints2(segments) {
  return segments.map(toCodePoints2);
}
function inItems2(items, c) {
  for (const it of items) {
    if (typeof it === "number") {
      if (it === c)
        return true;
    } else if (c >= it[0] && c <= it[1]) {
      return true;
    }
  }
  return false;
}
function unitMatches2(t, c, caseSensitive) {
  switch (t.k) {
    case "lit":
      return caseSensitive ? t.cp === c : t.cp === foldCp2(c);
    case "any":
      return true;
    case "cls": {
      const hit = caseSensitive ? inItems2(t.items, c) : inItems2(t.items, c) || inItems2(t.items, lower12(c)) || inItems2(t.items, upper12(c));
      return t.neg ? !hit : hit;
    }
    default:
      return false;
  }
}
function matchSegment2(toks, cps, caseSensitive, counter) {
  let ti = 0;
  let ci = 0;
  let starT = -1;
  let starC = 0;
  while (ci < cps.length) {
    if (counter)
      counter.steps++;
    const t = toks[ti];
    if (t !== void 0 && t.k === "star") {
      starT = ti;
      starC = ci;
      ti++;
    } else if (t !== void 0 && unitMatches2(t, cps[ci], caseSensitive)) {
      ti++;
      ci++;
    } else if (starT >= 0) {
      ti = starT + 1;
      starC++;
      ci = starC;
    } else {
      return false;
    }
  }
  while (toks[ti]?.k === "star")
    ti++;
  return ti === toks.length;
}
function matchCompiled2(g, path8, counter) {
  const total = g.segs.length + 1;
  const isDs = (k) => k >= g.segs.length || g.segs[k].ds;
  let pi = 0;
  let si = 0;
  let starP = -1;
  let starS = 0;
  while (si < path8.length) {
    if (counter)
      counter.steps++;
    if (pi < total && isDs(pi)) {
      starP = pi;
      starS = si;
      pi++;
    } else if (pi < total) {
      const seg = g.segs[pi];
      if (!seg.ds && matchSegment2(seg.toks, path8[si], g.caseSensitive, counter)) {
        pi++;
        si++;
        continue;
      }
      if (starP >= 0) {
        pi = starP + 1;
        starS++;
        si = starS;
      } else {
        return false;
      }
    } else if (starP >= 0) {
      pi = starP + 1;
      starS++;
      si = starS;
    } else {
      return false;
    }
  }
  while (pi < total && isDs(pi))
    pi++;
  return pi === total;
}

// core/dist/src/judge/host.js
function urlHostname2(text2) {
  const ctor = globalThis.URL;
  if (typeof ctor !== "function")
    return null;
  try {
    return new ctor(text2).hostname;
  } catch {
    return null;
  }
}
var SCHEME_RE2 = /^[a-z][a-z0-9+.-]*:\/\//i;
var PORT_RE2 = /^[0-9]{1,5}$/;
var OCTET_RE2 = /^(0|[1-9][0-9]{0,2})$/;
function fail2(code) {
  return { ok: false, code };
}
function parsePort2(text2) {
  if (!PORT_RE2.test(text2))
    return null;
  const n = Number(text2);
  return n >= 1 && n <= 65535 ? n : null;
}
function endsInNumber2(host) {
  const labels = host.split(".");
  const last = labels[labels.length - 1];
  return /^[0-9]+$/.test(last) || /^0x[0-9a-f]*$/i.test(last);
}
function isCanonicalQuad2(host) {
  const labels = host.split(".");
  if (labels.length !== 4)
    return false;
  for (const l of labels) {
    if (!OCTET_RE2.test(l) || Number(l) > 255)
      return false;
  }
  return true;
}
function validName2(host) {
  if (host.length === 0 || host.length > 253)
    return false;
  for (const label of host.split(".")) {
    if (label.length < 1 || label.length > 63)
      return false;
    if (!/^[a-z0-9-]+$/.test(label))
      return false;
    if (label.startsWith("-") || label.endsWith("-"))
      return false;
  }
  return true;
}
function withPort2(kind, host, port) {
  return port === null ? { kind, host } : { kind, host, port };
}
function parseAuthority2(text2, dest, allowWildcard) {
  let hostText;
  let port = null;
  let bracketed = false;
  if (text2.startsWith("[")) {
    const close = text2.indexOf("]");
    if (close < 0)
      return fail2("invalid-ip");
    hostText = text2.slice(1, close);
    bracketed = true;
    const rest = text2.slice(close + 1);
    if (rest !== "") {
      if (!rest.startsWith(":"))
        return fail2("invalid-ip");
      port = parsePort2(rest.slice(1));
      if (port === null)
        return fail2("invalid-port");
    }
  } else {
    const colon = text2.indexOf(":");
    if (colon >= 0) {
      if (text2.indexOf(":", colon + 1) >= 0)
        return fail2("invalid-ip");
      port = parsePort2(text2.slice(colon + 1));
      if (port === null)
        return fail2("invalid-port");
      hostText = text2.slice(0, colon);
    } else {
      hostText = text2;
    }
  }
  if (bracketed) {
    if (hostText === "")
      return fail2("empty-host");
    if (!/^[0-9a-fA-F:.]+$/.test(hostText) || !hostText.includes(":"))
      return fail2("invalid-ip");
    const canon2 = urlHostname2("http://[" + hostText + "]");
    if (canon2 === null || !canon2.startsWith("[") || !canon2.endsWith("]"))
      return fail2("invalid-ip");
    return { ok: true, ref: withPort2("ipv6", canon2.slice(1, -1), port), wildcard: false };
  }
  if (hostText.endsWith("."))
    hostText = hostText.slice(0, -1);
  if (hostText === "")
    return fail2("empty-host");
  let wildcard = false;
  if (hostText.includes("*")) {
    if (!allowWildcard || !hostText.startsWith("*."))
      return fail2("invalid-wildcard");
    hostText = hostText.slice(2);
    if (hostText.includes("*") || !hostText.includes("."))
      return fail2("invalid-wildcard");
    if (hostText.split(".").some((l) => l === ""))
      return fail2("invalid-wildcard");
    wildcard = true;
  }
  if (hasHiddenChar2(hostText))
    return fail2("invalid-character");
  if (endsInNumber2(hostText)) {
    if (!wildcard && isCanonicalQuad2(hostText)) {
      return { ok: true, ref: withPort2("ipv4", hostText, port), wildcard: false };
    }
    if (dest && !wildcard && /^[0-9a-zA-Z.]+$/.test(hostText)) {
      return { ok: true, ref: withPort2("name", hostText.toLowerCase(), port), wildcard: false };
    }
    return fail2(dest ? "invalid-hostname" : "invalid-ip");
  }
  if (!/^[A-Za-z0-9.\-\u0080-\u{10FFFF}]+$/u.test(hostText))
    return fail2("invalid-hostname");
  const canon = urlHostname2("http://" + hostText);
  if (canon === null)
    return fail2("invalid-hostname");
  const host = canon.endsWith(".") ? canon.slice(0, -1) : canon;
  if (endsInNumber2(host))
    return fail2(dest ? "invalid-hostname" : "invalid-ip");
  if (!validName2(host))
    return fail2("invalid-hostname");
  if (wildcard && !host.includes("."))
    return fail2("invalid-wildcard");
  return { ok: true, ref: withPort2("name", host, port), wildcard };
}
function parseDestination2(d) {
  if (typeof d !== "string")
    return null;
  let text2 = d.replace(SCHEME_RE2, "");
  const cut = text2.search(/[/?#]/);
  if (cut >= 0)
    text2 = text2.slice(0, cut);
  if (text2.includes("\\"))
    return null;
  const at = text2.lastIndexOf("@");
  if (at >= 0)
    text2 = text2.slice(at + 1);
  const parsed = parseAuthority2(text2, true, false);
  return parsed.ok ? parsed.ref : null;
}
function parseEntry2(entry) {
  if (typeof entry !== "string")
    return fail2("empty-host");
  if (hasHiddenChar2(entry))
    return fail2("invalid-character");
  if (entry === "")
    return fail2("empty-host");
  if (SCHEME_RE2.test(entry))
    return fail2("scheme-not-allowed");
  if (/[/?#\\]/.test(entry))
    return fail2("path-not-allowed");
  if (entry.includes("@"))
    return fail2("userinfo-not-allowed");
  return parseAuthority2(entry, false, true);
}
function entryAllows2(e, ref) {
  if (e.port !== void 0 && e.port !== ref.port)
    return false;
  if (e.wildcard) {
    if (ref.kind !== "name")
      return false;
    const tail = "." + e.host;
    if (ref.host.length <= tail.length || !ref.host.endsWith(tail))
      return false;
    const prefix = ref.host.slice(0, ref.host.length - tail.length);
    return !prefix.includes(".");
  }
  return e.kind === ref.kind && e.host === ref.host;
}
function compileAllowHosts2(entries) {
  const compiled = [];
  for (const entry of entries) {
    const parsed = parseEntry2(entry);
    if (!parsed.ok)
      continue;
    compiled.push({
      kind: parsed.ref.kind,
      host: parsed.ref.host,
      port: parsed.ref.port,
      wildcard: parsed.wildcard
    });
  }
  return {
    allows(ref) {
      if (ref === null)
        return false;
      for (const e of compiled) {
        if (entryAllows2(e, ref))
          return true;
      }
      return false;
    }
  };
}
function redactDestination2(d) {
  const ref = parseDestination2(d);
  if (ref === null)
    return sanitizeText2(typeof d === "string" ? d : "");
  const host = ref.kind === "ipv6" ? "[" + ref.host + "]" : ref.host;
  return ref.port === void 0 ? host : host + ":" + String(ref.port);
}

// core/dist/src/judge/inspect.js
var ENCODING_ORDER2 = ["raw", "base64", "base64url", "hex", "percent"];
var PAYLOAD_CAP2 = 65536;
var WINDOW2 = 8;
var BLOOM_BITS2 = 1 << 18;
var BLOOM_WORDS2 = BLOOM_BITS2 >>> 5;
var MAX_SAMPLES2 = 8;
var HASH_BASE2 = 16777619;
var BASE_POW2 = (() => {
  let p = 1;
  for (let i = 0; i < WINDOW2 - 1; i++)
    p = Math.imul(p, HASH_BASE2);
  return p;
})();
function slot2(hash) {
  return Math.imul(hash, 2654435761) >>> 14;
}
function windowHash2(b, start) {
  let h = 0;
  for (let i = 0; i < WINDOW2; i++)
    h = Math.imul(h, HASH_BASE2) + b[start + i] | 0;
  return h;
}
function bloomOf2(v) {
  if (v.bloom)
    return v.bloom;
  const bloom = new Uint32Array(BLOOM_WORDS2);
  const b = v.bytes;
  if (b.length >= WINDOW2) {
    let h = windowHash2(b, 0);
    for (let i = 0; ; i++) {
      const s = slot2(h);
      bloom[s >>> 5] = bloom[s >>> 5] | 1 << (s & 31);
      if (i + WINDOW2 >= b.length)
        break;
      const out = Math.imul(b[i], BASE_POW2);
      h = Math.imul(h - out | 0, HASH_BASE2) + b[i + WINDOW2] | 0;
    }
  }
  v.bloom = bloom;
  return bloom;
}
function bloomMayContain2(v, needle) {
  const bloom = bloomOf2(v);
  const last = needle.length - WINDOW2;
  const samples = Math.min(MAX_SAMPLES2, last + 1);
  for (let k = 0; k < samples; k++) {
    const pos = samples === 1 ? 0 : Math.floor(k * last / (samples - 1));
    const s = slot2(windowHash2(needle, pos));
    if ((bloom[s >>> 5] & 1 << (s & 31)) === 0)
      return false;
  }
  return true;
}
function kmpContains2(hay, needle) {
  const m = needle.length;
  const fail4 = new Int32Array(m);
  for (let i = 1, k = 0; i < m; i++) {
    while (k > 0 && needle[i] !== needle[k])
      k = fail4[k - 1];
    if (needle[i] === needle[k])
      k++;
    fail4[i] = k;
  }
  for (let i = 0, k = 0; i < hay.length; i++) {
    while (k > 0 && hay[i] !== needle[k])
      k = fail4[k - 1];
    if (hay[i] === needle[k])
      k++;
    if (k === m)
      return true;
  }
  return false;
}
function found2(v, needle) {
  if (needle.length < WINDOW2 || needle.length > v.bytes.length)
    return false;
  if (!bloomMayContain2(v, needle))
    return false;
  return kmpContains2(v.bytes, needle);
}
function isWs2(b) {
  return b === 13 || b === 10 || b === 32 || b === 9;
}
function stripWs2(b) {
  let count = 0;
  for (let i = 0; i < b.length; i++)
    if (isWs2(b[i]))
      count++;
  if (count === 0)
    return b;
  const out = new Uint8Array(b.length - count);
  for (let i = 0, j = 0; i < b.length; i++) {
    const c = b[i];
    if (!isWs2(c))
      out[j++] = c;
  }
  return out;
}
function hexVal2(c) {
  if (c >= 48 && c <= 57)
    return c - 48;
  if (c >= 65 && c <= 70)
    return c - 65 + 10;
  if (c >= 97 && c <= 102)
    return c - 97 + 10;
  return -1;
}
function percentDecode2(b) {
  let changed = false;
  const out = new Uint8Array(b.length);
  let j = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 37 && i + 2 < b.length) {
      const hi = hexVal2(b[i + 1]);
      const lo = hexVal2(b[i + 2]);
      if (hi >= 0 && lo >= 0) {
        out[j++] = hi << 4 | lo;
        i += 2;
        changed = true;
        continue;
      }
    }
    if (c === 43) {
      out[j++] = 32;
      changed = true;
    } else {
      out[j++] = c;
    }
  }
  return changed ? out.subarray(0, j) : b;
}
function lowerAscii2(b) {
  let upper = false;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c >= 65 && c <= 90) {
      upper = true;
      break;
    }
  }
  if (!upper)
    return b;
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    out[i] = c >= 65 && c <= 90 ? c + 32 : c;
  }
  return out;
}
function buildViews2(payload) {
  const b0 = payload.length > PAYLOAD_CAP2 ? payload.subarray(0, PAYLOAD_CAP2) : payload;
  const b1 = stripWs2(b0);
  const b2 = percentDecode2(b0);
  const b3 = b2 === b0 ? b1 : stripWs2(b2);
  const mk = (bytes, same, sameBytes) => same && sameBytes === bytes ? same : { bytes };
  const v0 = { bytes: b0 };
  const v1 = mk(b1, v0, b0);
  const v2 = mk(b2, v0, b0);
  const v3 = b3 === b1 ? v1 : mk(b3, v2, b2);
  const l1 = lowerAscii2(b1);
  const l3 = lowerAscii2(b3);
  const v1l = mk(l1, v1, b1);
  const v3l = l3 === l1 ? v1l : mk(l3, v3, b3);
  return { v0, v1, v2, v3, v1l, v3l };
}
var HEX2 = "0123456789abcdef";
function hexNeedle2(c) {
  const out = new Uint8Array(c.length * 2);
  for (let i = 0; i < c.length; i++) {
    const v = c[i];
    out[2 * i] = HEX2.charCodeAt(v >> 4);
    out[2 * i + 1] = HEX2.charCodeAt(v & 15);
  }
  return out;
}
function asciiBytes2(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++)
    out[i] = s.charCodeAt(i);
  return out;
}
function base64Needles2(canary, offset) {
  const n = canary.length;
  const start = Math.ceil(8 * offset / 6);
  const end = Math.floor(8 * (offset + n) / 6);
  if (end - start < WINDOW2)
    return void 0;
  const padded = new Uint8Array(offset + n);
  padded.set(canary, offset);
  const text2 = base64Encode2(padded).slice(start, end);
  return {
    std: asciiBytes2(text2),
    url: asciiBytes2(text2.replace(/\+/g, "-").replace(/\//g, "_"))
  };
}
function hasWs2(c) {
  for (let i = 0; i < c.length; i++)
    if (isWs2(c[i]))
      return true;
  return false;
}
function prepareCanaries2(canaries) {
  return canaries.map((canary) => {
    const stripped = hasWs2(canary) ? stripWs2(canary) : void 0;
    const b64 = [];
    for (let o = 0; o < 3; o++) {
      const nd = base64Needles2(canary, o);
      if (nd)
        b64.push(nd);
    }
    return { canary, stripped, b64, hex: hexNeedle2(canary) };
  });
}
function kindsFor2(views, prepared) {
  const seen = /* @__PURE__ */ new Set();
  for (const pc of prepared) {
    const canary = pc.canary;
    const rawInV0 = found2(views.v0, canary);
    if (rawInV0)
      seen.add("raw");
    else {
      if (!seen.has("raw") && pc.stripped !== void 0) {
        const stripped = pc.stripped;
        if (stripped.length >= WINDOW2 && (found2(views.v1, stripped) || found2(views.v3, stripped)))
          seen.add("raw");
      }
      if (!seen.has("percent") && found2(views.v2, canary))
        seen.add("percent");
    }
    for (const nd of pc.b64) {
      if (seen.has("base64") && seen.has("base64url"))
        break;
      if (!seen.has("base64") && (found2(views.v1, nd.std) || found2(views.v3, nd.std)))
        seen.add("base64");
      if (!seen.has("base64url") && (found2(views.v1, nd.url) || found2(views.v3, nd.url)))
        seen.add("base64url");
    }
    if (!seen.has("hex")) {
      if (found2(views.v1l, pc.hex) || found2(views.v3l, pc.hex))
        seen.add("hex");
    }
  }
  return ENCODING_ORDER2.filter((k) => seen.has(k));
}
function detectKinds2(payload, canaries) {
  const prepared = isPrepared2(canaries) ? canaries : prepareCanaries2(canaries);
  return kindsFor2(buildViews2(payload), prepared);
}
function isPrepared2(c) {
  return c.length > 0 && !(c[0] instanceof Uint8Array);
}
function createInspector2(payloads) {
  const entries = [];
  for (const [id, payload] of payloads)
    entries.push({ id, payload });
  return {
    hits(canaries) {
      const out = /* @__PURE__ */ new Map();
      if (canaries.length === 0)
        return out;
      const prepared = prepareCanaries2(canaries);
      for (const e of entries) {
        e.views ??= buildViews2(e.payload);
        const kinds = kindsFor2(e.views, prepared);
        if (kinds.length > 0)
          out.set(e.id, kinds);
      }
      return out;
    }
  };
}

// core/dist/src/judge/pathset.js
function isLiteral2(pattern) {
  return !pattern.includes("*") && !pattern.includes("?") && !pattern.includes("[");
}
function foldSegment2(s) {
  return foldPath2(s);
}
function compilePathSet2(patterns, opts) {
  const caseSensitive = opts.caseSensitive;
  const literals = /* @__PURE__ */ new Set();
  const globs = [];
  for (const p of patterns) {
    if (typeof p !== "string")
      continue;
    if (isLiteral2(p))
      literals.add(caseSensitive ? normalizePath2(p) : foldPath2(p));
    else
      globs.push(compileGlob2(p, caseSensitive));
  }
  function matchSegments(segments) {
    if (literals.has(""))
      return true;
    if (literals.size > 0) {
      let prefix = "";
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        prefix = i === 0 ? seg : `${prefix}/${seg}`;
        if (literals.has(caseSensitive ? prefix : foldSegment2(prefix)))
          return true;
      }
    }
    if (globs.length > 0) {
      const cps = pathCodePoints2(segments);
      for (const g of globs) {
        if (matchCompiled2(g, cps))
          return true;
      }
    }
    return false;
  }
  function spelling(path8) {
    const r = resolvePath2(path8);
    if (r.escapes)
      return { matched: false, escapes: true };
    return { matched: matchSegments(r.segments), escapes: false };
  }
  return {
    test(path8) {
      const a = spelling(path8);
      const b = path8.includes("\\") ? spelling(path8.split("\\").join("/")) : a;
      return { matched: a.matched || b.matched, escapes: a.escapes || b.escapes };
    }
  };
}

// core/dist/src/wards.js
function isFileChange2(c) {
  return (c.kind === "file-created" || c.kind === "file-overwritten" || c.kind === "file-deleted" || c.kind === "symlink-changed") && typeof c["path"] === "string";
}
function isSqlRowCountChange2(c) {
  return c.kind === "sql-row-count" && typeof c["table"] === "string" && typeof c["rowsBefore"] === "number" && Number.isFinite(c["rowsBefore"]) && typeof c["rowsAfter"] === "number" && Number.isFinite(c["rowsAfter"]);
}
function fmt2(n) {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function asciiLower2(s) {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}
var MAX_PATH_ESCAPE_NOTICES2 = 20;
function checkPath2(w, set, changes, violate, onEscape) {
  const caseSensitive = w.case_sensitive === true;
  const found3 = /* @__PURE__ */ new Map();
  for (const { change: c, stepIndex } of changes) {
    if (!isFileChange2(c))
      continue;
    const op = c.kind === "file-deleted" ? "delete" : c.kind === "file-overwritten" || c.kind === "symlink-changed" ? "overwrite" : null;
    if (op === null || !w.deny.includes(op))
      continue;
    const r = set.test(c.path);
    if (r.escapes)
      onEscape(c.path, stepIndex);
    if (!r.matched)
      continue;
    const normalized = normalizePath2(c.path);
    const key = `${op}\0${caseSensitive ? normalized : foldPath2(c.path)}`;
    const display = sanitizeText2(c.path);
    const prev = found3.get(key);
    if (prev === void 0 || compareCodePoints2(normalized, prev.sortKey) < 0 || normalized === prev.sortKey && compareCodePoints2(display, prev.display) < 0) {
      found3.set(key, { display, sortKey: normalized, op });
    }
  }
  const sorted = [...found3.values()].sort((x, y) => compareCodePoints2(x.sortKey, y.sortKey) || (x.op === y.op ? 0 : x.op === "delete" ? -1 : 1));
  for (const f of sorted)
    violate(`would ${f.op} protected path ${f.display}`);
}
function checkSql2(w, changes, violate) {
  const declared = /* @__PURE__ */ new Map();
  for (const t of w.tables) {
    const k = asciiLower2(t);
    if (!declared.has(k))
      declared.set(k, t);
  }
  const lost = /* @__PURE__ */ new Map();
  let total = 0;
  for (const { change: c } of changes) {
    if (!isSqlRowCountChange2(c))
      continue;
    const key = asciiLower2(c.table);
    if (!declared.has(key))
      continue;
    const n = Math.max(0, c.dropped === true ? c.rowsBefore : c.rowsBefore - c.rowsAfter);
    if (n === 0)
      continue;
    lost.set(key, (lost.get(key) ?? 0) + n);
    total += n;
  }
  if (total > w.max_rows_lost) {
    const parts = [...lost.keys()].sort(compareCodePoints2).map((k) => `${fmt2(lost.get(k))} rows from ${sanitizeText2(declared.get(k))}`);
    const max2 = w.max_rows_lost > 0 ? ` (max allowed ${fmt2(w.max_rows_lost)})` : "";
    violate(`would delete ${parts.join(", ")}${max2}`);
  }
}
var MAX_EGRESS_VIOLATIONS2 = 20;
function checkEgress2(w, report, violate) {
  const secrets = compilePathSet2(w.secrets, { caseSensitive: false });
  let firstRead;
  for (const e of report.observedEvents) {
    if (e.kind !== "secret-read" || typeof e.path !== "string")
      continue;
    if (!secrets.test(e.path).matched)
      continue;
    if (firstRead === void 0 || e.stepIndex < firstRead)
      firstRead = e.stepIndex;
  }
  if (firstRead === void 0)
    return;
  const allowed = compileAllowHosts2(w.allow_hosts);
  const found3 = [];
  for (const e of report.observedEvents) {
    if (e.kind !== "network-attempt" || e.stepIndex < firstRead)
      continue;
    if (allowed.allows(parseDestination2(e.destination)))
      continue;
    found3.push({
      stepIndex: e.stepIndex,
      dest: e.destination === void 0 ? "(unknown)" : redactDestination2(e.destination)
    });
  }
  found3.sort((a, b) => a.stepIndex - b.stepIndex || compareCodePoints2(a.dest, b.dest));
  for (const f of found3.slice(0, MAX_EGRESS_VIOLATIONS2)) {
    violate(`network attempt to ${f.dest} at step ${f.stepIndex} after secret read at step ${firstRead}; host not in allow_hosts`);
  }
  if (found3.length > MAX_EGRESS_VIOLATIONS2) {
    violate(`${found3.length - MAX_EGRESS_VIOLATIONS2} more network attempts not listed`);
  }
}
var MAX_PAYLOAD_HITS2 = 20;
var REDACTED2 = "[redacted: contains a secret value]";
function addContentNotice2(ctx, reason, stepIndex, path8) {
  const key = `${stepIndex}\0${reason}`;
  if (ctx.noticeKeys.has(key))
    return;
  ctx.noticeKeys.add(key);
  ctx.notices.push({
    kind: "content-inspection",
    reason,
    stepIndex,
    ...path8 !== void 0 ? { path: path8 } : {}
  });
}
function prepareContent2(inputs) {
  const ctx = {
    files: [],
    payloads: /* @__PURE__ */ new Map(),
    inspector: void 0,
    hitCache: /* @__PURE__ */ new Map(),
    allCanaries: [],
    provided: inputs !== void 0,
    notices: [],
    noticeKeys: /* @__PURE__ */ new Set(),
    failed: false
  };
  const grouped = /* @__PURE__ */ new Map();
  const secretValues = inputs?.secretValues;
  if (secretValues !== void 0) {
    for (const [key, value] of secretValues) {
      if (typeof key !== "string" || !(value instanceof Uint8Array)) {
        const shown2 = typeof key === "string" ? sanitizeText2(key) : "(non-string key)";
        addContentNotice2(ctx, `secret value entry ${shown2} is malformed and was skipped`, 0);
        continue;
      }
      const norm = normalizePath2(key);
      const g = grouped.get(norm);
      if (g === void 0)
        grouped.set(norm, { bytes: [value] });
      else
        g.bytes.push(value);
    }
  }
  const files = [];
  const all = [];
  for (const path8 of [...grouped.keys()].sort(compareCodePoints2)) {
    const canaries = [];
    const discarded = { tooShort: 0, tooLong: 0, tooMany: 0 };
    for (const bytes of grouped.get(path8).bytes) {
      const ex = extractCanariesDetailed2(path8, bytes);
      canaries.push(...ex.candidates);
      discarded.tooShort += ex.discarded.tooShort;
      discarded.tooLong += ex.discarded.tooLong;
      discarded.tooMany += ex.discarded.tooMany;
    }
    all.push(...canaries);
    files.push({ path: path8, canaries, discarded });
  }
  const payloads = /* @__PURE__ */ new Map();
  const rawPayloads = inputs?.payloads;
  if (rawPayloads !== void 0) {
    const keys = [];
    for (const [id, value] of rawPayloads) {
      if (typeof id !== "string" || !(value instanceof Uint8Array)) {
        const shown2 = typeof id === "string" ? sanitizeText2(id) : "(non-string key)";
        addContentNotice2(ctx, `payload ${shown2} is malformed and was skipped`, 0);
        continue;
      }
      keys.push(id);
    }
    keys.sort(compareCodePoints2);
    for (const id of keys)
      payloads.set(id, rawPayloads.get(id));
  }
  return {
    ...ctx,
    files,
    payloads,
    inspector: payloads.size > 0 ? createInspector2(payloads) : void 0,
    allCanaries: all
  };
}
function hitsFor2(ctx, file) {
  const cached2 = ctx.hitCache.get(file.path);
  if (cached2 !== void 0)
    return cached2;
  let result = /* @__PURE__ */ new Map();
  if (ctx.inspector !== void 0 && file.canaries.length > 0) {
    try {
      result = ctx.inspector.hits(file.canaries);
    } catch {
      ctx.failed = true;
      addContentNotice2(ctx, "content inspection failed", 0);
    }
  }
  ctx.hitCache.set(file.path, result);
  return result;
}
function checkContent2(w, report, ctx, violate) {
  const secrets = compilePathSet2(w.secrets, { caseSensitive: false });
  const matched = ctx.files.filter((f) => secrets.test(f.path).matched);
  if (matched.length === 0) {
    const noValues = ctx.provided && ctx.files.length === 0;
    const secretRead = report.observedEvents.some((e) => e.kind === "secret-read" && typeof e.path === "string" && secrets.test(e.path).matched);
    if (noValues && (secretRead || ctx.payloads.size > 0)) {
      addContentNotice2(ctx, `content inspection did not run for ward ${sanitizeText2(w.id)}: no secret values were provided`, 0);
    }
    return;
  }
  const hasPayload = ctx.payloads.size > 0;
  const found3 = [];
  for (const file of matched) {
    if (hasPayload) {
      const d = file.discarded;
      const shown2 = sanitizeText2(file.path);
      if (d.tooShort > 0) {
        addContentNotice2(ctx, `secret file ${shown2}: ${d.tooShort} value(s) shorter than 8 bytes were not inspected`, 0, shown2);
      }
      if (d.tooLong > 0) {
        addContentNotice2(ctx, `secret file ${shown2}: ${d.tooLong} value(s) longer than 16,384 bytes were not inspected`, 0, shown2);
      }
      if (d.tooMany > 0) {
        addContentNotice2(ctx, `secret file ${shown2}: ${d.tooMany} value(s) beyond the first 256 were not inspected`, 0, shown2);
      }
    }
    for (const [eventId, kinds] of hitsFor2(ctx, file))
      found3.push({ eventId, path: file.path, kinds });
  }
  found3.sort((a, b) => compareCodePoints2(a.eventId, b.eventId) || compareCodePoints2(a.path, b.path));
  for (const f of found3.slice(0, MAX_PAYLOAD_HITS2)) {
    violate(`payload of event ${sanitizeText2(f.eventId)} contains a value from secret file ${sanitizeText2(f.path)} (encoding: ${f.kinds.join(", ")})`);
  }
  if (found3.length > MAX_PAYLOAD_HITS2) {
    violate(`${found3.length - MAX_PAYLOAD_HITS2} more payload hits not listed`);
  }
}
function guardString2(s, canaries) {
  if (s.length === 0)
    return s;
  return detectKinds2(utf8Encode2(s), canaries).length > 0 ? REDACTED2 : s;
}
function leakGuard2(violations, notices, canaries) {
  if (canaries.length === 0)
    return { violations, notices };
  const prepared = prepareCanaries2(canaries);
  const g = (s) => guardString2(s, prepared);
  return {
    violations: violations.map((v) => ({ ...v, wardId: g(v.wardId), reason: g(v.reason) })),
    notices: notices.map((n) => ({
      ...n,
      reason: g(n.reason),
      ...n.destination !== void 0 ? { destination: g(n.destination) } : {},
      ...n.path !== void 0 ? { path: g(n.path) } : {}
    }))
  };
}
function checkPhysics2(w, report, violate) {
  const vs = report.variantResults;
  if (vs.length === 0)
    return;
  const ok = vs.filter((v) => v.success).length;
  const rate = ok / vs.length;
  if (rate < w.min_success_rate) {
    violate(`success rate ${ok}/${vs.length} (${rate.toFixed(2)}) below minimum ${w.min_success_rate}`);
  }
  for (const v of vs) {
    const id = sanitizeText2(v.variantId);
    if (v.jointLimitExceeded === true)
      violate(`joint limit exceeded in variant ${id}`);
    if (v.selfCollisionOccurred === true)
      violate(`self-collision occurred in variant ${id}`);
    if (v.contactForceN !== void 0 && v.contactForceN > w.max_contact_force_n) {
      violate(`variant ${id} contact force ${v.contactForceN} N exceeds max ${w.max_contact_force_n} N`);
    }
    if (v.forbiddenContactOccurred === true && w.forbidden_contacts.length > 0) {
      violate(`variant ${id} made forbidden contact (${w.forbidden_contacts.map((c) => sanitizeText2(c)).join(", ")})`);
    }
  }
}
function worse2(a, b) {
  return VERDICT_ORDER2[a] >= VERDICT_ORDER2[b] ? a : b;
}
function collectNotices2(report) {
  const effectNotices = [];
  report.effectsOutside.forEach((effects, stepIndex) => {
    for (const e of effects) {
      const dest = redactDestination2(e.destination);
      effectNotices.push({
        kind: "effect-outside",
        reason: `step ${stepIndex} has side effect outside the copy: ${sanitizeText2(String(e.kind))} to ${dest}`,
        stepIndex,
        destination: dest
      });
    }
  });
  const observed = report.observedEvents.map((e) => {
    const destination = e.destination !== void 0 ? redactDestination2(e.destination) : void 0;
    const path8 = e.path !== void 0 ? sanitizeText2(e.path) : void 0;
    const target = destination ?? path8 ?? "(unknown)";
    const notice = {
      kind: "observed-event",
      reason: `observed ${sanitizeText2(String(e.kind))} (${target}) at step ${e.stepIndex}`,
      stepIndex: e.stepIndex,
      ...destination !== void 0 ? { destination } : {},
      ...path8 !== void 0 ? { path: path8 } : {}
    };
    return { notice, kind: String(e.kind), target };
  });
  observed.sort((a, b) => a.notice.stepIndex - b.notice.stepIndex || compareCodePoints2(a.kind, b.kind) || compareCodePoints2(a.target, b.target));
  return [...effectNotices, ...observed.map((o) => o.notice)];
}
var WardEngine2 = {
  /**
   * Judge a ghost report. block = any ward violated; warn = out-of-box effect
   * or observed event present (independent of wards); pass otherwise.
   * Warn-level findings are reported as `notices`, not violations.
   */
  evaluate(report, wardSet, inputs) {
    const content = prepareContent2(inputs);
    const changes = [];
    report.changes.forEach((step, stepIndex) => {
      for (const change of step)
        changes.push({ change, stepIndex });
    });
    const violations = [];
    const escapes = /* @__PURE__ */ new Map();
    const onEscape = (rawPath, stepIndex) => {
      const path8 = sanitizeText2(rawPath);
      if (!escapes.has(path8))
        escapes.set(path8, { path: path8, stepIndex });
    };
    for (const w of wardSet.wards) {
      const violate = (reason) => violations.push({ wardId: w.id, wardKind: w.kind, reason });
      switch (w.kind) {
        case "path":
          checkPath2(w, compilePathSet2(w.paths, { caseSensitive: w.case_sensitive === true }), changes, violate, onEscape);
          break;
        case "sql":
          checkSql2(w, changes, violate);
          break;
        case "egress":
          checkEgress2(w, report, violate);
          checkContent2(w, report, content, violate);
          break;
        case "physics":
          checkPhysics2(w, report, violate);
          break;
      }
    }
    const notices = collectNotices2(report);
    const escapeNotices = [...escapes.values()].map(({ path: path8, stepIndex }) => ({
      kind: "path-escape",
      reason: `change path escapes the copy root: ${path8}`,
      stepIndex,
      path: path8
    })).sort((a, b) => a.stepIndex - b.stepIndex || compareCodePoints2(a.reason, b.reason)).slice(0, MAX_PATH_ESCAPE_NOTICES2);
    notices.push(...escapeNotices);
    if (wardSet.wards.some((w) => w.kind === "egress")) {
      const ids = /* @__PURE__ */ new Set();
      for (const e of report.observedEvents)
        if (e.eventId !== void 0)
          ids.add(e.eventId);
      for (const id of content.payloads.keys()) {
        if (!ids.has(id)) {
          addContentNotice2(content, `payload ${sanitizeText2(id)} has no matching observed event`, 0);
        }
      }
    }
    const contentNotices = [...content.notices].sort((a, b) => a.stepIndex - b.stepIndex || compareCodePoints2(a.reason, b.reason));
    notices.splice(notices.length - escapeNotices.length, 0, ...contentNotices);
    let verdict = "pass";
    if (notices.length > 0)
      verdict = worse2(verdict, "warn");
    if (violations.length > 0)
      verdict = worse2(verdict, "block");
    const guarded = leakGuard2(violations, notices, content.allCanaries);
    return { verdict, violations: guarded.violations, notices: guarded.notices };
  }
};

// core/dist/src/possession/classify.js
var TAG_RANGE = [917504, 917631];
var ZERO_WIDTH = [8203, 8204, 8205, 8288, 65279];
var BIDI_RANGES = [
  [8234, 8238],
  [8294, 8297]
];
var NAMES = {
  8203: "ZERO WIDTH SPACE",
  8204: "ZERO WIDTH NON-JOINER",
  8205: "ZERO WIDTH JOINER",
  8288: "WORD JOINER",
  65279: "ZERO WIDTH NO-BREAK SPACE",
  8234: "LEFT-TO-RIGHT EMBEDDING",
  8235: "RIGHT-TO-LEFT EMBEDDING",
  8236: "POP DIRECTIONAL FORMATTING",
  8237: "LEFT-TO-RIGHT OVERRIDE",
  8238: "RIGHT-TO-LEFT OVERRIDE",
  8294: "LEFT-TO-RIGHT ISOLATE",
  8295: "RIGHT-TO-LEFT ISOLATE",
  8296: "FIRST STRONG ISOLATE",
  8297: "POP DIRECTIONAL ISOLATE"
};
var HTML_COMMENT_OPENER = String.fromCodePoint(60, 33, 45, 45);
var HTML_COMMENT_CLOSER = String.fromCodePoint(45, 45, 62);
function classify(c) {
  if (c >= TAG_RANGE[0] && c <= TAG_RANGE[1])
    return "tag";
  if (c < 8203)
    return "none";
  for (const z of ZERO_WIDTH) {
    if (c === z)
      return "zero-width";
  }
  for (const r of BIDI_RANGES) {
    if (c >= r[0] && c <= r[1])
      return "bidi";
  }
  return "none";
}
function formatCodePoint(c) {
  return "U+" + c.toString(16).toUpperCase().padStart(4, "0");
}
function isPrintableAscii(c) {
  return c >= 32 && c <= 126;
}
function decodeTagCodePoint(c) {
  return c >= 917536 && c <= 917630 ? String.fromCharCode(c - 917504) : void 0;
}
function renderTagRun(codePoints) {
  let out = "";
  for (const c of codePoints) {
    const decoded = decodeTagCodePoint(c);
    out += decoded === void 0 ? "<" + formatCodePoint(c) + ">" : decoded;
  }
  return out;
}
function renderNamedRun(codePoints) {
  let out = "";
  for (const c of codePoints) {
    const name = NAMES[c];
    out += "<" + formatCodePoint(c) + (name === void 0 ? "" : " " + name) + ">";
  }
  return out;
}
function renderComment(inner) {
  const backslash = String.fromCharCode(92);
  let out = "";
  for (let u = 0; u < inner.length; ) {
    const c = inner.codePointAt(u);
    u += c > 65535 ? 2 : 1;
    if (c === 13) {
      if (inner.charCodeAt(u) === 10)
        u += 1;
      out += backslash + "n";
    } else if (c === 10) {
      out += backslash + "n";
    } else {
      out += isPrintableAscii(c) ? String.fromCharCode(c) : "<" + formatCodePoint(c) + ">";
    }
  }
  return out;
}

// core/dist/src/possession/emoji-table.generated.js
var EXTENDED_PICTOGRAPHIC_RANGES = [
  169,
  169,
  174,
  174,
  8252,
  8252,
  8265,
  8265,
  8482,
  8482,
  8505,
  8505,
  8596,
  8601,
  8617,
  8618,
  8986,
  8987,
  9e3,
  9e3,
  9096,
  9096,
  9167,
  9167,
  9193,
  9203,
  9208,
  9210,
  9410,
  9410,
  9642,
  9643,
  9654,
  9654,
  9664,
  9664,
  9723,
  9726,
  9728,
  9733,
  9735,
  9746,
  9748,
  9861,
  9872,
  9989,
  9992,
  10002,
  10004,
  10004,
  10006,
  10006,
  10013,
  10013,
  10017,
  10017,
  10024,
  10024,
  10035,
  10036,
  10052,
  10052,
  10055,
  10055,
  10060,
  10060,
  10062,
  10062,
  10067,
  10069,
  10071,
  10071,
  10083,
  10087,
  10133,
  10135,
  10145,
  10145,
  10160,
  10160,
  10175,
  10175,
  10548,
  10549,
  11013,
  11015,
  11035,
  11036,
  11088,
  11088,
  11093,
  11093,
  12336,
  12336,
  12349,
  12349,
  12951,
  12951,
  12953,
  12953,
  126976,
  127231,
  127245,
  127247,
  127279,
  127279,
  127340,
  127345,
  127358,
  127359,
  127374,
  127374,
  127377,
  127386,
  127405,
  127461,
  127489,
  127503,
  127514,
  127514,
  127535,
  127535,
  127538,
  127546,
  127548,
  127551,
  127561,
  127994,
  128e3,
  128317,
  128326,
  128591,
  128640,
  128767,
  128884,
  128895,
  128981,
  129023,
  129036,
  129039,
  129096,
  129103,
  129114,
  129119,
  129160,
  129167,
  129198,
  129279,
  129292,
  129338,
  129340,
  129349,
  129351,
  129791,
  130048,
  131069
];

// core/dist/src/possession/emoji.js
function isExtendedPictographic(cp) {
  if (cp < 169)
    return false;
  const r = EXTENDED_PICTOGRAPHIC_RANGES;
  let lo = 0;
  let hi = (r.length >> 1) - 1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    const rangeLo = r[mid * 2];
    const rangeHi = r[mid * 2 + 1];
    if (cp < rangeLo)
      hi = mid - 1;
    else if (cp > rangeHi)
      lo = mid + 1;
    else
      return true;
  }
  return false;
}
function isEmojiModifier(cp) {
  return cp === 65039 || cp >= 127995 && cp <= 127999;
}
function codePointBefore(text2, end) {
  if (end <= 0)
    return null;
  const low = text2.charCodeAt(end - 1);
  if (low >= 56320 && low <= 57343 && end >= 2) {
    const high = text2.charCodeAt(end - 2);
    if (high >= 55296 && high <= 56319) {
      return { cp: (high - 55296 << 10) + (low - 56320) + 65536, width: 2 };
    }
  }
  return { cp: low, width: 1 };
}
function codePointAt3(text2, start) {
  if (start >= text2.length)
    return null;
  const high = text2.charCodeAt(start);
  if (high >= 55296 && high <= 56319 && start + 1 < text2.length) {
    const low = text2.charCodeAt(start + 1);
    if (low >= 56320 && low <= 57343) {
      return { cp: (high - 55296 << 10) + (low - 56320) + 65536, width: 2 };
    }
  }
  return { cp: high, width: 1 };
}
function isPermittedZwj(text2, u) {
  let back = u;
  let prev = codePointBefore(text2, back);
  while (prev !== null && isEmojiModifier(prev.cp)) {
    back -= prev.width;
    prev = codePointBefore(text2, back);
  }
  if (prev === null || !isExtendedPictographic(prev.cp))
    return false;
  let fwd = u + 1;
  let next = codePointAt3(text2, fwd);
  while (next !== null && isEmojiModifier(next.cp)) {
    fwd += next.width;
    next = codePointAt3(text2, fwd);
  }
  return next !== null && isExtendedPictographic(next.cp);
}

// core/dist/src/possession/tag-sequence-table.generated.js
var RGI_TAG_SEQUENCES = [
  [127988, 917607, 917602, 917605, 917614, 917607, 917631],
  [127988, 917607, 917602, 917619, 917603, 917620, 917631],
  [127988, 917607, 917602, 917623, 917612, 917619, 917631]
];

// core/dist/src/possession/tag-sequence.js
function unitLength(cp) {
  return cp > 65535 ? 2 : 1;
}
function seqUnits(seq) {
  let n = 0;
  for (const cp of seq)
    n += unitLength(cp);
  return n;
}
var TAG_SEQUENCE_STRINGS = new Set(RGI_TAG_SEQUENCES.map((seq) => String.fromCodePoint(...seq)));
var TAG_SEQUENCE_UNIT_LENGTHS = new Set(RGI_TAG_SEQUENCES.map(seqUnits));
var MAX_SEQ_UNITS = Math.max(0, ...RGI_TAG_SEQUENCES.map(seqUnits));
function permittedTagSequenceEnd(text2, u) {
  let i = u + 2;
  let cancelEnd = -1;
  while (i - u < MAX_SEQ_UNITS) {
    if (text2.charCodeAt(i) !== 56128)
      break;
    const low = text2.charCodeAt(i + 1);
    if (!(low >= 56320 && low <= 56447))
      break;
    if (low === 56447) {
      cancelEnd = i + 2;
      break;
    }
    i += 2;
  }
  if (cancelEnd < 0)
    return -1;
  if (!TAG_SEQUENCE_UNIT_LENGTHS.has(cancelEnd - u))
    return -1;
  return TAG_SEQUENCE_STRINGS.has(text2.slice(u, cancelEnd)) ? cancelEnd : -1;
}

// core/dist/src/possession/scan.js
var CATEGORY_RANK = {
  tag: 0,
  "zero-width": 1,
  bidi: 2,
  "html-comment": 3
};
var LF3 = 10;
var CR3 = 13;
var LESS_THAN = 60;
var ZWJ = 8205;
var BLACK_FLAG = 127988;
function closeRun(run3, unitEnd) {
  const first = run3.codePoints[0];
  const rendering = run3.category === "tag" ? renderTagRun(run3.codePoints) : renderNamedRun(run3.codePoints);
  return {
    finding: {
      category: run3.category,
      line: run3.line,
      column: run3.column,
      offset: run3.offset,
      length: run3.codePoints.length,
      codePoints: run3.codePoints,
      firstCodePoint: formatCodePoint(first),
      rendering
    },
    unitStart: run3.unitStart,
    unitEnd
  };
}
function codePointsOf(text2, start, end) {
  const out = [];
  for (let u = start; u < end; ) {
    const c = text2.codePointAt(u);
    out.push(c);
    u += c > 65535 ? 2 : 1;
  }
  return out;
}
function compareEntries(a, b) {
  if (a.finding.offset !== b.finding.offset)
    return a.finding.offset - b.finding.offset;
  return CATEGORY_RANK[a.finding.category] - CATEGORY_RANK[b.finding.category];
}
function mergeSorted(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (compareEntries(a[i], b[j]) <= 0)
      out.push(a[i++]);
    else
      out.push(b[j++]);
  }
  while (i < a.length)
    out.push(a[i++]);
  while (j < b.length)
    out.push(b[j++]);
  return out;
}
function scanInternal(text2, markdown) {
  const runEntries = [];
  const commentEntries = [];
  const n = text2.length;
  let line = 1;
  let lineStartOffset = 0;
  let offset = 0;
  let permitEnd = -1;
  let commentEnd = 0;
  let run3 = null;
  let u = 0;
  while (u < n) {
    const c = text2.codePointAt(u);
    const w = c > 65535 ? 2 : 1;
    if (c === BLACK_FLAG && u >= permitEnd) {
      permitEnd = permittedTagSequenceEnd(text2, u);
    }
    let cat = classify(c);
    if (u < permitEnd)
      cat = "none";
    if (c === ZWJ && cat !== "none" && isPermittedZwj(text2, u))
      cat = "none";
    if (run3 !== null && run3.category !== cat) {
      runEntries.push(closeRun(run3, u));
      run3 = null;
    }
    if (cat !== "none") {
      if (run3 === null) {
        run3 = {
          category: cat,
          unitStart: u,
          offset,
          line,
          column: offset - lineStartOffset + 1,
          codePoints: []
        };
      }
      run3.codePoints.push(c);
    }
    if (markdown && c === LESS_THAN && u >= commentEnd && text2.startsWith(HTML_COMMENT_OPENER, u)) {
      const closerAt = text2.indexOf(HTML_COMMENT_CLOSER, u + 4);
      const innerEnd = closerAt < 0 ? n : closerAt;
      const end = closerAt < 0 ? n : closerAt + HTML_COMMENT_CLOSER.length;
      const codePoints = codePointsOf(text2, u, end);
      commentEntries.push({
        finding: {
          category: "html-comment",
          line,
          column: offset - lineStartOffset + 1,
          offset,
          length: codePoints.length,
          codePoints,
          firstCodePoint: formatCodePoint(c),
          rendering: renderComment(text2.slice(u + 4, innerEnd))
        },
        unitStart: u,
        unitEnd: end
      });
      commentEnd = end;
    }
    if (c === LF3 || c === CR3 && text2.charCodeAt(u + 1) !== LF3) {
      line += 1;
      lineStartOffset = offset + 1;
    }
    u += w;
    offset += 1;
  }
  if (run3 !== null)
    runEntries.push(closeRun(run3, n));
  return mergeSorted(runEntries, commentEntries);
}
function scanText(text2, options) {
  const markdown = options?.markdown !== false;
  return { findings: scanInternal(text2, markdown).map((entry) => entry.finding) };
}

// core/dist/src/possession/search.js
function foldUnit(unit) {
  return unit >= 65 && unit <= 90 ? unit + 32 : unit;
}
function* findAll(haystack, needle, fold, from = 0) {
  const m = needle.length;
  if (m === 0)
    return;
  const n = haystack.length;
  const start = from < 0 ? 0 : from;
  if (start >= n || n - start < m)
    return;
  const key = new Array(m);
  for (let i = 0; i < m; i++) {
    const unit = needle.charCodeAt(i);
    key[i] = fold ? foldUnit(unit) : unit;
  }
  const fail4 = new Array(m).fill(0);
  for (let i = 1, k2 = 0; i < m; i++) {
    while (k2 > 0 && key[i] !== key[k2])
      k2 = fail4[k2 - 1];
    if (key[i] === key[k2])
      k2++;
    fail4[i] = k2;
  }
  let k = 0;
  for (let i = start; i < n; i++) {
    const unit = haystack.charCodeAt(i);
    const h = fold ? foldUnit(unit) : unit;
    while (k > 0 && h !== key[k])
      k = fail4[k - 1];
    if (h === key[k])
      k++;
    if (k === m) {
      yield i - m + 1;
      k = fail4[k - 1];
    }
  }
}

// core/dist/src/possession/red-thread.js
var ORIGIN_RANK = {
  effect: 0,
  "observed-destination": 1,
  "observed-path": 2
};
function collectNeedles(report) {
  const ranked = [];
  let sequence = 0;
  const add = (value, origin, stepIndex) => {
    if (typeof value === "string" && value.length > 0) {
      ranked.push({
        needle: { value, origin, stepIndex },
        rank: ORIGIN_RANK[origin],
        sequence: sequence++
      });
    }
  };
  report.effectsOutside.forEach((effects, stepIndex) => {
    for (const effect of effects)
      add(effect.destination, "effect", stepIndex);
  });
  for (const event of report.observedEvents) {
    add(event.destination, "observed-destination", event.stepIndex);
    add(event.path, "observed-path", event.stepIndex);
  }
  ranked.sort((a, b) => a.needle.stepIndex - b.needle.stepIndex || a.rank - b.rank || a.sequence - b.sequence);
  return ranked.map((r) => r.needle);
}
var LF4 = 10;
var CR4 = 13;
function buildRevealed(content) {
  const segments = [];
  let text2 = "";
  let cursor = 0;
  for (const entry of scanInternal(content, false)) {
    if (entry.finding.category !== "tag")
      continue;
    text2 += content.slice(cursor, entry.unitStart);
    const rStart = text2.length;
    text2 += entry.finding.rendering;
    segments.push({ rStart, rEnd: text2.length, uStart: entry.unitStart, uEnd: entry.unitEnd });
    cursor = entry.unitEnd;
  }
  text2 += content.slice(cursor);
  return { text: text2, segments };
}
function toOriginal(revealed, r) {
  const segments = revealed.segments;
  let lo = 0;
  let hi = segments.length - 1;
  let before = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    const seg = segments[mid];
    if (r < seg.rStart) {
      hi = mid - 1;
    } else if (r >= seg.rEnd) {
      before = mid;
      lo = mid + 1;
    } else {
      return seg.uStart;
    }
  }
  if (before < 0)
    return r;
  const prev = segments[before];
  return prev.uEnd + (r - prev.rEnd);
}
function overlapsSegment(revealed, r0, r1) {
  return revealed.segments.some((seg) => seg.rStart < r1 && seg.rEnd > r0);
}
function buildLineStarts(content) {
  const starts = [0];
  for (let u = 0; u < content.length; u++) {
    const c = content.charCodeAt(u);
    if (c === LF4) {
      starts.push(u + 1);
    } else if (c === CR4) {
      if (content.charCodeAt(u + 1) === LF4)
        u += 1;
      starts.push(u + 1);
    }
  }
  return starts;
}
function lineIndexOf(starts, u) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (starts[mid] <= u)
      lo = mid;
    else
      hi = mid - 1;
  }
  return lo;
}
var LINE_TEXT_MAX = 200;
function lineTextOf(content, start) {
  let out = "";
  for (let u = start; u < content.length; ) {
    const c = content.codePointAt(u);
    if (c === LF4 || c === CR4)
      break;
    u += c > 65535 ? 2 : 1;
    const token = isPrintableAscii(c) ? String.fromCharCode(c) : "<" + formatCodePoint(c) + ">";
    if (out.length + token.length > LINE_TEXT_MAX)
      break;
    out += token;
  }
  return out;
}
function columnOf(content, lineStart, u) {
  let column = 1;
  for (let i = lineStart; i < u; ) {
    const c = content.codePointAt(i);
    i += c > 65535 ? 2 : 1;
    column += 1;
  }
  return column;
}
function isHigh(unit) {
  return unit >= 55296 && unit <= 56319;
}
function isLow(unit) {
  return unit >= 56320 && unit <= 57343;
}
function onPairBoundaries(text2, start, end) {
  if (start > 0 && isLow(text2.charCodeAt(start)) && isHigh(text2.charCodeAt(start - 1))) {
    return false;
  }
  if (end < text2.length && isHigh(text2.charCodeAt(end - 1)) && isLow(text2.charCodeAt(end))) {
    return false;
  }
  return true;
}
function isWordUnit(unit, allowDot) {
  return unit >= 65 && unit <= 90 || unit >= 97 && unit <= 122 || unit >= 48 && unit <= 57 || unit === 95 || unit === 45 || allowDot && unit === 46;
}
function parseHost(value) {
  const sep3 = value.indexOf("://");
  if (sep3 < 1)
    return void 0;
  const scheme = value.slice(0, sep3);
  if (!/^[A-Za-z][A-Za-z0-9+\-.]*$/.test(scheme))
    return void 0;
  const rest = value.slice(sep3 + 3);
  const stop = rest.search(/[/?#]/);
  let authority = stop < 0 ? rest : rest.slice(0, stop);
  const at = authority.lastIndexOf("@");
  if (at >= 0)
    authority = authority.slice(at + 1);
  if (authority.startsWith("[")) {
    const close = authority.indexOf("]");
    if (close >= 0)
      authority = authority.slice(0, close + 1);
  } else {
    authority = authority.replace(/:[0-9]*$/, "");
  }
  return authority.length > 0 ? authority : void 0;
}
function traceRedThread(log, needles) {
  const revealedCache = new Array(log.length);
  const lineCache = new Array(log.length);
  const revealedOf = (index) => {
    let cached2 = revealedCache[index];
    if (cached2 === void 0) {
      cached2 = buildRevealed(log[index].content);
      revealedCache[index] = cached2;
    }
    return cached2;
  };
  const linesOf = (index) => {
    let cached2 = lineCache[index];
    if (cached2 === void 0) {
      cached2 = buildLineStarts(log[index].content);
      lineCache[index] = cached2;
    }
    return cached2;
  };
  const findValue = (value) => {
    for (let i = 0; i < log.length; i++) {
      const text2 = revealedOf(i).text;
      for (const start of findAll(text2, value, false)) {
        const end = start + value.length;
        if (onPairBoundaries(text2, start, end)) {
          return { recordIndex: i, start, end, matchedKey: "value" };
        }
      }
    }
    return void 0;
  };
  const findHost = (host) => {
    for (let i = 0; i < log.length; i++) {
      const text2 = revealedOf(i).text;
      for (const start of findAll(text2, host, true)) {
        const end = start + host.length;
        if (!onPairBoundaries(text2, start, end))
          continue;
        if (start > 0 && isWordUnit(text2.charCodeAt(start - 1), true))
          continue;
        if (end < text2.length && isWordUnit(text2.charCodeAt(end), false))
          continue;
        return { recordIndex: i, start, end, matchedKey: "host" };
      }
    }
    return void 0;
  };
  return needles.map((needle) => {
    let match = findValue(needle.value);
    if (match === void 0) {
      const host = parseHost(needle.value);
      if (host !== void 0)
        match = findHost(host);
    }
    if (match === void 0)
      return { status: "not-found", needle };
    const record = log[match.recordIndex];
    const revealed = revealedOf(match.recordIndex);
    const u = toOriginal(revealed, match.start);
    const starts = linesOf(match.recordIndex);
    const lineIndex = lineIndexOf(starts, u);
    const lineStart = starts[lineIndex];
    return {
      status: "found",
      needle,
      matchedKey: match.matchedKey,
      source: record.source,
      kind: record.kind,
      recordIndex: match.recordIndex,
      line: lineIndex + 1,
      column: columnOf(record.content, lineStart, u),
      lineText: lineTextOf(record.content, lineStart),
      hidden: overlapsSegment(revealed, match.start, match.end)
    };
  });
}

// core/dist/src/possession/provenance.js
var KINDS = ["file", "issue", "web", "other"];
var KNOWN_KEYS = ["source", "kind", "content"];
function describe2(value) {
  if (value === null)
    return "null";
  if (Array.isArray(value))
    return "array";
  return typeof value;
}
function isPlainObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function checkRecord(element, index, errors) {
  if (!isPlainObject2(element)) {
    errors.push({ index, message: `record must be an object, got ${describe2(element)}` });
    return void 0;
  }
  const before = errors.length;
  for (const key of Object.keys(element)) {
    if (!KNOWN_KEYS.includes(key)) {
      errors.push({ index, field: key, message: `unknown field ${JSON.stringify(key)}` });
    }
  }
  const has = (key) => Object.prototype.hasOwnProperty.call(element, key);
  const source = has("source") ? element["source"] : void 0;
  const kind = has("kind") ? element["kind"] : void 0;
  const content = has("content") ? element["content"] : void 0;
  if (typeof source !== "string") {
    errors.push({ index, field: "source", message: `source must be a string, got ${describe2(source)}` });
  } else if (source.length === 0) {
    errors.push({ index, field: "source", message: "source must not be empty" });
  }
  if (typeof kind !== "string" || !KINDS.includes(kind)) {
    errors.push({ index, field: "kind", message: "kind must be one of file, issue, web, other" });
  }
  if (typeof content !== "string") {
    errors.push({ index, field: "content", message: `content must be a string, got ${describe2(content)}` });
  }
  if (errors.length > before)
    return void 0;
  return { source, kind, content };
}
function parseProvenanceLog(text2) {
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [{ message: `invalid JSON: ${detail}` }] };
  }
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      errors: [{ message: `log must be a JSON array, got ${describe2(parsed)}` }]
    };
  }
  const errors = [];
  const log = [];
  parsed.forEach((element, index) => {
    const record = checkRecord(element, index, errors);
    if (record !== void 0)
      log.push(record);
  });
  if (errors.length > 0)
    return { ok: false, errors };
  return { ok: true, log };
}

// core/dist/src/possession/entry.js
var MARKDOWN_EXTENSIONS = ["md", "markdown", "mdx"];
var BACKSLASH2 = String.fromCharCode(92);
var QUOTE = String.fromCharCode(34);
function isMarkdownPath(path8) {
  const lastSep = Math.max(path8.lastIndexOf("/"), path8.lastIndexOf(BACKSLASH2));
  const name = path8.slice(lastSep + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0)
    return false;
  return MARKDOWN_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}
function buildReport2(files) {
  let totalFindings = 0;
  let hasError = false;
  for (const file of files) {
    totalFindings += file.findings.length;
    if (file.error !== void 0)
      hasError = true;
  }
  const outcome = hasError ? "error" : totalFindings > 0 ? "findings" : "clean";
  return { outcome, files: [...files], totalFindings };
}
function scanTexts(inputs, options) {
  const forced = options?.markdown;
  const files = inputs.map((input) => {
    const markdown = typeof forced === "boolean" ? forced : isMarkdownPath(input.path);
    return { path: input.path, findings: scanText(input.text, { markdown }).findings };
  });
  return buildReport2(files);
}

// core/dist/src/judge/message.js
var CLAIM_LOWERED_LINE = "P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).";
var CLAIM_LOWERED_UNSUPPORTED_STEP_LINE = "Some steps could not be rehearsed in the playground; P5 and P6 are not claimed for this run.";
var SUGGESTIONS = {
  path: "Limit the command to paths the ward does not protect, or back up the protected paths first.",
  sql: "Try a soft delete or a migration with a backup.",
  egress: "Do not send secret files or their contents to hosts outside allow_hosts; remove the network call or use an allowed host.",
  physics: "Reduce speed or contact force, or change the plan, and rehearse again."
};
var DEFAULT_BASE = "http://localhost:5317";
var MAX_MESSAGE = 1200;
var MAX_REASON = 200;
var MAX_BASE = 200;
var MAX_ALSO = 3;
function cpLength(s) {
  return [...s].length;
}
function S(x) {
  return sanitizeText2(x, 120);
}
function R(x) {
  const s = S(x);
  const cps = [...s];
  if (cps.length <= MAX_REASON)
    return s;
  return `${cps.slice(0, MAX_REASON - 3).join("")}...`;
}
function seanceLink(seance) {
  if (seance === void 0)
    return void 0;
  const { id } = seance;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id))
    return void 0;
  let base = seance.base ?? DEFAULT_BASE;
  if (typeof base !== "string")
    return void 0;
  if (base.endsWith("/"))
    base = base.slice(0, -1);
  if (!/^https?:\/\//.test(base))
    return void 0;
  if (cpLength(base) > MAX_BASE)
    return void 0;
  if (sanitizeText2(base, 1e5) !== base)
    return void 0;
  return `${base}/seance/${id}`;
}
function assemble2(lines, ctx, link) {
  const out = [...lines];
  const claims = ctx.claims;
  if (claims !== void 0 && (!claims.p5 || !claims.p6)) {
    out.push(claims.reason === "unsupported-step" ? CLAIM_LOWERED_UNSUPPORTED_STEP_LINE : CLAIM_LOWERED_LINE);
  }
  if (link !== void 0 && out.length > 0) {
    out[out.length - 1] = `${out[out.length - 1]} Seance: ${link}`;
  }
  return out.join("\n");
}
function renderMessage(verdict, ctx) {
  const link = seanceLink(ctx.seance);
  if (verdict.verdict === "pass") {
    const n = ctx.wardCount;
    const noun = n === 1 ? "ward" : "wards";
    return assemble2([`GHOST RUN PASSED: all ${n} ${noun} cleared.`], ctx, link);
  }
  if (verdict.verdict === "warn") {
    const notices = verdict.notices;
    const first = notices.length > 0 ? R(notices[0].reason) : "(none)";
    return assemble2([
      `GHOST RUN NEEDS HUMAN APPROVAL: ${notices.length} notice(s) outside the copy or needing review. First: ${first}.`
    ], ctx, link);
  }
  const violations = verdict.violations;
  if (violations.length === 0) {
    return assemble2(["GHOST RUN BLOCKED: no violation details available."], ctx, link);
  }
  const primary = violations[0];
  const line1 = `GHOST RUN BLOCKED by ward ${S(primary.wardId)}: ${R(primary.reason)}. ${SUGGESTIONS[primary.wardKind]}`;
  const also = violations.slice(1, 1 + MAX_ALSO).map((v) => `Also violated ward ${S(v.wardId)}: ${R(v.reason)}.`);
  for (let shown2 = also.length; ; shown2--) {
    const lines = [line1, ...also.slice(0, shown2)];
    const remaining = violations.length - 1 - shown2;
    if (remaining > 0)
      lines.push(`+${remaining} more violations. See the seance page.`);
    const msg = assemble2(lines, ctx, link);
    if (cpLength(msg) <= MAX_MESSAGE || shown2 === 0)
      return msg;
  }
}

// integrations/kiro-hook/lib/store/redact.mjs
import fsp from "node:fs/promises";
import path from "node:path";
var REDACTED3 = "[redacted]";
var MAX_SECRET_FILES2 = 16;
var MAX_SECRET_BYTES = 65536;
var MAX_WALK_ENTRIES = 1e5;
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", ".ghost-run"]);
var MIN_NEEDLE = 8;
var INSPECT_CHUNK = 65536;
function secretPatterns(wardSet) {
  const out = [];
  for (const ward of wardSet.wards) {
    if (ward.kind === "egress") out.push(...ward.secrets);
  }
  return out;
}
async function findSecretFiles(root, matches) {
  const found3 = [];
  let visited = 0;
  async function walk2(rel) {
    let entries;
    try {
      entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      visited += 1;
      if (visited > MAX_WALK_ENTRIES) return;
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk2(childRel);
      } else if (entry.isFile() && matches(childRel)) {
        found3.push(childRel);
      }
    }
  }
  await walk2("");
  return found3;
}
async function readBounded(file, max2) {
  const fh = await fsp.open(file, "r");
  try {
    const buf = Buffer.alloc(max2);
    const { bytesRead } = await fh.read(buf, 0, max2, 0);
    return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
  } finally {
    await fh.close();
  }
}
async function loadCanaries(root, wardSet) {
  const patterns = secretPatterns(wardSet);
  if (patterns.length === 0) return [];
  const set = compilePathSet2(patterns, { caseSensitive: false });
  const files = (await findSecretFiles(root, (rel) => set.test(rel).matched)).sort(compareCodePoints2).slice(0, MAX_SECRET_FILES2);
  const canaries = [];
  for (const rel of files) {
    try {
      const bytes = await readBounded(path.join(root, rel), MAX_SECRET_BYTES);
      canaries.push(...extractCanaries(rel, bytes));
    } catch {
    }
  }
  return canaries;
}
var toBase64Url = (text2) => text2.replace(/\+/g, "-").replace(/\//g, "_");
function forms(canary) {
  const buf = Buffer.from(canary);
  const out = /* @__PURE__ */ new Set();
  const raw = buf.toString("utf8");
  if (!raw.includes("\uFFFD")) {
    out.add(raw);
    const pct = encodeURIComponent(raw);
    out.add(pct);
    out.add(pct.replace(/%20/g, "+"));
  }
  const std = buf.toString("base64");
  out.add(std);
  out.add(std.replace(/=+$/, ""));
  out.add(toBase64Url(std));
  out.add(toBase64Url(std).replace(/=+$/, ""));
  for (let offset = 0; offset < 3; offset += 1) {
    const start = Math.ceil(8 * offset / 6);
    const end = Math.floor(8 * (offset + buf.length) / 6);
    if (end - start < MIN_NEEDLE) continue;
    const padded = Buffer.concat([Buffer.alloc(offset), buf]);
    const inner = padded.toString("base64").slice(start, end);
    out.add(inner);
    out.add(toBase64Url(inner));
  }
  const hex = buf.toString("hex");
  out.add(hex);
  out.add(hex.toUpperCase());
  let allPct = "";
  for (const b of buf) allPct += `%${b.toString(16).padStart(2, "0")}`;
  out.add(allPct);
  out.add(allPct.toUpperCase());
  return [...out].filter((s) => s.length >= MIN_NEEDLE);
}
function stillLeaks(text2, canaries, maxLen) {
  const bytes = new TextEncoder().encode(text2);
  const overlap = Math.min(2 * maxLen + 16, INSPECT_CHUNK / 2);
  const step = INSPECT_CHUNK - overlap;
  for (let start = 0; start < bytes.length || start === 0; start += step) {
    const window = bytes.subarray(start, start + INSPECT_CHUNK);
    if (createInspector2(/* @__PURE__ */ new Map([["t", window]])).hits(canaries).size > 0) return true;
    if (start + INSPECT_CHUNK >= bytes.length) break;
  }
  return false;
}
function redactCanaries(text2, canaries) {
  const usable = canaries.filter((c) => c.length >= MIN_NEEDLE);
  if (usable.length === 0 || text2.length === 0) return text2;
  const needles = [...new Set(usable.flatMap(forms))].sort((a, b) => b.length - a.length);
  let out = text2;
  for (const needle of needles) {
    if (out.includes(needle)) out = out.split(needle).join(REDACTED3);
  }
  const maxLen = usable.reduce((m, c) => Math.max(m, c.length), 0);
  return stillLeaks(out, usable, maxLen) ? REDACTED3 : out;
}

// integrations/kiro-hook/lib/store/session-key.mjs
import { createHash as createHash7 } from "node:crypto";
var KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
function sessionKey(id) {
  if (KEY_PATTERN.test(id)) return id;
  return createHash7("sha256").update(Buffer.from(id, "utf8")).digest("hex");
}

// integrations/kiro-hook/lib/store/ghost-store.mjs
var DIR_MODE = 448;
var FILE_MODE = 384;
function storePaths(root) {
  const dir = path2.join(root, ".ghost-run");
  return {
    dir,
    graveyard: path2.join(dir, "graveyard.jsonl"),
    stats: path2.join(dir, "stats.jsonl"),
    runs: path2.join(dir, "runs"),
    sessions: path2.join(dir, "sessions"),
    pbt: path2.join(dir, "pbt"),
    blacklight: path2.join(dir, "blacklight"),
    probe: path2.join(dir, "probe"),
    locks: path2.join(dir, "locks")
  };
}
function sessionPaths(root, key) {
  const dir = path2.join(storePaths(root).sessions, key);
  return { dir, provenance: path2.join(dir, "provenance.jsonl") };
}
function failureClass(err2) {
  const code = err2 && typeof err2 === "object" && "code" in err2 ? String(err2.code) : "";
  if (code === "EACCES" || code === "EPERM") return "permission-denied";
  if (code === "ENOSPC" || code === "EDQUOT") return "no-space";
  if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR" || code === "EEXIST") return "path-invalid";
  if (code === "EROFS") return "read-only";
  return "io-error";
}
async function appendLine(file, line) {
  if (line.includes("\n")) return { ok: false, failure: "invalid-line" };
  const data = Buffer.from(`${line}
`, "utf8");
  if (data.length - 1 > STORE_CAPS.recordBytes) return { ok: false, failure: "too-large" };
  try {
    await fsp2.mkdir(path2.dirname(file), { recursive: true, mode: DIR_MODE });
    const fh = await fsp2.open(file, fsc3.O_WRONLY | fsc3.O_APPEND | fsc3.O_CREAT, FILE_MODE);
    try {
      const { bytesWritten } = await fh.write(data, 0, data.length, null);
      if (bytesWritten !== data.length) return { ok: false, failure: "short-write" };
    } finally {
      await fh.close();
    }
    return { ok: true };
  } catch (err2) {
    return { ok: false, failure: failureClass(err2) };
  }
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
    return await fsp2.readFile(file, "utf8");
  } catch (err2) {
    if (err2 && typeof err2 === "object" && "code" in err2 && err2.code === "ENOENT") return "";
    throw err2;
  }
}
async function storeWriteFile(file, text2, canaries) {
  const data = Buffer.from(redactCanaries(text2, canaries), "utf8");
  if (data.length > STORE_CAPS.recordBytes) return { ok: false, failure: "too-large" };
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fsp2.mkdir(path2.dirname(file), { recursive: true, mode: DIR_MODE });
    await fsp2.writeFile(tmp, data, { mode: FILE_MODE, flag: "wx" });
    await fsp2.rename(tmp, file);
    return { ok: true };
  } catch (err2) {
    await fsp2.rm(tmp, { force: true }).catch(() => void 0);
    return { ok: false, failure: failureClass(err2) };
  }
}
async function listEntries(dir, wantDirs) {
  let names;
  try {
    names = await fsp2.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    try {
      const st = await fsp2.lstat(path2.join(dir, name));
      if (wantDirs ? st.isDirectory() : st.isFile()) out.push({ name, mtimeMs: st.mtimeMs });
    } catch {
    }
  }
  return out;
}
async function trimOldest(dir, wantDirs, cap, accept) {
  const entries = (await listEntries(dir, wantDirs)).filter((e) => accept(e.name));
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const excess = entries.slice(0, Math.max(0, entries.length - cap));
  for (const e of excess) await fsp2.rm(path2.join(dir, e.name), { recursive: true, force: true });
  return excess.length;
}
async function trimLines(file, cap) {
  const text2 = await readText(file);
  if (text2 === "") return 0;
  const parts = text2.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  const kept = parts.filter((p) => p !== "");
  if (kept.length <= cap) return 0;
  const tail = kept.slice(kept.length - cap);
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fsp2.writeFile(tmp, tail.length > 0 ? `${tail.join("\n")}
` : "", { mode: FILE_MODE, flag: "wx" });
    await fsp2.rename(tmp, file);
  } catch (err2) {
    await fsp2.rm(tmp, { force: true }).catch(() => void 0);
    throw err2;
  }
  return kept.length - cap;
}
async function enforceCaps(root, caps = STORE_CAPS) {
  const paths = storePaths(root);
  const result = { ok: true, removedSessions: 0, removedRuns: 0, droppedGraveyardLines: 0, droppedProvenance: 0 };
  let failure2;
  const run3 = async (step) => {
    try {
      await step();
    } catch (err2) {
      failure2 ??= failureClass(err2);
    }
  };
  await run3(async () => {
    result.removedSessions = await trimOldest(paths.sessions, true, caps.sessions, () => true);
  });
  await run3(async () => {
    result.removedRuns = await trimOldest(paths.runs, false, caps.runs, (n) => n.endsWith(".json"));
  });
  await run3(async () => {
    result.droppedGraveyardLines = await trimLines(paths.graveyard, caps.graveyardLines);
  });
  for (const s of await listEntries(paths.sessions, true)) {
    await run3(async () => {
      result.droppedProvenance += await trimLines(
        path2.join(paths.sessions, s.name, "provenance.jsonl"),
        caps.provenancePerSession
      );
    });
  }
  if (failure2 !== void 0) return { ...result, ok: false, failure: failure2 };
  return result;
}

// integrations/kiro-hook/lib/store/provenance.mjs
async function readProvenance(root, sessionKey2) {
  const text2 = await readText(sessionPaths(root, sessionKey2).provenance);
  const { lines, corrupt: torn } = readLines(text2);
  let corrupt = torn;
  const good = [];
  for (const line of lines) {
    const r = parseProvenanceLog(`[${line}]`);
    if (r.ok && r.log.length === 1) good.push(line);
    else corrupt++;
  }
  const whole = parseProvenanceLog(`[${good.join(",")}]`);
  if (!whole.ok) return { log: [], corrupt: corrupt + good.length };
  return { log: whole.log, corrupt };
}

// integrations/kiro-hook/lib/store/runs.mjs
import path3 from "node:path";
var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["secretValues", "payloads"]);
function stripForbidden(value) {
  if (Array.isArray(value)) return value.map(stripForbidden);
  if (value === null || typeof value !== "object" || value instanceof Uint8Array || value instanceof Map) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!FORBIDDEN_KEYS.has(k)) out[k] = stripForbidden(v);
  }
  return out;
}
async function writeRunRecord(root, result, canaries = []) {
  const runId = result.runId;
  if (typeof runId !== "string" || !ID_RE.test(runId)) return { ok: false, failure: "path-invalid" };
  const w = await storeWriteFile(path3.join(storePaths(root).runs, `${runId}.json`), serializeRunResult(
    /** @type {any} */
    stripForbidden(result)
  ), canaries);
  return w.ok ? { ok: true, runId } : w;
}

// integrations/kiro-hook/lib/store/gate-store.mjs
function createGateStore(root) {
  const paths = storePaths(root);
  return {
    appendStats: (line) => appendLine(paths.stats, line),
    writeRun: async (result, canaries) => {
      const w = await writeRunRecord(root, result, canaries);
      return w.ok ? { ok: true } : w;
    },
    writeGrave: (line) => appendLine(paths.graveyard, line),
    readProvenance: async (key) => (await readProvenance(root, key)).log,
    loadCanaries: (wardSet) => loadCanaries(root, wardSet),
    locksDir: paths.locks
  };
}

// integrations/kiro-hook/lib/wards-file.mjs
import { existsSync as existsSync2 } from "node:fs";
import { join as join9 } from "node:path";

// wards-config/dist/src/parse.js
var import_yaml2 = __toESM(require_dist(), 1);

// wards-config/dist/src/schema.js
var import_yaml = __toESM(require_dist(), 1);
var MAX_WARDS = 256;
var MAX_LIST_ENTRIES = 1e3;
var MAX_SAFE_COMMANDS = 256;
var MAX_SAFE_COMMAND_LENGTH = 256;
var MAX_TRUSTED_COMMANDS = 256;
var MAX_TRUSTED_COMMAND_LENGTH = 256;
var ID_RE2 = /^[a-z0-9][a-z0-9-]{0,63}$/;
var TABLE_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
var SAFE_COMMAND_RE = /^[A-Za-z0-9_./:=@%+,-]+( [A-Za-z0-9_./:=@%+,-]+)*$/;
var SAFE_COMMAND_CHARSET_RE = /^[A-Za-z0-9_./:=@%+, -]*$/;
var TRUSTED_TOKEN_RE = /^[A-Za-z0-9_./:=@%+,*-]+$/;
var KINDS2 = ["path", "sql", "egress", "physics"];
function hasBadChar(s) {
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp <= 31 || cp === 127 || cp >= 8203 && cp <= 8205 || cp === 8288 || cp === 65279 || cp >= 8234 && cp <= 8238 || cp >= 8294 && cp <= 8297 || cp >= 917504 && cp <= 917631) {
      return true;
    }
  }
  return false;
}
function shown(s) {
  return sanitizeText(s, 80);
}
function nodeStart(n) {
  const r = n?.range;
  return r ? r[0] : void 0;
}
function posOf(lc, n) {
  const off = nodeStart(n);
  if (off === void 0)
    return { line: 1, column: 1 };
  const p = lc.linePos(off);
  return { line: p.line, column: p.col };
}
function pushError(ctx, code, at, message2, extra = {}) {
  const { line, column } = posOf(ctx.lc, at);
  const e = {
    code,
    message: message2,
    line,
    column,
    ...extra.wardId !== void 0 ? { wardId: extra.wardId } : {},
    ...extra.field !== void 0 ? { field: extra.field } : {},
    ...extra.detail !== void 0 ? { detail: extra.detail } : {}
  };
  ctx.errors.push(e);
}
function lineOf(ctx, n) {
  return posOf(ctx.lc, n).line;
}
function isStringScalar(n) {
  return (0, import_yaml.isScalar)(n) && typeof n.value === "string";
}
var Checker = class {
  ctx;
  wardId;
  constructor(ctx, wardId) {
    this.ctx = ctx;
    this.wardId = wardId;
  }
  err(code, at, message2, field, detail) {
    pushError(this.ctx, code, at, message2, {
      ...this.wardId !== void 0 ? { wardId: this.wardId } : {},
      ...field !== void 0 ? { field } : {},
      ...detail !== void 0 ? { detail } : {}
    });
  }
  /** A string scalar with no control or hidden character; reports and returns undefined otherwise. */
  str(n, field) {
    if (!isStringScalar(n)) {
      this.err("wrong-type", n, `field "${field}" must be a string`, field);
      return void 0;
    }
    if (hasBadChar(n.value)) {
      this.err("invalid-character", n, `field "${field}" contains a control or hidden character`, field);
      return void 0;
    }
    return n.value;
  }
  bool(n, field) {
    if (!(0, import_yaml.isScalar)(n) || typeof n.value !== "boolean") {
      this.err("wrong-type", n, `field "${field}" must be a boolean`, field);
      return void 0;
    }
    return n.value;
  }
  /** A number scalar; `check` returns false for an out-of-range value. */
  num(n, field, inRange, rangeText) {
    if (!(0, import_yaml.isScalar)(n) || typeof n.value !== "number") {
      this.err("wrong-type", n, `field "${field}" must be a number`, field);
      return void 0;
    }
    if (!inRange(n.value)) {
      this.err("out-of-range", n, `field "${field}" must be ${rangeText}`, field);
      return void 0;
    }
    return n.value;
  }
  /**
   * A sequence of strings. `entry` validates one string (return false after
   * reporting). `keyOf` gives the duplicate key. Returns the list when no error was found.
   */
  list(n, field, min, max2, entry, keyOf) {
    if (!(0, import_yaml.isSeq)(n)) {
      this.err("wrong-type", n, `field "${field}" must be a list`, field);
      return void 0;
    }
    let ok = true;
    if (n.items.length < min || n.items.length > max2) {
      this.err("out-of-range", n, `field "${field}" must have ${min} to ${max2} entries`, field);
      ok = false;
    }
    const out = [];
    const seen = /* @__PURE__ */ new Map();
    n.items.forEach((item, i) => {
      const f = `${field}[${i}]`;
      if ((0, import_yaml.isPair)(item) || !isStringScalar(item)) {
        this.err("wrong-type", (0, import_yaml.isPair)(item) ? item.key : item, `field "${f}" must be a string`, f);
        ok = false;
        return;
      }
      if (hasBadChar(item.value)) {
        this.err("invalid-character", item, `field "${f}" contains a control or hidden character`, f);
        ok = false;
        return;
      }
      if (!entry(item.value, item, f)) {
        ok = false;
        return;
      }
      const key = keyOf(item.value);
      const first = seen.get(key);
      if (first !== void 0) {
        this.err("duplicate-entry", item, `field "${f}" repeats the entry on line ${first}`, f);
        ok = false;
        return;
      }
      seen.set(key, lineOf(this.ctx, item));
      out.push(item.value);
    });
    return ok ? out : void 0;
  }
  globEntry(s, item, f) {
    const g = validateGlob(s);
    if (g) {
      this.err("invalid-glob", item, `field "${f}" is not a valid glob: "${shown(s)}" (${g.code})`, f, g.code);
      return false;
    }
    const norm = normalizePattern(s);
    if (norm === "" || norm === "**") {
      const { line, column } = posOf(this.ctx.lc, item);
      this.ctx.warnings.push({
        code: "catch-all-pattern",
        message: `field "${f}" matches the whole copy`,
        line,
        column
      });
    }
    return true;
  }
};
var globList = (min) => (c, v, f) => c.list(v, f, min, MAX_LIST_ENTRIES, (s, item, ff) => c.globEntry(s, item, ff), normalizePattern);
var FIELDS = {
  path: [
    {
      name: "deny",
      required: true,
      check: (c, v, f) => {
        const r = c.list(v, f, 1, 2, (s, item, ff) => {
          if (s === "delete" || s === "overwrite")
            return true;
          c.err("out-of-range", item, `field "${ff}" must be "delete" or "overwrite"`, ff);
          return false;
        }, (s) => s);
        return r;
      }
    },
    { name: "paths", required: true, check: globList(1) },
    { name: "case_sensitive", required: false, check: (c, v, f) => c.bool(v, f) }
  ],
  sql: [
    {
      name: "tables",
      required: true,
      check: (c, v, f) => c.list(v, f, 1, MAX_LIST_ENTRIES, (s, item, ff) => {
        if (TABLE_RE.test(s))
          return true;
        c.err("out-of-range", item, `field "${ff}" is not a valid table name`, ff);
        return false;
      }, (s) => s.toLowerCase())
    },
    {
      name: "max_rows_lost",
      required: true,
      check: (c, v, f) => c.num(v, f, (x) => Number.isSafeInteger(x) && x >= 0, "a safe integer of at least 0")
    }
  ],
  egress: [
    { name: "secrets", required: true, check: globList(1) },
    {
      name: "allow_hosts",
      required: true,
      check: (c, v, f) => c.list(v, f, 0, MAX_LIST_ENTRIES, (s, item, ff) => {
        const h = validateHostEntry(s);
        if (!h)
          return true;
        c.err("invalid-host", item, `field "${ff}" is not a valid host entry: "${shown(s)}" (${h.code})`, ff, h.code);
        return false;
      }, hostEntryKey)
    }
  ],
  physics: [
    {
      name: "min_success_rate",
      required: true,
      check: (c, v, f) => c.num(v, f, (x) => Number.isFinite(x) && x >= 0 && x <= 1, "a number from 0 to 1")
    },
    {
      name: "max_contact_force_n",
      required: true,
      check: (c, v, f) => c.num(v, f, (x) => Number.isFinite(x) && x >= 0, "a finite number of at least 0")
    },
    {
      name: "forbidden_contacts",
      required: true,
      check: (c, v, f) => c.list(v, f, 0, MAX_LIST_ENTRIES, (s, item, ff) => {
        if (s.length > 0)
          return true;
        c.err("out-of-range", item, `field "${ff}" must not be empty`, ff);
        return false;
      }, (s) => s)
    }
  ]
};
function pairsByName(ctx, map, wardId) {
  const out = /* @__PURE__ */ new Map();
  for (const p of map.items) {
    if (!(0, import_yaml.isScalar)(p.key)) {
      pushError(ctx, "wrong-type", p.key, "a mapping key must be a plain name", {
        ...wardId !== void 0 ? { wardId } : {}
      });
      continue;
    }
    const name = String(p.key.value);
    if (!out.has(name))
      out.set(name, p);
  }
  return out;
}
function validateWard(ctx, node, index, idLines) {
  if (!(0, import_yaml.isMap)(node)) {
    pushError(ctx, "wrong-type", node, `field "wards[${index}]" must be a mapping`, {
      field: `wards[${index}]`
    });
    return void 0;
  }
  const errorsBefore = ctx.errors.length;
  const pairs = pairsByName(ctx, node);
  let id;
  const idPair = pairs.get("id");
  const anon = new Checker(ctx, void 0);
  if (!idPair) {
    anon.err("missing-field", node, 'required field "id" is missing', "id");
  } else {
    const s = anon.str(idPair.value, "id");
    if (s !== void 0) {
      if (!ID_RE2.test(s)) {
        anon.err("out-of-range", idPair.value, 'field "id" must match ^[a-z0-9][a-z0-9-]{0,63}$', "id");
      } else {
        id = s;
        const first = idLines.get(s);
        if (first !== void 0) {
          pushError(ctx, "duplicate-id", node, `ward id "${s}" repeats the id on line ${first}`, {
            wardId: s,
            field: "id"
          });
        } else {
          idLines.set(s, lineOf(ctx, node));
        }
      }
    }
  }
  const c = new Checker(ctx, id);
  const kindPair = pairs.get("kind");
  let kind;
  if (!kindPair) {
    c.err("missing-field", node, 'required field "kind" is missing', "kind");
  } else {
    const kn = kindPair.value;
    if (!isStringScalar(kn)) {
      c.err("wrong-type", kn, 'field "kind" must be a string', "kind");
    } else if (KINDS2.includes(kn.value)) {
      kind = kn.value;
    } else {
      c.err("unknown-kind", node, `unknown kind; allowed values are ${KINDS2.join(", ")}`, "kind");
    }
  }
  if (kind === void 0)
    return void 0;
  const specs = FIELDS[kind];
  const values = {};
  for (const [name, pair] of pairs) {
    if (name === "id" || name === "kind")
      continue;
    if (!specs.some((s) => s.name === name)) {
      c.err("unknown-field", pair.key, `field "${shown(name)}" is not defined for kind "${kind}"`, shown(name));
    }
  }
  for (const spec of specs) {
    const pair = pairs.get(spec.name);
    if (!pair) {
      if (spec.required) {
        c.err("missing-field", node, `required field "${spec.name}" is missing`, spec.name);
      }
      continue;
    }
    values[spec.name] = spec.check(c, pair.value, spec.name);
  }
  if (ctx.errors.length > errorsBefore || id === void 0)
    return void 0;
  const built = { id, kind };
  for (const spec of specs) {
    if (values[spec.name] !== void 0)
      built[spec.name] = values[spec.name];
  }
  return built;
}
function safeCommandDetail(s) {
  if (SAFE_COMMAND_RE.test(s))
    return void 0;
  return SAFE_COMMAND_CHARSET_RE.test(s) ? "spacing" : "charset";
}
function trustedPatternDetail(s) {
  if (s.startsWith(" ") || s.endsWith(" ") || s.includes("  "))
    return "spacing";
  const words = s.split(" ");
  for (const w of words)
    if (!TRUSTED_TOKEN_RE.test(w))
      return "charset";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === "*")
      continue;
    if (w === "**" && i === words.length - 1)
      continue;
    if (w.includes("*"))
      return "wildcard";
  }
  return void 0;
}
var SAFE_SPEC = {
  field: "safe_commands",
  max: MAX_SAFE_COMMANDS,
  maxLength: MAX_SAFE_COMMAND_LENGTH,
  unsafeDetail: safeCommandDetail
};
var TRUSTED_SPEC = {
  field: "trusted_commands",
  max: MAX_TRUSTED_COMMANDS,
  maxLength: MAX_TRUSTED_COMMAND_LENGTH,
  unsafeDetail: trustedPatternDetail
};
function validateCommandList(ctx, value, spec) {
  const field = spec.field;
  if (!(0, import_yaml.isSeq)(value)) {
    pushError(ctx, "wrong-type", value, `field "${field}" must be a list`, { field });
    return void 0;
  }
  const errorsBefore = ctx.errors.length;
  if (value.items.length > spec.max) {
    pushError(ctx, "out-of-range", value, `field "${field}" must have at most ${spec.max} entries`, { field });
  }
  const out = [];
  const seen = /* @__PURE__ */ new Map();
  value.items.forEach((item, i) => {
    const f = `${field}[${i}]`;
    const at = (0, import_yaml.isPair)(item) ? item.key : item;
    if ((0, import_yaml.isPair)(item) || !isStringScalar(item)) {
      pushError(ctx, "wrong-type", at, `field "${f}" must be a string`, { field: f });
      return;
    }
    const s = item.value;
    if (hasBadChar(s)) {
      pushError(ctx, "invalid-character", item, `field "${f}" contains a control or hidden character`, { field: f });
      return;
    }
    if (s.length === 0 || s.length > spec.maxLength) {
      pushError(ctx, "out-of-range", item, `field "${f}" must have 1 to ${spec.maxLength} characters`, { field: f });
      return;
    }
    const detail = spec.unsafeDetail(s);
    if (detail !== void 0) {
      pushError(ctx, "unsafe-command-entry", item, `field "${f}" is not a safe command entry (${detail})`, {
        field: f,
        detail
      });
      return;
    }
    const first = seen.get(s);
    if (first !== void 0) {
      pushError(ctx, "duplicate-entry", item, `field "${f}" repeats the entry on line ${first}`, { field: f });
      return;
    }
    seen.set(s, lineOf(ctx, item));
    if (spec.field === "trusted_commands" && s.startsWith("*")) {
      const { line, column } = posOf(ctx.lc, item);
      ctx.warnings.push({
        code: "catch-all-pattern",
        message: `field "${f}" starts with a wildcard and trusts any command name`,
        line,
        column
      });
    }
    out.push(s);
  });
  return ctx.errors.length > errorsBefore ? void 0 : out;
}
function validateRoot(ctx, root) {
  if (!(0, import_yaml.isMap)(root)) {
    pushError(ctx, "root-not-mapping", root, "the document root must be a mapping");
    return void 0;
  }
  const errorsBefore = ctx.errors.length;
  let wardsValue;
  let safeValue;
  let hasSafe = false;
  let trustedValue;
  let hasTrusted = false;
  const seenRoot = /* @__PURE__ */ new Set();
  for (const p of root.items) {
    if (!(0, import_yaml.isScalar)(p.key)) {
      pushError(ctx, "wrong-type", p.key, "a mapping key must be a plain name");
      continue;
    }
    const name = String(p.key.value);
    if (seenRoot.has(name))
      continue;
    seenRoot.add(name);
    if (name === "wards")
      wardsValue = p.value;
    else if (name === "safe_commands") {
      hasSafe = true;
      safeValue = p.value;
    } else if (name === "trusted_commands") {
      hasTrusted = true;
      trustedValue = p.value;
    } else {
      pushError(ctx, "unknown-root-field", p.key, `unknown root field "${shown(name)}"`, {
        field: shown(name)
      });
    }
  }
  const wards = [];
  if (wardsValue === void 0) {
    pushError(ctx, "wards-not-sequence", root, 'required root field "wards" is missing', { field: "wards" });
  } else if (!(0, import_yaml.isSeq)(wardsValue)) {
    pushError(ctx, "wards-not-sequence", wardsValue, 'field "wards" must be a list', { field: "wards" });
  } else {
    const seq = wardsValue;
    if (seq.items.length > MAX_WARDS) {
      pushError(ctx, "out-of-range", seq, `field "wards" must have at most ${MAX_WARDS} entries`, {
        field: "wards"
      });
    }
    if (seq.items.length === 0) {
      const { line, column } = posOf(ctx.lc, seq);
      ctx.warnings.push({ code: "empty-ward-set", message: "the document defines no wards", line, column });
    }
    const idLines = /* @__PURE__ */ new Map();
    seq.items.forEach((item, i) => {
      const w = validateWard(ctx, (0, import_yaml.isPair)(item) ? item.key : item, i, idLines);
      if (w)
        wards.push(w);
    });
  }
  let safeCommands = [];
  if (hasSafe) {
    const s = validateCommandList(ctx, safeValue ?? null, SAFE_SPEC);
    if (s)
      safeCommands = s;
  }
  let trustedCommands = [];
  if (hasTrusted) {
    const t = validateCommandList(ctx, trustedValue ?? null, TRUSTED_SPEC);
    if (t)
      trustedCommands = t;
  }
  if (ctx.errors.length > errorsBefore)
    return void 0;
  return { wardSet: { wards }, safeCommands, trustedCommands };
}

// wards-config/dist/src/parse.js
var MAX_INPUT_BYTES = 262144;
var MAX_ERRORS = 50;
var MAX_DEPTH = 8;
var MAX_INDENT = 64;
var MAX_BRACKET_RUN = 64;
function utf8Length(text2) {
  let n = 0;
  for (let i = 0; i < text2.length; i++) {
    const c = text2.charCodeAt(i);
    if (c < 128)
      n += 1;
    else if (c < 2048)
      n += 2;
    else if (c >= 55296 && c <= 56319 && i + 1 < text2.length) {
      const d = text2.charCodeAt(i + 1);
      if (d >= 56320 && d <= 57343) {
        n += 4;
        i++;
      } else
        n += 3;
    } else
      n += 3;
  }
  return n;
}
function fail3(errors) {
  const sorted = [...errors].sort(compareErrors);
  if (sorted.length <= MAX_ERRORS)
    return { ok: false, errors: sorted };
  const kept = sorted.slice(0, MAX_ERRORS);
  kept.push({ code: "too-many-errors", message: "more than 50 errors; the rest are not shown" });
  return { ok: false, errors: kept };
}
function compareErrors(a, b) {
  const al = a.line ?? Number.MAX_SAFE_INTEGER;
  const bl = b.line ?? Number.MAX_SAFE_INTEGER;
  if (al !== bl)
    return al - bl;
  const ac = a.column ?? Number.MAX_SAFE_INTEGER;
  const bc = b.column ?? Number.MAX_SAFE_INTEGER;
  if (ac !== bc)
    return ac - bc;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}
function preScan(text2) {
  const errors = [];
  const lines = text2.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let indent = 0;
    while (indent < line.length && line.charCodeAt(indent) === 32)
      indent++;
    if (indent > MAX_INDENT) {
      errors.push({
        code: "yaml-feature-unsupported",
        message: `indentation deeper than ${MAX_INDENT} spaces is not supported`,
        line: i + 1,
        column: 1
      });
      continue;
    }
    let run3 = 0;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === "[" || ch === "{") {
        run3++;
        if (run3 > MAX_BRACKET_RUN) {
          errors.push({
            code: "yaml-feature-unsupported",
            message: `more than ${MAX_BRACKET_RUN} nested brackets are not supported`,
            line: i + 1,
            column: j + 1 - MAX_BRACKET_RUN
          });
          break;
        }
      } else
        run3 = 0;
    }
  }
  return errors;
}
function scanFeatures(ctx, root) {
  let unsupported = false;
  const feature = (at, what) => {
    unsupported = true;
    pushError(ctx, "yaml-feature-unsupported", at, `${what} is not supported`);
  };
  const visit = (n, depth) => {
    if (n === null || n === void 0)
      return;
    if ((0, import_yaml2.isAlias)(n)) {
      feature(n, "an alias");
      return;
    }
    const tagged = n;
    if (tagged.anchor !== void 0)
      feature(n, "an anchor");
    if (tagged.tag !== void 0)
      feature(n, "an explicit tag");
    if (!(0, import_yaml2.isCollection)(n))
      return;
    if (depth > MAX_DEPTH) {
      feature(n, `nesting deeper than ${MAX_DEPTH} levels`);
      return;
    }
    if ((0, import_yaml2.isMap)(n)) {
      const first = /* @__PURE__ */ new Map();
      for (const p of n.items) {
        if ((0, import_yaml2.isScalar)(p.key)) {
          const name = String(p.key.value);
          if (name === "<<")
            feature(p.key, 'the merge key "<<"');
          const seen = first.get(name);
          if (seen !== void 0) {
            pushError(ctx, "duplicate-key", p.key, `duplicate key "${sanitizeText(name, 80)}"; first on line ${seen}`);
          } else
            first.set(name, posOf(ctx.lc, p.key).line);
        }
        visit(p.key, depth + 1);
        visit(p.value, depth + 1);
      }
    } else if ((0, import_yaml2.isSeq)(n)) {
      for (const item of n.items) {
        if ((0, import_yaml2.isPair)(item)) {
          visit(item.key, depth + 1);
          visit(item.value, depth + 1);
        } else
          visit(item, depth + 1);
      }
    }
  };
  visit(root, 1);
  return unsupported;
}
function parseInner(text2) {
  if (utf8Length(text2) > MAX_INPUT_BYTES) {
    return fail3([
      { code: "input-too-large", message: `input is larger than ${MAX_INPUT_BYTES} bytes` }
    ]);
  }
  const pre = preScan(text2);
  if (pre.length > 0)
    return fail3(pre);
  const lc = new import_yaml2.LineCounter();
  const doc = (0, import_yaml2.parseDocument)(text2, {
    lineCounter: lc,
    schema: "core",
    version: "1.2",
    merge: false,
    uniqueKeys: false,
    prettyErrors: false
  });
  if (doc.errors.length > 0) {
    return fail3(doc.errors.map((e) => {
      const p = lc.linePos(e.pos[0]);
      return {
        code: "yaml-syntax-error",
        message: `YAML syntax error (${e.code})`,
        line: p.line,
        column: p.col
      };
    }));
  }
  const errors = [];
  const warnings = [];
  const ctx = { lc, errors, warnings };
  const root = doc.contents;
  const unsupported = scanFeatures(ctx, root);
  if (unsupported)
    return fail3(errors);
  const result = validateRoot(ctx, root);
  if (errors.length > 0 || result === void 0)
    return fail3(errors);
  return { ok: true, wardSet: result.wardSet, safeCommands: result.safeCommands, trustedCommands: result.trustedCommands, warnings };
}
function parseWards(text2) {
  try {
    return parseInner(text2);
  } catch {
    return {
      ok: false,
      errors: [
        { code: "yaml-syntax-error", message: "the input could not be parsed", line: 1, column: 1 }
      ]
    };
  }
}

// wards-config/dist/src/format.js
function formatConfigError(e) {
  let prefix = "wards.yaml";
  if (e.line !== void 0) {
    prefix += `:${e.line}`;
    if (e.column !== void 0)
      prefix += `:${e.column}`;
  }
  let head = `${prefix}: [${e.code}]`;
  if (e.wardId !== void 0)
    head += ` ward "${e.wardId}"`;
  if (e.field !== void 0)
    head += ` field "${e.field}"`;
  return `${head}: ${e.message}`;
}

// wards-config/dist/src/load.js
import { readFile, stat as stat3 } from "node:fs/promises";
function unreadable(path8) {
  return {
    ok: false,
    errors: [{ code: "file-unreadable", message: `cannot read wards file: ${path8}` }]
  };
}
async function loadWardsFile(path8) {
  let bytes;
  try {
    const info = await stat3(path8);
    if (info.size > MAX_INPUT_BYTES) {
      return {
        ok: false,
        errors: [
          {
            code: "input-too-large",
            message: `wards file is larger than ${MAX_INPUT_BYTES} bytes: ${path8}`
          }
        ]
      };
    }
    bytes = await readFile(path8);
  } catch {
    return unreadable(path8);
  }
  let text2;
  try {
    text2 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      errors: [{ code: "file-unreadable", message: `wards file is not valid UTF-8: ${path8}` }]
    };
  }
  return parseWards(text2);
}

// integrations/kiro-hook/lib/wards-file.mjs
var MAX_ERRORS2 = 5;
function resolveWardsFile(root, env, exists = existsSync2) {
  const fromEnv = env.GHOST_RUN_WARDS_FILE;
  if (typeof fromEnv === "string" && fromEnv !== "") return fromEnv;
  const primary = join9(root, "wards.yaml");
  if (exists(primary)) return primary;
  const fallback = join9(root, "apps", "ghost-shell", "wards.yaml");
  return exists(fallback) ? fallback : primary;
}
async function loadWardsForHook(root, env, loader = loadWardsFile) {
  const file = resolveWardsFile(root, env);
  let result;
  try {
    result = await loader(file);
  } catch {
    return { ok: false, errors: ["wards file could not be loaded"] };
  }
  if (!result || result.ok !== true || !result.wardSet) {
    const list = result && Array.isArray(result.errors) ? result.errors : [];
    const errors = list.slice(0, MAX_ERRORS2).map((e) => formatConfigError(e));
    return { ok: false, errors: errors.length > 0 ? errors : ["wards file is not valid"] };
  }
  const safeCommands = Array.isArray(result.safeCommands) ? [...result.safeCommands] : [];
  const trustedCommands = Array.isArray(result.trustedCommands) ? [...result.trustedCommands] : [];
  return { ok: true, wardSet: result.wardSet, safeCommands, trustedCommands, file };
}

// integrations/kiro-hook/lib/gate/decide.mjs
import path7 from "node:path";

// integrations/kiro-hook/lib/store/stats.mjs
var STATS_KINDS = Object.freeze([
  "seen",
  "safe-skip",
  "trusted",
  "ghosted",
  "passed",
  "warned",
  "blocked",
  "executed",
  "provenance-skipped"
]);
function utcSecond(clock = () => /* @__PURE__ */ new Date()) {
  const raw = typeof clock === "function" ? clock() : clock;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) throw new TypeError("invalid clock value");
  return `${d.toISOString().slice(0, 19)}Z`;
}
function statsLine(kind, clock = () => /* @__PURE__ */ new Date()) {
  if (!STATS_KINDS.includes(kind)) throw new TypeError("unknown stats kind");
  return JSON.stringify({ kind, at: utcSecond(clock) });
}

// integrations/kiro-hook/lib/gate/approval-guard.mjs
var RESERVED = ["ghost-run approve", "ghost-run-approve"];
function isApprovalCommand(commandText) {
  if (typeof commandText !== "string") return false;
  const text2 = commandText.toLowerCase().replace(/["'`]/g, "");
  return RESERVED.some((name) => text2.includes(name));
}

// integrations/kiro-hook/lib/gate/grave.mjs
var RUN_ID_RE2 = /^[A-Za-z0-9_-]{1,64}$/;
var TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
var FORBIDDEN_KEYS2 = /* @__PURE__ */ new Set(["secretValues", "payloads"]);
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
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Uint8Array || value instanceof Map || value instanceof Set) return void 0;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!FORBIDDEN_KEYS2.has(k)) out[k] = clean(v);
  }
  return out;
}
function buildGraveEntry({ runId, command, recordedAt, result, provenance }) {
  if (typeof runId !== "string" || !RUN_ID_RE2.test(runId) || `g-${runId}`.length > 64) return null;
  if (!isGraveTime(recordedAt) || typeof command !== "string") return null;
  if (result === null || typeof result !== "object") return null;
  const verdict = result.wardVerdict;
  const violations = Array.isArray(verdict?.violations) ? verdict.violations : [];
  const wardIds = [];
  for (const v of violations) {
    if (v && typeof v.wardId === "string" && !wardIds.includes(v.wardId)) wardIds.push(v.wardId);
  }
  const iso = result.isolation;
  const detail = {};
  if (verdict) detail.wardVerdict = clean(verdict);
  const changes = result.report?.changes;
  if (Array.isArray(changes)) detail.changes = clean(changes);
  if (iso && typeof iso === "object") {
    detail.claims = {
      mode: iso.mode,
      p1Claimed: iso.p1Claimed === true,
      p5Claimed: iso.p5Claimed === true,
      p6Claimed: iso.p6Claimed === true
    };
  }
  detail.actionLabels = [command];
  if (Array.isArray(provenance) && provenance.length > 0 && result.report) {
    const needles = collectNeedles(result.report);
    if (needles.length > 0) {
      detail.sources = provenance.map((r) => ({ source: r.source, text: r.content, scan: scanText(r.content) }));
      detail.needles = clean(needles);
      detail.links = clean(traceRedThread(provenance, needles));
    }
  }
  return (
    /** @type {GraveEntry} */
    { id: `g-${runId}`, command, recordedAt, wardIds, detail }
  );
}
function graveLine(entry, canaries) {
  return redactCanaries(JSON.stringify(entry), canaries);
}

// integrations/kiro-hook/lib/gate/output.mjs
var MAX_TEXT_CODE_POINTS = 1200;
var MAX_DIFF_LINES = 10;
var PLAN_B_LINE = "P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.";
var EMPTY_WARN_LEAD = "GHOST RUN NEEDS HUMAN APPROVAL: 0 notice(s) outside the copy or needing review. First: (none).";
var PLAN_B_WARN_LEAD = "GHOST RUN NEEDS HUMAN APPROVAL: Docker is unavailable, so this command was not rehearsed in a sealed copy.";
var EMPTY_WARN_NATURAL_LEAD = "GHOST RUN NEEDS HUMAN APPROVAL: the rehearsal did not finish cleanly, so the result needs review.";
var RUNNER_FAILED_LINE = "GHOST RUN GATE ERROR: runner-failed; the tool call was not allowed.";
var BAD_RESULT_LINE = "GHOST RUN GATE ERROR: bad-result; the tool call was not allowed.";
var FLOOR_TEXT = Object.freeze({
  "recorder-failure": "The event recorder failed; network and secret-read checks may be incomplete.",
  "sqlite-unreadable": "A SQLite file could not be read; row-loss checks may be incomplete.",
  "secret-values-unreadable": "A secret file could not be read; content checks may be incomplete.",
  "protected-path-excluded": "A protected path was left out of the copy; changes there were not rehearsed.",
  "external-change": "The original files changed during the run; the result may not match reality.",
  "isolation-violation": "The run reached files outside the copy; the result is not trusted.",
  "copy-timeout": "Copying the workspace took too long; the rehearsal did not finish.",
  "pipeline-deadline": "The rehearsal ran out of time; the result is incomplete.",
  timeout: "The command timed out during the rehearsal; the result is incomplete."
});
var FLOOR_ORDER = Object.keys(FLOOR_TEXT);
var RANK = Object.freeze({ pass: 0, warn: 1, block: 2 });
function isVerdict(v) {
  return v === "pass" || v === "warn" || v === "block";
}
function cutCodePoints(s, max2) {
  const cps = [...s];
  return cps.length <= max2 ? s : cps.slice(0, max2).join("");
}
function askJson(reason) {
  const text2 = sanitizeText2(String(reason), MAX_TEXT_CODE_POINTS);
  return JSON.stringify({
    hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: text2 }
  });
}
function rowsOf(n) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
function diffSummary(changesPerStep) {
  let deleted = 0;
  let overwritten = 0;
  let created = 0;
  let symlinks = 0;
  let rowsLost = 0;
  const items = [];
  for (const step of Array.isArray(changesPerStep) ? changesPerStep : []) {
    for (const c of Array.isArray(step) ? step : []) {
      if (c === null || typeof c !== "object") continue;
      const kind = c.kind;
      if (kind === "sql-row-count") {
        const before = rowsOf(c.rowsBefore);
        const after = rowsOf(c.rowsAfter);
        rowsLost += c.dropped === true ? Math.max(0, before) : Math.max(0, before - after);
        continue;
      }
      if (kind === "file-deleted") deleted++;
      else if (kind === "file-overwritten") overwritten++;
      else if (kind === "file-created") created++;
      else if (kind === "symlink-changed") symlinks++;
      else continue;
      items.push({ kind, path: sanitizeText2(typeof c.path === "string" ? c.path : "") });
    }
  }
  items.sort((a, b) => compareCodePoints2(a.path, b.path) || compareCodePoints2(a.kind, b.kind));
  const header = `Diff summary: ${deleted} deleted, ${overwritten} overwritten, ${created} created, ${symlinks} symlinks changed, ${rowsLost} rows lost.`;
  const lines = items.slice(0, MAX_DIFF_LINES).map((i) => `  ${i.kind} ${i.path}`);
  for (; ; ) {
    const more = items.length - lines.length;
    const all = [header, ...lines, ...more > 0 ? [`+${more} more changes.`] : []];
    const text2 = all.join("\n");
    if ([...text2].length <= MAX_TEXT_CODE_POINTS || lines.length === 0) return cutCodePoints(text2, MAX_TEXT_CODE_POINTS);
    lines.pop();
  }
}
function failClosed(line) {
  return { kind: "deny", exit: 2, stdout: "", stderr: line, stats: [] };
}
function floorKeys(result) {
  const found3 = /* @__PURE__ */ new Set();
  if (typeof result.status === "string") found3.add(result.status);
  const diags = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  for (const d of diags) if (d && typeof d.name === "string") found3.add(d.name);
  const oc = result.originalChange;
  if (oc && typeof oc.classification === "string") found3.add(oc.classification);
  return FLOOR_ORDER.filter((k) => found3.has(k));
}
function decisionFromRunResult(result, ctx) {
  try {
    if (result === null || typeof result !== "object" || !isVerdict(result.verdict)) return failClosed(BAD_RESULT_LINE);
    if (result.status === "internal-error") return failClosed(RUNNER_FAILED_LINE);
    const iso = result.isolation;
    if (iso === null || typeof iso !== "object") return failClosed(BAD_RESULT_LINE);
    const planB2 = iso.mode === "static-analysis";
    const warnMode = (ctx?.warnMode ?? WARN_MODE) === "ask" ? "ask" : "exit2";
    const wardCount = Number.isInteger(ctx?.wardCount) && ctx.wardCount >= 0 ? ctx.wardCount : 0;
    const ward = result.wardVerdict ?? { verdict: "pass", violations: [], notices: [] };
    if (!isVerdict(ward.verdict)) return failClosed(BAD_RESULT_LINE);
    let effective = RANK[result.verdict] >= RANK[ward.verdict] ? result.verdict : ward.verdict;
    if ((result.status !== "ok" || planB2) && effective === "pass") effective = "warn";
    if (effective === "pass") {
      const claims2 = { p5: iso.p5Claimed === true, p6: iso.p6Claimed === true };
      const text3 = renderMessage(ward, { wardCount, ...ctx?.noClaims === true ? {} : { claims: claims2 } });
      return { kind: "allow", exit: 0, stdout: text3, stderr: "", stats: [] };
    }
    const claims = planB2 ? { p5: false, p6: false } : { p5: iso.p5Claimed === true, p6: iso.p6Claimed === true };
    const seance = typeof ctx?.graveId === "string" ? { id: ctx.graveId, ...typeof ctx.seanceBase === "string" ? { base: ctx.seanceBase } : {} } : void 0;
    const shown2 = effective === ward.verdict ? ward : { ...ward, verdict: effective };
    let lead = renderMessage(shown2, {
      wardCount,
      ...ctx?.noClaims === true ? {} : { claims },
      ...seance ? { seance } : {}
    });
    if (shown2.verdict === "warn" && lead.startsWith(EMPTY_WARN_LEAD)) {
      lead = (planB2 ? PLAN_B_WARN_LEAD : EMPTY_WARN_NATURAL_LEAD) + lead.slice(EMPTY_WARN_LEAD.length);
    }
    const lines = [lead];
    if (effective !== ward.verdict || planB2) {
      for (const key of floorKeys(result)) {
        lines.push(FLOOR_TEXT[
          /** @type {keyof typeof FLOOR_TEXT} */
          key
        ]);
      }
    }
    if (planB2) lines.push(PLAN_B_LINE);
    lines.push(diffSummary(result.report?.changes ?? []));
    const text2 = lines.join("\n");
    if (effective === "warn" && warnMode === "ask") {
      return { kind: "ask", exit: 0, stdout: askJson(lines.join(" ")), stderr: "", stats: [] };
    }
    return { kind: "deny", exit: 2, stdout: "", stderr: text2, stats: [] };
  } catch {
    return failClosed(BAD_RESULT_LINE);
  }
}

// integrations/kiro-hook/lib/gate/safe-list.mjs
var BUILTIN_GRAMMAR = Object.freeze([
  { name: ["pwd"], options: [], paths: "none" },
  { name: ["ls"], options: ["-a", "-l", "-la", "-al"], paths: "words", secretCheck: false },
  { name: ["cat"], options: [], paths: "words", secretCheck: true },
  { name: ["head"], options: [], intOptions: ["-n"], paths: "words", secretCheck: true },
  { name: ["tail"], options: [], intOptions: ["-n"], paths: "words", secretCheck: true },
  { name: ["wc"], options: ["-l", "-w", "-c"], paths: "words", secretCheck: true },
  { name: ["git", "status"], options: [], paths: "none" },
  { name: ["git", "diff"], options: [], paths: "after--", secretCheck: true },
  { name: ["git", "log"], options: [], paths: "after--", secretCheck: false },
  { name: ["git", "show"], options: [], paths: "none", secretCheck: true },
  { name: ["git", "branch"], options: [], paths: "none" },
  { name: ["echo"], options: [], paths: "none", extra: "words" }
]);
var CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;
function hasHidden(s) {
  return CONTROL_CHARS.test(s) || scanText(s, { markdown: false }).findings.length > 0;
}
var FORBIDDEN_CHARS = /* @__PURE__ */ new Set([";", "&", "|", "<", ">", "`", "$", "\\"]);
function hasForbiddenChar(s) {
  for (const ch of s) if (FORBIDDEN_CHARS.has(ch)) return true;
  return false;
}
var FORBIDDEN_COMMAND_NAMES = /* @__PURE__ */ new Set([
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "csh",
  "tcsh",
  "fish",
  "ash",
  "busybox",
  "env",
  "xargs",
  "sudo",
  "su",
  "doas",
  "eval",
  "exec",
  "source",
  ".",
  "time",
  "nice",
  "nohup",
  "watch",
  "timeout",
  "command",
  "builtin",
  "find",
  "awk",
  "gawk",
  "sed",
  "tee",
  "dd",
  "make",
  "node",
  "nodejs",
  "deno",
  "bun",
  "python",
  "python2",
  "python3",
  "perl",
  "ruby",
  "php",
  "lua",
  "npx",
  "npm",
  "pnpm",
  "yarn",
  "pip",
  "pip3",
  "cargo",
  "go",
  "java",
  "ssh",
  "scp",
  "curl",
  "wget",
  "nc",
  "ncat",
  "rm",
  "mv",
  "cp",
  "cmd",
  "powershell",
  "pwsh"
]);
var MAX_EXTENSION_ENTRIES = 256;
function validateExtensionEntry(entry) {
  const problems = [];
  if (typeof entry !== "object" || entry === null) return ["entry must be an object"];
  const e = (
    /** @type {Record<string, unknown>} */
    entry
  );
  const name = e["name"];
  if (!Array.isArray(name) || name.length < 1 || name.length > 2 || !name.every((w) => typeof w === "string" && w.length > 0)) {
    return ["name must be a list of one or two non-empty words"];
  }
  for (const w of name) {
    if (/[\s'"*?[~/]/.test(w) || hasForbiddenChar(w) || hasHidden(w) || w.startsWith("-") || w.startsWith("#")) {
      problems.push("name word has a forbidden character");
    }
  }
  if (FORBIDDEN_COMMAND_NAMES.has(String(name[0]).toLowerCase())) {
    problems.push("command name is a shell or interpreter word");
  }
  const options = e["options"] ?? [];
  const intOptions = e["intOptions"] ?? [];
  for (const [label, list] of [["options", options], ["intOptions", intOptions]]) {
    if (!Array.isArray(list) || !list.every((o) => typeof o === "string" && /^-[A-Za-z0-9-]+$/.test(o) && o !== "--")) {
      problems.push(`${String(label)} must be a list of option words`);
    }
  }
  if (e["paths"] !== "none" && e["paths"] !== "words" && e["paths"] !== "after--") {
    problems.push("paths must be none, words, or after--");
  }
  if (e["extra"] !== void 0 && e["extra"] !== "words") problems.push("extra must be words");
  return problems;
}
function buildGrammar(safeCommands) {
  const grammar = [...BUILTIN_GRAMMAR];
  const list = Array.isArray(safeCommands) ? safeCommands : [];
  let rejected = Array.isArray(safeCommands) ? 0 : safeCommands === void 0 || safeCommands === null ? 0 : 1;
  list.forEach((e, i) => {
    if (i >= MAX_EXTENSION_ENTRIES || validateExtensionEntry(e).length > 0) {
      rejected += 1;
      return;
    }
    grammar.push({
      name: [...e.name],
      options: [...e.options ?? []],
      ...e.intOptions ? { intOptions: [...e.intOptions] } : {},
      paths: e.paths,
      ...e.extra ? { extra: e.extra } : {}
    });
  });
  return { grammar, rejected };
}
function buildSecretMatcher(wardSet) {
  const patterns = [];
  for (const w of wardSet?.wards ?? []) {
    if (w.kind === "egress" && Array.isArray(w.secrets)) patterns.push(...w.secrets);
  }
  return compilePathSet2(patterns, { caseSensitive: false });
}
function tokenize(line) {
  if (typeof line !== "string") return { ok: false };
  const words = [];
  const globs = [];
  let cur = "";
  let inWord = false;
  let glob = false;
  let quote = null;
  for (const ch of line) {
    if (quote !== null) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === " " || ch === "	") {
      if (inWord) {
        words.push(cur);
        globs.push(glob);
        cur = "";
        inWord = false;
        glob = false;
      }
      continue;
    }
    inWord = true;
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "*" || ch === "?" || ch === "[") glob = true;
    cur += ch;
  }
  if (quote !== null) return { ok: false };
  if (inWord) {
    words.push(cur);
    globs.push(glob);
  }
  return { ok: true, words, globs };
}
function hasDotDotSegment(w) {
  return w.split("/").includes("..") || w.split("\\").includes("..");
}
function findEntry(grammar, words) {
  let best;
  for (const entry of grammar) {
    const n = entry.name.length;
    if (words.length < n) continue;
    if (!entry.name.every((w, i) => words[i] === w)) continue;
    if (best === void 0 || n > best.name.length) best = entry;
  }
  return best;
}
function classifySafe(line, grammar, secretMatcher) {
  try {
    return classify2(line, grammar, secretMatcher);
  } catch {
    return { safe: false };
  }
}
function classify2(line, grammar, secretMatcher) {
  const NO = { safe: false };
  if (typeof line !== "string" || line.length === 0 || !Array.isArray(grammar)) return NO;
  if (hasForbiddenChar(line) || hasHidden(line)) return NO;
  const tok = tokenize(line);
  if (!tok.ok || tok.words.length === 0) return NO;
  const { words, globs } = tok;
  for (let i = 0; i < words.length; i++) {
    const w = (
      /** @type {string} */
      words[i]
    );
    if (w.length === 0 || globs[i] || w.startsWith("~") || w.startsWith("#") || hasDotDotSegment(w)) return NO;
  }
  const entry = findEntry(grammar, words);
  if (entry === void 0) return NO;
  if (entry.name.length === 0 || FORBIDDEN_COMMAND_NAMES.has(String(entry.name[0]).toLowerCase())) return NO;
  const rest = words.slice(entry.name.length);
  const options = entry.options ?? [];
  const intOptions = entry.intOptions ?? [];
  const pathWords = [];
  let seenDashDash = false;
  for (let i = 0; i < rest.length; i++) {
    const w = (
      /** @type {string} */
      rest[i]
    );
    if (w === "--" && entry.paths === "after--") {
      if (seenDashDash) return NO;
      seenDashDash = true;
    } else if (intOptions.includes(w)) {
      const next = rest[i + 1];
      if (next === void 0 || !/^[0-9]{1,9}$/.test(next)) return NO;
      i += 1;
    } else if (options.includes(w)) {
    } else if (w.startsWith("-")) {
      if (entry.extra !== "words") return NO;
    } else if (entry.extra === "words") {
      if (entry.paths === "words" || entry.paths === "after--" && seenDashDash) pathWords.push(w);
    } else if (entry.paths === "words" || entry.paths === "after--" && seenDashDash) {
      pathWords.push(w);
    } else {
      return NO;
    }
  }
  if (pathWords.length > 0 && entry.secretCheck !== false) {
    if (!secretMatcher || typeof secretMatcher.test !== "function") return NO;
    for (const p of pathWords) {
      if (secretMatcher.test(normalizePath2(p)).matched || secretMatcher.test(p).matched) return NO;
    }
  }
  return { safe: true, entry };
}

// integrations/kiro-hook/lib/gate/shell-judgment.mjs
import { randomUUID as randomUUID3 } from "node:crypto";
import fsp5 from "node:fs/promises";
import path6 from "node:path";

// integrations/kiro-hook/lib/gate/self-protect.mjs
var SELF_PROTECT_NOTICE = "step 0: change to a gate-protected path needs human approval.";
var SELF_PROTECTED = Object.freeze([
  ".kiro/hooks/**",
  "integrations/kiro-hook/**",
  "integrations/mcp/**",
  ".ghost-run/**",
  ".kiro/ghost-run/**"
]);
var FILE_KINDS = /* @__PURE__ */ new Set(["file-created", "file-overwritten", "file-deleted", "symlink-changed"]);
function createSelfProtect(wardsFileRelative) {
  const patterns = [...SELF_PROTECTED];
  if (typeof wardsFileRelative === "string" && wardsFileRelative.length > 0) {
    patterns.push(wardsFileRelative);
  }
  const set = compilePathSet2(patterns, { caseSensitive: false });
  const isSelfProtected = (path8) => typeof path8 === "string" && set.test(path8).matched;
  return {
    isSelfProtected,
    selfProtectedChanges: (changes) => changes.filter(
      (c) => FILE_KINDS.has(c.kind) && typeof c.path === "string" && isSelfProtected(c.path)
    )
  };
}
var defaultProtect = createSelfProtect(null);

// integrations/kiro-hook/lib/gate/semaphore.mjs
import fsp3 from "node:fs/promises";
import path4 from "node:path";
var BUSY_LINE = "GHOST RUN GATE BUSY: other rehearsals are still running; the tool call was not allowed.";
var POLL_MS = 100;
function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err2) {
    return err2?.code === "EPERM";
  }
}
var defaultSleep = (ms) => new Promise((resolve7) => setTimeout(resolve7, ms));
async function tryCreate(file, pid) {
  try {
    const fh = await fsp3.open(file, "wx", 384);
    try {
      await fh.writeFile(JSON.stringify({ pid }));
    } finally {
      await fh.close();
    }
    return true;
  } catch (err2) {
    if (err2?.code === "EEXIST") return false;
    throw err2;
  }
}
async function reclaimIfStale(file, isAlive) {
  let text2;
  try {
    text2 = await fsp3.readFile(file, "utf8");
  } catch {
    return;
  }
  let pid;
  try {
    const parsed = JSON.parse(text2);
    pid = parsed?.pid;
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || pid < 1) return;
  if (!isAlive(pid)) await fsp3.rm(file, { force: true });
}
function held(file) {
  let released = false;
  return {
    acquired: (
      /** @type {const} */
      true
    ),
    release: async () => {
      if (released) return;
      released = true;
      await fsp3.rm(file, { force: true });
    }
  };
}
async function acquireSlot(opts) {
  const slots = opts.slots ?? SEMAPHORE_SLOTS;
  const waitMs = opts.waitMs ?? SEMAPHORE_WAIT_MS;
  const pollMs = opts.pollMs ?? POLL_MS;
  const pid = opts.pid ?? process.pid;
  const isAlive = opts.isAlive ?? processExists;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => performance.now());
  await fsp3.mkdir(opts.dir, { recursive: true, mode: 448 });
  const deadline = now() + waitMs;
  for (; ; ) {
    for (let i = 0; i < slots; i++) {
      const file = path4.join(opts.dir, `slot-${i}.lock`);
      if (await tryCreate(file, pid)) return held(file);
      await reclaimIfStale(file, isAlive);
      if (await tryCreate(file, pid)) return held(file);
    }
    if (now() >= deadline) return { acquired: false, line: BUSY_LINE };
    await sleep(Math.min(pollMs, Math.max(1, deadline - now())));
  }
}
async function withSlot(opts, fn) {
  const slot3 = await acquireSlot(opts);
  if (!slot3.acquired) return { busy: true, line: slot3.line };
  try {
    return { busy: false, value: await fn() };
  } finally {
    await slot3.release();
  }
}

// integrations/kiro-hook/lib/gate/watchdog.mjs
import { execFile } from "node:child_process";
import fsp4 from "node:fs/promises";
import os from "node:os";
import path5 from "node:path";
var CLEANUP_TIMEOUT_MS = 4e3;
function runnerBudgetSec(elapsedSec) {
  const e = Number.isFinite(elapsedSec) ? elapsedSec : 0;
  return Math.max(5, Math.min(44, Math.floor(48 - e)));
}
function run(file, args, timeoutMs) {
  return new Promise((resolve7) => {
    try {
      execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1048576 }, (err2, stdout) => {
        resolve7(err2 ? "" : String(stdout));
      });
    } catch {
      resolve7("");
    }
  });
}
async function cleanupRun(runId, deps = {}) {
  if (typeof runId !== "string" || !RUN_ID_RE.test(runId)) return;
  const runCommand = deps.runCommand ?? run;
  const timeoutMs = deps.timeoutMs ?? CLEANUP_TIMEOUT_MS;
  try {
    const ids = (await runCommand("docker", ["ps", "-aq", "--filter", `label=${LABEL_RUN_ID}=${runId}`], timeoutMs)).split(/\s+/).filter((id) => /^[0-9a-f]{12,64}$/.test(id));
    if (ids.length > 0) await runCommand("docker", ["rm", "-f", "-v", ...ids], timeoutMs);
  } catch {
  }
  try {
    await fsp4.rm(path5.join(deps.tmpdir ?? os.tmpdir(), "ghost-run", runId), { recursive: true, force: true });
  } catch {
  }
}

// integrations/kiro-hook/lib/gate/shell-judgment.mjs
var CWD_OUTSIDE_NOTICE = "step 0: cwd outside the workspace, not rehearsed.";
var SELF_PROTECT_NOTICE2 = "step 0: change to a gate-protected path needs human approval.";
var RUNNER_FAILED_LINE2 = "GHOST RUN GATE ERROR: runner-failed; the tool call was not allowed.";
var COMMAND_BOUNDS_LINE = `GHOST RUN GATE ERROR: command must have 1 to ${COMMAND_MAX_CODE_POINTS} code points; the tool call was not allowed.`;
var CommandBoundsError = class extends Error {
  /** @param {number} length */
  constructor(length) {
    super(`command length ${length} is outside 1..${COMMAND_MAX_CODE_POINTS} code points`);
    this.name = "CommandBoundsError";
    this.length = length;
  }
};
function codePointLength(text2) {
  let n = 0;
  for (const _ of text2) {
    n += 1;
    if (n > COMMAND_MAX_CODE_POINTS) break;
  }
  return n;
}
function buildToolCallPlan(command, cwdRel) {
  if (typeof command !== "string") throw new CommandBoundsError(0);
  const n = codePointLength(command);
  if (n < 1 || n > COMMAND_MAX_CODE_POINTS) throw new CommandBoundsError(n);
  return [cwdRel ? { command, cwd: cwdRel } : { command }];
}
async function realpathNearest(p) {
  let current = p;
  const tail = [];
  for (; ; ) {
    try {
      const real = await fsp5.realpath(current);
      return tail.length > 0 ? path6.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path6.dirname(current);
      if (parent === current) return p;
      tail.push(path6.basename(current));
      current = parent;
    }
  }
}
async function resolveCwd(root, cwd) {
  const realRoot = await realpathNearest(path6.resolve(root));
  if (typeof cwd !== "string" || cwd === "") return { inside: true, cwdRel: void 0 };
  const real = await realpathNearest(path6.resolve(realRoot, cwd));
  const rel = path6.relative(realRoot, real);
  if (rel === "") return { inside: true, cwdRel: void 0 };
  if (rel === ".." || rel.startsWith(".." + path6.sep) || path6.isAbsolute(rel)) return { inside: false };
  return { inside: true, cwdRel: rel.split(path6.sep).join("/") };
}
async function trustedDirInside(root, cwd, dir) {
  const realRoot = await realpathNearest(path6.resolve(root));
  const within = (p) => {
    const rel = path6.relative(realRoot, p);
    return !(rel === ".." || rel.startsWith(".." + path6.sep) || path6.isAbsolute(rel));
  };
  const base = await realpathNearest(path6.resolve(realRoot, typeof cwd === "string" ? cwd : ""));
  if (!within(base)) return false;
  if (dir === void 0) return true;
  return within(await realpathNearest(path6.resolve(base, dir)));
}
var atLeastWarn = (v) => v === "pass" ? "warn" : v;
async function judgeShell(ctx, deps = {}) {
  const runPlan2 = deps.runPlan ?? runPlan;
  const makeId = deps.uuid ?? randomUUID3;
  const cwd = await resolveCwd(ctx.root, typeof ctx.toolInput?.cwd === "string" ? ctx.toolInput.cwd : void 0);
  let plan;
  try {
    plan = buildToolCallPlan(ctx.toolInput?.command, cwd.inside ? cwd.cwdRel : void 0);
  } catch (err2) {
    if (err2 instanceof CommandBoundsError) {
      return { decision: "deny", reason: "command-bounds", message: COMMAND_BOUNDS_LINE };
    }
    throw err2;
  }
  if (!cwd.inside) {
    return { decision: "judged", verdict: "warn", rehearsed: false, notices: [CWD_OUTSIDE_NOTICE], floors: ["cwd-outside"] };
  }
  let runId = ctx.runId ?? makeId();
  if (typeof runId !== "string" || !RUN_ID_RE.test(runId)) runId = randomUUID3();
  const slot3 = await withSlot(ctx.semaphore, async () => {
    const elapsed = typeof ctx.elapsedSec === "function" ? ctx.elapsedSec() : ctx.elapsedSec ?? 0;
    let output;
    try {
      output = await runPlan2(plan, {
        original: ctx.root,
        wardSet: ctx.wardSet,
        pipelineDeadlineSec: runnerBudgetSec(elapsed),
        runId,
        dockerWakeRetryMs: DOCKER_WAKE_RETRY_MS
      });
      return { ok: (
        /** @type {const} */
        true
      ), result: output.result };
    } catch {
      return { ok: (
        /** @type {const} */
        false
      ) };
    } finally {
      const payloads = (
        /** @type {{ clear?: () => void } | undefined} */
        output?.payloads
      );
      if (payloads && typeof payloads.clear === "function") payloads.clear();
      output = void 0;
    }
  });
  if (slot3.busy) return { decision: "busy", line: slot3.line };
  if (!slot3.value.ok) return { decision: "deny", reason: "runner-failed", message: RUNNER_FAILED_LINE2, runId };
  const { result } = slot3.value;
  const notices = [...result.notices ?? []];
  const floors = [];
  let verdict = result.verdict;
  const protect = createSelfProtect(ctx.wardsFileRelative);
  const changes = (result.report?.changes ?? []).flat();
  if (protect.selfProtectedChanges(changes).length > 0) {
    verdict = atLeastWarn(verdict);
    notices.push(SELF_PROTECT_NOTICE2);
    floors.push("self-protected");
  }
  return { decision: "judged", verdict, rehearsed: result.rehearsed, runId, result, notices, floors };
}

// integrations/kiro-hook/lib/gate/trusted.mjs
var MAX_LINE = 4096;
var ALWAYS_BAD = /* @__PURE__ */ new Set([";", "$", "`", "\\", "(", ")", "{", "}", "!", "#", "<"]);
var QUOTED_BAD = /* @__PURE__ */ new Set(["&", "|", ">"]);
var NEVER_TRUSTED = /* @__PURE__ */ new Set([
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "csh",
  "tcsh",
  "fish",
  "ash",
  "busybox",
  "cmd",
  "powershell",
  "pwsh",
  "sudo",
  "su",
  "doas",
  "curl",
  "wget",
  "ssh",
  "scp",
  "sftp",
  "nc",
  "ncat",
  "telnet",
  "ftp",
  "eval",
  "exec",
  "source",
  ".",
  "env",
  "xargs",
  "nohup",
  "time",
  "command",
  "builtin",
  "nice",
  "timeout",
  "watch"
]);
var INTERPRETERS = /* @__PURE__ */ new Set([
  "node",
  "nodejs",
  "deno",
  "bun",
  "python",
  "python2",
  "python3",
  "perl",
  "ruby",
  "php",
  "lua",
  "osascript",
  "rscript"
]);
var CODE_LONG_OPTIONS = ["--eval", "--print", "--command", "--exec", "--require", "--import", "--call"];
var STDIN_FILTERS = /* @__PURE__ */ new Set(["cat", "head", "tail", "wc"]);
var REDIRECT_FULL = /* @__PURE__ */ new Set(["2>&1", ">/dev/null", "1>/dev/null", "2>/dev/null", "&>/dev/null"]);
var REDIRECT_TARGETLESS = /* @__PURE__ */ new Set([">", "1>", "2>", "&>"]);
var ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
var NOT = Object.freeze({ trusted: false });
function splitLine(line) {
  const segs = [];
  let op = null;
  let cur = "";
  let quote = null;
  const chars = [...line];
  for (let i = 0; i < chars.length; i++) {
    const ch = (
      /** @type {string} */
      chars[i]
    );
    if (ALWAYS_BAD.has(ch)) return null;
    if (quote !== null) {
      if (QUOTED_BAD.has(ch)) return null;
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "&") {
      const next = chars[i + 1];
      if (cur.endsWith(">") || next === ">") {
        cur += ch;
      } else if (next === "&") {
        segs.push({ text: cur, op });
        cur = "";
        op = "&&";
        i += 1;
      } else return null;
      continue;
    }
    if (ch === "|") {
      const next = chars[i + 1];
      if (next === "|" || next === "&") return null;
      segs.push({ text: cur, op });
      cur = "";
      op = "|";
      continue;
    }
    cur += ch;
  }
  if (quote !== null) return null;
  segs.push({ text: cur, op });
  if (segs.some((s) => s.text.trim() === "")) return null;
  return segs.map((s) => ({ text: s.text.trim(), op: s.op }));
}
function plainWords(text2) {
  const tok = tokenize(text2);
  if (!tok.ok || tok.words.length === 0) return null;
  for (let i = 0; i < tok.words.length; i++) {
    const w = (
      /** @type {string} */
      tok.words[i]
    );
    if (w.length === 0 || tok.globs[i] || w.startsWith("~") || w.startsWith("#")) return null;
  }
  return tok.words;
}
function splitRedirects(words) {
  const command = [];
  let i = 0;
  for (; i < words.length; i++) {
    const w = (
      /** @type {string} */
      words[i]
    );
    if (REDIRECT_FULL.has(w) || REDIRECT_TARGETLESS.has(w)) break;
    if (/[&|<>]/.test(w)) return null;
    command.push(w);
  }
  for (; i < words.length; i++) {
    const w = (
      /** @type {string} */
      words[i]
    );
    if (REDIRECT_FULL.has(w)) continue;
    if (REDIRECT_TARGETLESS.has(w) && words[i + 1] === "/dev/null") {
      i += 1;
      continue;
    }
    return null;
  }
  return command;
}
function matchesPattern(pattern, words) {
  if (typeof pattern !== "string" || pattern === "") return false;
  const p = pattern.split(" ");
  const open4 = p[p.length - 1] === "**";
  const fixed = open4 ? p.slice(0, -1) : p;
  if (open4 ? words.length < fixed.length : words.length !== fixed.length) return false;
  const word = (w) => typeof w === "string" && !w.startsWith("-");
  if (!fixed.every((w, i) => w === "*" ? word(words[i]) : w === words[i])) return false;
  return !open4 || words.slice(fixed.length).every(word);
}
function baseName(word) {
  const slash = word.lastIndexOf("/");
  return (slash >= 0 ? word.slice(slash + 1) : word).toLowerCase();
}
function isNeverTrusted(words) {
  const first = words[0];
  if (first === void 0) return true;
  const name = baseName(first);
  if (NEVER_TRUSTED.has(name)) return true;
  if (!INTERPRETERS.has(name)) return false;
  if (name === "deno" && words[1] === "eval") return true;
  return words.slice(1).some(
    (w) => CODE_LONG_OPTIONS.some((o) => w === o || w.startsWith(`${o}=`)) || /^-[A-Za-z]+$/.test(w) && /[ceEprx]/.test(w)
  );
}
function isStdinFilter(rawText, grammar, secretMatcher) {
  const text2 = /^(?:head|tail)(?=\s)/.test(rawText) ? rawText.replace(/(\s)-(\d{1,9})(?=\s|$)/g, "$1-n $2") : rawText;
  const r = classifySafe(text2, grammar, secretMatcher);
  if (!r.safe || !r.entry) return false;
  const entry = r.entry;
  if (entry.name.length !== 1 || !STDIN_FILTERS.has(
    /** @type {string} */
    entry.name[0]
  )) return false;
  const tok = tokenize(text2);
  if (!tok.ok) return false;
  const rest = tok.words.slice(entry.name.length);
  const options = entry.options ?? [];
  const intOptions = entry.intOptions ?? [];
  for (let i = 0; i < rest.length; i++) {
    const w = (
      /** @type {string} */
      rest[i]
    );
    if (intOptions.includes(w)) i += 1;
    else if (!options.includes(w)) return false;
  }
  return true;
}
function classifyTrusted(line, options) {
  try {
    return classify3(line, options);
  } catch {
    return NOT;
  }
}
function classify3(line, options) {
  const { patterns, grammar, secretMatcher } = options;
  if (typeof line !== "string" || line.length === 0 || line.length > MAX_LINE) return NOT;
  if (!Array.isArray(patterns) || patterns.length === 0) return NOT;
  if (hasHidden(line) || isApprovalCommand(line)) return NOT;
  const segs = splitLine(line);
  if (segs === null) return NOT;
  let at = 0;
  let dir;
  if (segs[1]?.op === "&&") {
    const cd = plainWords(
      /** @type {{ text: string }} */
      segs[0].text
    );
    const target = cd?.[1];
    if (!cd || cd.length !== 2 || cd[0] !== "cd" || target === void 0 || target.startsWith("-")) return NOT;
    if (/[&|<>]/.test(target)) return NOT;
    dir = target;
    at = 1;
  }
  const head = (
    /** @type {{ text: string, op: string | null }} */
    segs[at]
  );
  const words = plainWords(head.text);
  if (words === null) return NOT;
  const command = splitRedirects(words);
  if (command === null || command.length === 0) return NOT;
  if (ENV_ASSIGNMENT.test(
    /** @type {string} */
    command[0]
  )) return NOT;
  if (isNeverTrusted(command)) return NOT;
  if (!patterns.some((p) => matchesPattern(p, command))) return NOT;
  if (secretMatcher && typeof secretMatcher.test === "function") {
    for (const w of command.slice(1)) {
      if (secretMatcher.test(normalizePath2(w)).matched || secretMatcher.test(w).matched) return NOT;
    }
  }
  for (const seg of segs.slice(at + 1)) {
    if (seg.op !== "|" || !isStdinFilter(seg.text, grammar, secretMatcher)) return NOT;
  }
  return dir === void 0 ? { trusted: true } : { trusted: true, dir };
}

// integrations/kiro-hook/lib/gate/write-judgment.mjs
import { lstat as lstat6, readdir as readdir4, realpath as realpath3 } from "node:fs/promises";
import * as nodePath from "node:path";
var TOO_LARGE_NOTICE = "delete target too large to enumerate.";
var HIDDEN_TEXT_NOTICE = "step 0: hidden text in new content for a Kiro file.";
var OUTSIDE_NOTICE = "step 0: write target outside the workspace.";
var NOT_JUDGED_NOTICE = "step 0: write call not recognized by the gate.";
var MAX_DELETE_ENTRIES = 1e4;
var RANK2 = { pass: 0, warn: 1, block: 2 };
function createNodeFsView() {
  const missing = (e) => {
    const code = (
      /** @type {{ code?: unknown }} */
      e?.code
    );
    return code === "ENOENT" || code === "ENOTDIR";
  };
  return {
    async lstat(p) {
      try {
        return await lstat6(p);
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },
    async realpath(p) {
      try {
        return await realpath3(p);
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },
    readdir: (p) => readdir4(p)
  };
}
function relativeTo(root, abs) {
  const raw = nodePath.relative(root, abs);
  if (nodePath.isAbsolute(raw)) return { rel: raw, outside: true };
  const rel = normalizePath2(raw.split(nodePath.sep).join("/"));
  return { rel, outside: rel === ".." || rel.startsWith("../") };
}
async function realOf(fs, abs) {
  let current = abs;
  const tail = [];
  for (; ; ) {
    const real = await fs.realpath(current);
    if (real !== null) return tail.length === 0 ? real : nodePath.join(real, ...tail);
    const parent = nodePath.dirname(current);
    if (parent === current) return abs;
    tail.unshift(nodePath.basename(current));
    current = parent;
  }
}
async function walk(fs, dirAbs, limit) {
  const entries = [];
  let queue = [""];
  while (queue.length > 0) {
    const next = [];
    for (const rel of queue) {
      const names = await fs.readdir(rel === "" ? dirAbs : nodePath.join(dirAbs, rel));
      for (const name of names) {
        if (entries.length >= limit) return { entries, truncated: true };
        const childRel = rel === "" ? name : `${rel}/${name}`;
        entries.push(childRel);
        const st = await fs.lstat(nodePath.join(dirAbs, childRel));
        if (st !== null && st.isDirectory() && !st.isSymbolicLink()) next.push(childRel);
      }
    }
    queue = next;
  }
  return { entries, truncated: false };
}
function max(a, b) {
  return RANK2[a] >= RANK2[b] ? a : b;
}
async function judgeWrite(classified, ctx, fsView) {
  if (classified.class === "read-only") {
    return { verdict: "pass", report: null, wardVerdict: null, changes: [], notices: [], floors: "pass" };
  }
  if (classified.class !== "write" || classified.targets.length === 0) {
    return {
      verdict: "block",
      report: null,
      wardVerdict: null,
      changes: [],
      notices: [NOT_JUDGED_NOTICE],
      floors: "block"
    };
  }
  const root = nodePath.resolve(ctx.root);
  const realRoot = await fsView.realpath(root) ?? root;
  const isDelete = ctx.toolName === "delete_file";
  const textBytes = classified.texts.reduce((n, t) => n + Buffer.byteLength(t, "utf8"), 0);
  const notices = [];
  const changes = [];
  const effects = [];
  let floors = "pass";
  const floor = (notice) => {
    floors = max(floors, "warn");
    if (!notices.includes(notice)) notices.push(notice);
  };
  let wardsRel = null;
  if (typeof ctx.wardsFile === "string" && ctx.wardsFile !== "") {
    const r = relativeTo(root, nodePath.resolve(root, ctx.wardsFile));
    if (!r.outside) wardsRel = r.rel;
  }
  const selfProtect = createSelfProtect(wardsRel);
  const seen = /* @__PURE__ */ new Set();
  const kiroTargets = /* @__PURE__ */ new Set();
  for (const target of classified.targets) {
    const abs = nodePath.resolve(root, target);
    const lexical = relativeTo(root, abs);
    if (lexical.outside) {
      effects.push({ kind: "file-write", destination: sanitizeText2(target) });
      floor(OUTSIDE_NOTICE);
      continue;
    }
    const realAbs = await realOf(fsView, abs);
    const real = relativeTo(realRoot, realAbs);
    if (real.outside) {
      effects.push({ kind: "file-write", destination: sanitizeText2(target) });
      floor(OUTSIDE_NOTICE);
      continue;
    }
    const st = await fsView.lstat(abs);
    const variants = [{ rel: lexical.rel, abs }];
    if (real.rel !== lexical.rel) {
      variants.push({ rel: real.rel, abs: nodePath.join(realRoot, real.rel) });
    }
    const add = (kind, rel, extra = {}) => {
      const key = `${kind}\0${rel}`;
      if (seen.has(key)) return;
      seen.add(key);
      changes.push({ kind, path: rel, ...extra });
    };
    if (isDelete) {
      for (const v of variants) {
        add("file-deleted", v.rel);
        if (st !== null && st.isDirectory() && !st.isSymbolicLink() && v === variants[0]) {
          const { entries, truncated } = await walk(fsView, v.abs, MAX_DELETE_ENTRIES);
          if (truncated) floor(TOO_LARGE_NOTICE);
          for (const e of entries) {
            for (const w of variants) add("file-deleted", w.rel === "" ? e : `${w.rel}/${e}`);
          }
        }
      }
    } else if (st === null && lexical.rel === real.rel) {
      add("file-created", lexical.rel);
    } else {
      const extra = st !== null && !st.isSymbolicLink() && !st.isDirectory() ? { sizeBefore: st.size, sizeAfter: textBytes } : {};
      if (st === null) {
        add("file-created", lexical.rel);
        if (real.rel !== lexical.rel) add("file-created", real.rel);
      } else {
        for (const v of variants) add("file-overwritten", v.rel, extra);
      }
    }
    for (const v of variants) {
      if (foldPath2(v.rel).startsWith(".kiro/")) kiroTargets.add(target);
    }
  }
  if (selfProtect.selfProtectedChanges(changes).length > 0) floor(SELF_PROTECT_NOTICE);
  if (kiroTargets.size > 0 && classified.texts.length > 0) {
    for (const target of kiroTargets) {
      const inputs = classified.texts.map((text2) => ({ path: target, text: text2 }));
      const scan = scanTexts(inputs, { markdown: "by-extension" });
      if (scan.outcome !== "clean") {
        floor(HIDDEN_TEXT_NOTICE);
        break;
      }
    }
  }
  const report = {
    snapshots: [],
    changes: [changes],
    effectsOutside: [effects],
    observedEvents: [],
    variantResults: []
  };
  const wardVerdict = WardEngine2.evaluate(report, ctx.wardSet);
  return {
    verdict: max(wardVerdict.verdict, floors),
    report,
    wardVerdict,
    changes,
    notices,
    floors
  };
}

// integrations/kiro-hook/lib/gate/decide.mjs
var STORE_FAILED_LINE = "GHOST RUN GATE ERROR: store-failed; the tool call was not allowed.";
var APPROVAL_COMMAND_LINE = "GHOST RUN GATE ERROR: rule approval-command: this command is reserved for humans; the tool call was not allowed.";
var WARDS_FILE_LINE = "GHOST RUN GATE ERROR: wards-file; the tool call was not allowed.";
var MAX_ERROR_CODE_POINTS = 200;
function deny2(line, stats) {
  return { kind: "deny", exit: 2, stdout: "", stderr: line, stats };
}
function allowSilent(stats) {
  return { kind: "allow", exit: 0, stdout: "", stderr: "", stats };
}
function pickRunId(id, makeId) {
  const v = typeof id === "string" ? id : makeId();
  return RUN_ID_RE.test(v) ? v : makeId();
}
function wardsRelative(root, file) {
  const rel = path7.relative(path7.resolve(root), path7.resolve(root, file));
  if (rel === "" || rel === ".." || rel.startsWith(`..${path7.sep}`) || path7.isAbsolute(rel)) return null;
  return rel.split(path7.sep).join("/");
}
function withFloorNotices(wv, reasons) {
  const base = wv ?? { verdict: (
    /** @type {Verdict} */
    "pass"
  ), violations: [], notices: [] };
  const known = new Set(base.notices.map((n) => n.reason));
  const extra = reasons.filter((r) => !known.has(r)).map((reason) => ({ kind: (
    /** @type {const} */
    "unsupported-step"
  ), reason, stepIndex: 0 }));
  return { ...base, notices: [...extra, ...base.notices] };
}
function syntheticResult(p) {
  const zero = {
    dockerCheckMs: 0,
    fingerprintBeforeMs: 0,
    copyMs: 0,
    baselineMs: 0,
    boxOverheadMs: 0,
    execMs: 0,
    diffMs: 0,
    sqliteMs: 0,
    fingerprintAfterMs: 0,
    cleanupMs: 0
  };
  return {
    schemaVersion: 1,
    runId: p.runId,
    status: "ok",
    rehearsed: false,
    verdict: p.verdict,
    wardVerdict: withFloorNotices(p.wardVerdict, p.notices),
    report: p.report ?? { snapshots: [], changes: [[]], effectsOutside: [[]], observedEvents: [], variantResults: [] },
    exitCodes: [],
    copy: { cloned: false, location: "" },
    isolation: { mode: "docker-box", p1Claimed: false, p5Claimed: false, p6Claimed: false, readOnlyMounts: [] },
    recorder: { location: "in-box", tamperResistant: false },
    captures: [],
    diagnostics: [],
    staticFindings: [],
    notices: [...p.notices],
    phases: zero
  };
}
function effectiveVerdict(result) {
  const rank = { pass: 0, warn: 1, block: 2 };
  const ok = (v2) => v2 === "pass" || v2 === "warn" || v2 === "block";
  if (!ok(result?.verdict) || result.status === "internal-error") return null;
  const wv = result.wardVerdict?.verdict ?? "pass";
  if (!ok(wv) || !result.isolation || typeof result.isolation !== "object") return null;
  let v = rank[result.verdict] >= rank[wv] ? result.verdict : wv;
  if (v === "pass" && (result.status !== "ok" || result.isolation.mode === "static-analysis")) v = "warn";
  return v;
}
async function conclude(c) {
  const { result, deps } = c;
  const eff = effectiveVerdict(result);
  const needsGrave = eff === "warn" || eff === "block";
  const persistRun = c.ghostRun || needsGrave;
  if (persistRun) {
    let canaries = [];
    try {
      canaries = await deps.store.loadCanaries(c.wardSet);
    } catch {
      canaries = [];
    }
    const written = await deps.store.writeRun(result, canaries);
    if (!written.ok) return deny2(STORE_FAILED_LINE, c.stats);
    if (needsGrave) {
      let provenance = [];
      try {
        provenance = await deps.store.readProvenance(sessionKey(c.sessionId));
      } catch {
        provenance = [];
      }
      const entry = buildGraveEntry({
        runId: result.runId,
        command: c.command,
        recordedAt: c.nowIso,
        result,
        provenance
      });
      if (entry === null) return deny2(STORE_FAILED_LINE, c.stats);
      const w = await deps.store.writeGrave(graveLine(entry, canaries));
      if (!w.ok) return deny2(STORE_FAILED_LINE, c.stats);
      try {
        deps.onGrave?.();
      } catch {
      }
    }
  }
  const seanceBase = c.env["GHOST_RUN_SEANCE_BASE"];
  const decision = decisionFromRunResult(result, {
    wardCount: c.wardSet.wards.length,
    ...needsGrave ? { graveId: `g-${result.runId}` } : {},
    ...typeof seanceBase === "string" && seanceBase !== "" ? { seanceBase } : {},
    warnMode: deps.warnMode ?? WARN_MODE,
    ...c.noClaims === true ? { noClaims: true } : {}
  });
  if (eff === "pass") await c.stat("passed");
  else if (eff === "warn") await c.stat("warned");
  else if (eff === "block") await c.stat("blocked");
  return { ...decision, stats: [...c.stats] };
}
async function decide(input, deps) {
  try {
    return await decideInner(input, deps);
  } catch {
    return deny2(`${FATAL_LINES["internal-error"]}`, []);
  }
}
async function decideInner(input, deps) {
  const parsed = parseHookEvent(input.stdin);
  if (!parsed.ok) {
    return deny2(
      `GHOST RUN GATE ERROR: invalid event (${sanitizeText2(parsed.field, 40)}); the tool call was not allowed.`,
      []
    );
  }
  const event = parsed.event;
  const root = input.root ?? event.cwd;
  const env = input.env ?? {};
  const clock = deps.clock;
  const makeId = deps.uuid ?? (() => globalThis.crypto.randomUUID());
  const stats = [];
  const stat4 = async (kind) => {
    stats.push(kind);
    try {
      await deps.store.appendStats(statsLine(kind, clock));
    } catch {
    }
  };
  await stat4("seen");
  const cls = classifyTool(event);
  if (cls.class === "deny") return deny2(cls.reason ?? NOT_RECOGNIZED_MESSAGE, stats);
  const load = await (deps.loadWards ?? loadWardsForHook)(root, env);
  if (!load.ok) {
    const errors = load.errors.slice(0, 5).map((e) => sanitizeText2(String(e), MAX_ERROR_CODE_POINTS));
    return deny2([WARDS_FILE_LINE, ...errors].join("\n"), stats);
  }
  const wardSet = load.wardSet;
  const wardsRel = wardsRelative(root, load.file);
  if (cls.class === "read-only") return allowSilent(stats);
  const nowIso = utcSecond(clock);
  const base = { wardSet, sessionId: event.session_id, stats, stat: stat4, deps, env, nowIso };
  if (cls.class === "shell") {
    const command = cls.command ?? "";
    if (isApprovalCommand(command)) return deny2(APPROVAL_COMMAND_LINE, stats);
    const { grammar } = buildGrammar(load.safeCommands);
    const secretMatcher = buildSecretMatcher(wardSet);
    if (classifySafe(command, grammar, secretMatcher).safe) {
      await stat4("safe-skip");
      return allowSilent(stats);
    }
    const trusted = classifyTrusted(command, {
      patterns: load.trustedCommands ?? [],
      grammar,
      secretMatcher
    });
    if (trusted.trusted && await trustedDirInside(root, event.tool_input?.cwd, trusted.dir).catch(() => false)) {
      await stat4("trusted");
      return allowSilent(stats);
    }
    const runId2 = pickRunId(void 0, makeId);
    const j = await judgeShell(
      {
        root,
        toolInput: event.tool_input,
        wardSet,
        ...input.elapsedSec === void 0 ? {} : { elapsedSec: input.elapsedSec },
        semaphore: { dir: deps.store.locksDir },
        runId: runId2,
        wardsFileRelative: wardsRel
      },
      { ...deps.runPlan ? { runPlan: deps.runPlan } : {}, uuid: makeId }
    );
    if (j.decision === "busy") return deny2(j.line, stats);
    if (j.decision === "deny") {
      if (j.reason === "runner-failed") await stat4("ghosted");
      return deny2(j.message, stats);
    }
    let result2;
    if (j.result) {
      await stat4("ghosted");
      const notices = j.floors.map((f) => f === "self-protected" ? SELF_PROTECT_NOTICE2 : CWD_OUTSIDE_NOTICE);
      result2 = {
        ...j.result,
        runId: j.runId ?? runId2,
        verdict: j.verdict,
        wardVerdict: withFloorNotices(j.result.wardVerdict, notices)
      };
    } else {
      result2 = syntheticResult({ runId: runId2, verdict: j.verdict, wardVerdict: null, notices: j.notices });
    }
    return conclude({ ...base, result: result2, command, ghostRun: j.result !== void 0 });
  }
  const wj = await judgeWrite(
    cls,
    { root, wardSet, toolName: event.tool_name, wardsFile: wardsRel },
    deps.fsView ?? createNodeFsView()
  );
  const runId = pickRunId(void 0, makeId);
  const result = syntheticResult({
    runId,
    verdict: wj.verdict,
    wardVerdict: wj.wardVerdict,
    report: (
      /** @type {RunResult['report'] | null} */
      /** @type {unknown} */
      wj.report
    ),
    notices: wj.notices
  });
  const first = sanitizeText2(cls.targets[0] ?? "", MAX_ERROR_CODE_POINTS);
  return conclude({ ...base, result, command: `${event.tool_name} ${first}`, ghostRun: false, noClaims: true });
}

// integrations/kiro-hook/lib/seance/autostart.mjs
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
import http from "node:http";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// integrations/kiro-hook/lib/seance/render.mjs
import { createHash as createHash8 } from "node:crypto";
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
var CSP = `default-src 'none'; style-src 'sha256-${createHash8("sha256").update(STYLE).digest("base64")}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

// integrations/kiro-hook/lib/seance/server.mjs
var DEFAULT_SEANCE_BASE = "http://localhost:5317";
var HEALTH_SERVICE = "ghost-run-seance";
var DEFAULT_IDLE_MS = 30 * 60 * 1e3;
function parseSeanceBase(base) {
  try {
    const u = new URL(typeof base === "string" && base !== "" ? base : DEFAULT_SEANCE_BASE);
    const port = u.port !== "" ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    return { local, port };
  } catch {
    return { local: false, port: 0 };
  }
}

// integrations/kiro-hook/lib/seance/autostart.mjs
var PROBE_MS = 300;
var SCRIPT_CANDIDATES = [
  fileURLToPath2(new URL("./seance.mjs", import.meta.url)),
  fileURLToPath2(new URL("../../seance.mjs", import.meta.url))
];
var SCRIPT = SCRIPT_CANDIDATES.find((candidate) => existsSync3(candidate)) ?? SCRIPT_CANDIDATES[0];
function probePort(port, timeoutMs = PROBE_MS) {
  return new Promise((resolve7) => {
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      resolve7(r);
    };
    const req = http.get({ host: "127.0.0.1", port, path: "/seance/health", timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        if (body.length < 512) body += c;
      });
      res.on("end", () => {
        try {
          finish(JSON.parse(body).service === HEALTH_SERVICE ? "viewer" : "busy");
        } catch {
          finish("busy");
        }
      });
      res.on("error", () => finish("busy"));
    });
    req.on("timeout", () => {
      req.destroy();
      finish("busy");
    });
    req.on("error", (err2) => finish("code" in err2 && err2.code === "ECONNREFUSED" ? "free" : "busy"));
  });
}
function spawnViewer(root, port) {
  const child = nodeSpawn(process.execPath, [SCRIPT, "--root", root, "--port", String(port), "--idle-ms", String(DEFAULT_IDLE_MS)], {
    detached: true,
    stdio: "ignore",
    shell: false,
    windowsHide: true
  });
  child.on("error", () => void 0);
  child.unref();
}
async function maybeStartSeance({ root, env, probe = probePort, spawnViewer: spawnFn = spawnViewer }) {
  try {
    if (env["GHOST_RUN_SEANCE_AUTOSTART"] === "0") return "off";
    const { local, port } = parseSeanceBase(env["GHOST_RUN_SEANCE_BASE"]);
    if (!local || !Number.isInteger(port) || port < 1 || port > 65535) return "not-local";
    const state = await probe(port);
    if (state === "viewer") return "running";
    if (state === "busy") return "busy";
    spawnFn(root, port);
    return "started";
  } catch {
    return "failed";
  }
}

// integrations/kiro-hook/lib/gate/main.mjs
var SEANCE_WAIT_MS = 500;
var currentRunId = randomUUID4();
async function cleanupOnTimeout() {
  try {
    if (RUNNER_SUPPORTS_RUN_ID) await cleanupRun(currentRunId);
  } catch {
  }
}
async function run2(stdinText) {
  const startedSec = process.uptime();
  const parsed = parseHookEvent(stdinText);
  const root = parsed.ok ? parsed.event.cwd : process.cwd();
  let first = true;
  const uuid = () => {
    if (first) {
      first = false;
      return currentRunId;
    }
    return randomUUID4();
  };
  const env = {
    GHOST_RUN_WARDS_FILE: process.env.GHOST_RUN_WARDS_FILE,
    GHOST_RUN_SEANCE_BASE: process.env.GHOST_RUN_SEANCE_BASE
  };
  let graveWritten = false;
  const decision = await decide(
    { stdin: stdinText, root, env, elapsedSec: () => process.uptime() - startedSec },
    {
      runPlan,
      loadWards: loadWardsForHook,
      fsView: createNodeFsView(),
      clock: () => Date.now(),
      uuid,
      warnMode: WARN_MODE,
      store: createGateStore(root),
      onGrave: () => {
        graveWritten = true;
      }
    }
  );
  if (graveWritten) {
    try {
      const seanceEnv = {
        GHOST_RUN_SEANCE_BASE: process.env.GHOST_RUN_SEANCE_BASE,
        GHOST_RUN_SEANCE_AUTOSTART: process.env.GHOST_RUN_SEANCE_AUTOSTART
      };
      await Promise.race([
        maybeStartSeance({ root, env: seanceEnv }),
        new Promise((resolve7) => setTimeout(resolve7, SEANCE_WAIT_MS).unref())
      ]);
    } catch {
    }
  }
  try {
    await enforceCaps(root, STORE_CAPS);
  } catch {
  }
  const stderr = decision.stderr === "" || decision.stderr.endsWith("\n") ? decision.stderr : `${decision.stderr}
`;
  const exit = decision.exit === 0 ? 0 : 2;
  if (exit === 0 && decision.kind !== "allow" && decision.kind !== "ask") {
    return { exit: 2, stdout: "", stderr: `${FATAL_LINES["internal-error"]}
` };
  }
  return { exit, stdout: decision.stdout, stderr };
}
export {
  cleanupOnTimeout,
  run2 as run
};
