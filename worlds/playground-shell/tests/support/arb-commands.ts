import fc from 'fast-check';
import type { VirtualProject } from '../../src/state.js';
import { arbVirtualProject } from './arb-project.js';

const newName = fc.stringMatching(/^[a-z][a-z0-9]{0,4}$/);
const word = fc.stringMatching(/^[a-z0-9]{1,6}$/);

/** A path argument: an existing entry, a missing sibling, or a new name. */
function arbPath(project: VirtualProject): fc.Arbitrary<string> {
  const existing = Object.keys(project.entries);
  const fresh = newName.map((n) => `${n}.new`);
  return existing.length === 0
    ? fresh
    : fc.oneof(fc.constantFrom(...existing), fresh, fc.constantFrom(...existing).map((p) => `${p}/${'x'}`));
}

/** One supported simple command over `project` (no sqlite3, curl, npm). */
export function arbSimpleCommand(project: VirtualProject): fc.Arbitrary<string> {
  const p = arbPath(project);
  return fc.oneof(
    fc.constant('pwd'),
    fc.constant('true'),
    fc.constant('false'),
    fc.constantFrom('ls', 'ls -a', 'ls -l'),
    p.map((a) => `ls ${a}`),
    p.map((a) => `cat ${a}`),
    word.map((w) => `echo ${w}`),
    word.map((w) => `echo -n ${w}`),
    fc.tuple(word, p).map(([w, a]) => `echo ${w} > ${a}`),
    fc.tuple(word, p).map(([w, a]) => `echo ${w} >> ${a}`),
    p.map((a) => `mkdir ${a}`),
    p.map((a) => `mkdir -p ${a}`),
    p.map((a) => `touch ${a}`),
    p.map((a) => `rm ${a}`),
    p.map((a) => `rm -f ${a}`),
    p.map((a) => `rm -r ${a}`),
    p.map((a) => `rm -rf ${a}`),
    p.map((a) => `rm -fr ${a}`),
    fc.tuple(p, p).map(([a, b]) => `mv ${a} ${b}`),
    fc.tuple(p, p).map(([a, b]) => `cp ${a} ${b}`),
    fc.tuple(p, p).map(([a, b]) => `cp -r ${a} ${b}`),
    p.map((a) => `find ${a}`),
    fc.tuple(p, word).map(([a, w]) => `find ${a} -name '*${w}*' -print`),
    fc.tuple(p, word).map(([a, w]) => `find ${a} -name '*${w}*' -delete`),
  );
}

/** A supported command line: simple commands joined by `;` or `&&`. */
export function arbCommandLine(project: VirtualProject): fc.Arbitrary<string> {
  return fc
    .tuple(
      arbSimpleCommand(project),
      fc.array(fc.tuple(fc.constantFrom(';', '&&'), arbSimpleCommand(project)), { maxLength: 3 }),
    )
    .map(([first, rest]) => rest.reduce((acc, [op, c]) => `${acc} ${op} ${c}`, first));
}

/** A generated project together with a supported command line over it. */
export const arbProjectAndLine: fc.Arbitrary<{ project: VirtualProject; line: string }> =
  arbVirtualProject.chain((project) => arbCommandLine(project).map((line) => ({ project, line })));
