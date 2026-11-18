// In-memory FsView that models symbolic links in any path component and, optionally,
// a case-insensitive file system. Values: string (file), { dir: true }, { link: '<abs target>' }.

/**
 * @param {Record<string, any>} nodes absolute path -> node
 * @param {{ caseInsensitive?: boolean }} [opts]
 * @returns {import('../../lib/gate/write-judgment.mjs').FsView}
 */
export function makeMemTree(nodes, opts = {}) {
  /** @param {string} p */
  const k = (p) => (opts.caseInsensitive === true ? p.toLowerCase() : p);
  /** @type {Map<string, { name: string, node: any }>} */
  const tree = new Map();
  for (const [p, node] of Object.entries({ '/ws': { dir: true }, ...nodes })) {
    tree.set(k(p), { name: p, node });
  }
  /** @param {string} p */
  const resolveLinks = (p) => {
    const parts = p.split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < parts.length; i++) {
      cur = `${cur}/${parts[i]}`;
      const n = tree.get(k(cur))?.node;
      if (n && typeof n === 'object' && 'link' in n) {
        return resolveLinks([n.link, ...parts.slice(i + 1)].join('/'));
      }
    }
    return cur === '' ? '/' : cur;
  };
  /** @param {any} n */
  const stat = (n) => ({
    isSymbolicLink: () => typeof n === 'object' && 'link' in n,
    isDirectory: () => typeof n === 'object' && 'dir' in n,
    size: typeof n === 'string' ? n.length : 0,
  });
  return {
    /** @param {string} p */
    async lstat(p) {
      const i = p.lastIndexOf('/');
      const parent = i <= 0 ? '/' : p.slice(0, i);
      const real = parent === '/' ? p : `${resolveLinks(parent)}${p.slice(i)}`;
      const e = tree.get(k(real));
      return e === undefined ? null : stat(e.node);
    },
    /** @param {string} p */
    async realpath(p) {
      const r = resolveLinks(p);
      const e = tree.get(k(r));
      return e === undefined ? null : opts.caseInsensitive === true ? e.name : r;
    },
    /** @param {string} p */
    async readdir(p) {
      const dir = k(resolveLinks(p));
      const prefix = dir === '/' ? '/' : `${dir}/`;
      return [...tree.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([, e]) => e.name.slice(e.name.lastIndexOf('/') + 1));
    },
  };
}
