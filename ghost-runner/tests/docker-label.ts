// Labels for Docker-dependent tests (Req 17.7). Pure helpers shared by `describeDocker`
// and the vitest reporter in `docker-reporter.ts`.

/** Printed for every suite that `describeDocker` skipped. */
export const DOCKER_SKIPPED_LABEL = 'skipped (docker unavailable)';

/** Suite-name suffix that lets the reporter find suites skipped by `describeDocker`. */
export const DOCKER_SKIPPED_SUFFIX = ` [${DOCKER_SKIPPED_LABEL}]`;

/** Fewer completed examples than this means a Docker property was interrupted. */
export const MIN_EXAMPLES = 20;

/** Task-meta key under which a Docker property records how many examples completed. */
export const DOCKER_EXAMPLES_META = 'ghostDockerExamples';

/** Safety properties that are never counted as passed when Docker is unavailable. */
export const DOCKER_ONLY_PROPERTIES: readonly string[] = ['P1', 'P5', 'P6'];

export function skippedSuiteName(name: string): string {
  return `${name}${DOCKER_SKIPPED_SUFFIX}`;
}

export function isDockerSkippedName(name: string): boolean {
  return name.endsWith(DOCKER_SKIPPED_SUFFIX);
}

/** `partial (n of 20 examples)` when fewer than 20 examples completed, else `undefined`. */
export function partialLabel(completed: number): string | undefined {
  return completed < MIN_EXAMPLES ? `partial (${String(completed)} of ${String(MIN_EXAMPLES)} examples)` : undefined;
}

export interface LabelInput {
  /** Names of suites that were skipped by `describeDocker`. */
  readonly skippedSuites: readonly string[];
  /** Docker properties with the number of examples they completed. */
  readonly properties: ReadonlyArray<{ readonly name: string; readonly examples: number }>;
}

/** Summary lines printed at the end of a run. Empty when there is nothing to label. */
export function summaryLines(input: LabelInput): string[] {
  const lines: string[] = [];
  if (input.skippedSuites.length > 0) {
    lines.push(`Docker suites ${DOCKER_SKIPPED_LABEL} (not passed):`);
    for (const s of input.skippedSuites) lines.push(`  - ${s}`);
    lines.push(
      `  ${DOCKER_ONLY_PROPERTIES.join(', ')} were not asserted and are not counted as passed (Docker unavailable).`,
    );
  }
  for (const p of input.properties) {
    const label = partialLabel(p.examples);
    if (label !== undefined) lines.push(`Docker property "${p.name}": ${label}`);
  }
  return lines;
}
