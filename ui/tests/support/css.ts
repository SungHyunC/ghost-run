// Minimal CSS reader for the scan tests. It understands comments, quotes, parentheses,
// nested at-rule blocks, and declarations. It is not a general CSS parser.

export interface CssDecl {
  readonly prop: string;
  readonly value: string;
  readonly important: boolean;
}

export interface CssBlock {
  readonly prelude: string;
  /** Preludes of the enclosing blocks, outermost first. */
  readonly parents: readonly string[];
  readonly decls: CssDecl[];
}

export interface ParsedCss {
  readonly stripped: string;
  readonly blocks: readonly CssBlock[];
  /** At-rule statements without a block, such as `@import './x.css'`. */
  readonly statements: readonly string[];
  readonly balanced: boolean;
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function parseCss(css: string): ParsedCss {
  const stripped = stripComments(css);
  const blocks: CssBlock[] = [];
  const statements: string[] = [];
  const stack: CssBlock[] = [];
  let balanced = true;
  let buf = '';
  let paren = 0;
  let quote: string | null = null;

  const flush = (): void => {
    const t = buf.trim();
    buf = '';
    if (t === '') return;
    const top = stack[stack.length - 1];
    if (t.startsWith('@')) {
      statements.push(t.replace(/\s+/g, ' '));
      return;
    }
    const idx = t.indexOf(':');
    if (top === undefined || idx < 1) return;
    const rawProp = t.slice(0, idx).trim();
    const prop = rawProp.startsWith('--') ? rawProp : rawProp.toLowerCase();
    let value = t.slice(idx + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    top.decls.push({ prop, value, important });
  };

  for (const ch of stripped) {
    if (quote !== null) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') paren += 1;
    if (ch === ')') paren = Math.max(0, paren - 1);
    if (paren > 0 || ch === ')') {
      buf += ch;
      continue;
    }
    if (ch === '{') {
      const block: CssBlock = {
        prelude: buf.trim().replace(/\s+/g, ' '),
        parents: stack.map((b) => b.prelude),
        decls: [],
      };
      buf = '';
      stack.push(block);
      blocks.push(block);
    } else if (ch === ';') {
      flush();
    } else if (ch === '}') {
      flush();
      if (stack.pop() === undefined) balanced = false;
    } else {
      buf += ch;
    }
  }
  flush();
  if (stack.length > 0 || quote !== null) balanced = false;
  return { stripped, blocks, statements, balanced };
}
