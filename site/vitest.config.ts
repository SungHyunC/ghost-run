import { defineConfig } from 'vitest/config';

const record = process.env['GHOST_SITE_RECORD'] === '1';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/dom/**/*.test.{ts,tsx}'],
          testTimeout: 60_000,
        },
      },
      ...(record
        ? [
            {
              test: {
                name: 'record',
                environment: 'node' as const,
                include: ['tests/record/**/*.test.ts'],
                testTimeout: 600_000,
                hookTimeout: 600_000,
              },
            },
          ]
        : []),
    ],
  },
});
