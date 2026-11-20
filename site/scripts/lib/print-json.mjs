// Deterministic JSON text: keys sorted at every level, arrays keep their order,
// two-space indent, one trailing newline. No timestamps are added.

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortValue(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function printJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}
