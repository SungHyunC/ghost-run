import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import DockerLabelReporter from './tests/docker-reporter.js';

const root = fileURLToPath(new URL('..', import.meta.url));

const alias = [
  { find: /^@ghost-run\/core\/verify$/, replacement: `${root}core/verify.ts` },
  { find: /^@ghost-run\/core$/, replacement: `${root}core/src/index.ts` },
];

// Test files that start real Docker containers. They run one file at a time, in their own
// project, so a test that counts containers cannot see another file's containers.
const dockerFiles = [
  'tests/**/*.docker.test.ts',
  'tests/recorder-wire-format.test.ts',
  'tests/harness.test.ts',
];

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    reporters: ['default', new DockerLabelReporter()],
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: ['**/node_modules/**', ...dockerFiles],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'docker',
          setupFiles: ['tests/docker-reaper-setup.ts'],
          include: dockerFiles,
          // Leftover timing probe that a hook kept from being deleted; remove this line with the file.
          exclude: ['**/node_modules/**', 'tests/tmp-timing.docker.test.ts'],
          // fileParallelism is root-only in vitest 3; a single forked worker serializes this project.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
