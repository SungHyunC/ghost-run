// Vitest reporter: prints `skipped (docker unavailable)` and `partial (n of 20 examples)`
// labels in the run summary (Req 17.7). Registered in vitest.config.ts.
import type { Reporter } from 'vitest/node';
import type { TestModule } from 'vitest/node';
import { DOCKER_EXAMPLES_META, isDockerSkippedName, summaryLines } from './docker-label.js';

export default class DockerLabelReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const skippedSuites: string[] = [];
    const properties: Array<{ name: string; examples: number }> = [];
    for (const mod of testModules) {
      for (const suite of mod.children.allSuites()) {
        if (isDockerSkippedName(suite.name)) skippedSuites.push(`${mod.moduleId.split('/').pop() ?? ''}: ${suite.name}`);
      }
      for (const test of mod.children.allTests()) {
        const examples = (test.meta() as Record<string, unknown>)[DOCKER_EXAMPLES_META];
        if (typeof examples === 'number') properties.push({ name: test.fullName, examples });
      }
    }
    const lines = summaryLines({ skippedSuites, properties });
    if (lines.length > 0) console.log(`\n${lines.join('\n')}\n`);
  }
}
