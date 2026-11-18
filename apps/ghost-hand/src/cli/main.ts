/// <reference types="node" />
// Node entry point (task 14.3, requirements 11.8, 11.9). Built to dist-node/cli.js; never imported by the browser app.
// Reads only the paths it is given, calls no network or LLM API, and prints no file content except the message.
import { readFile } from 'node:fs/promises';
import { parseWards, formatConfigError } from '@ghost-run/wards-config';
import { escapeForDisplay } from '@ghost-run/ui';
import { createGhostHandWorld, parseVariantConfig } from '@ghost-run/drawer-arm';
import type { GhostHandWorld, VariantConfig } from '@ghost-run/drawer-arm';
import defaultVariantConfigText from '@ghost-run/drawer-arm/variant-config.json?raw';
import { probeCapabilities } from '../capabilities';
import { createInlineExecutor } from '../exec/inline';
import { validateVariantCount, parseSeedInput } from '../inputs';
import { GhostHandRunError, runGhostHand } from '../pipeline/run';
import { parsePlanFile } from '../plan/plan-file';
import type { PlanFile } from '../plan/plan-file';
import { runSelfCheck } from '../self-check';
import { parseArgs, USAGE } from './args';
import { EXIT_INTERNAL, EXIT_INVALID_INPUT, EXIT_PASS, EXIT_USAGE, exitCodeFor } from './exit';

class CliExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

function err(line: string): void {
  process.stderr.write(`${escapeForDisplay(line)}\n`);
}

function fail(code: number, line: string): never {
  err(line);
  throw new CliExit(code);
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return fail(EXIT_INVALID_INPUT, `${path}: [unreadable] the file cannot be read.`);
  }
}

function failList(errors: readonly { field: string; code: string; message: string }[]): never {
  for (const e of errors) err(`${e.field}: [${e.code}] ${e.message}`);
  throw new CliExit(EXIT_INVALID_INPUT);
}

async function loadPlan(path: string): Promise<PlanFile> {
  const parsed = parsePlanFile(await readText(path));
  return parsed.ok ? parsed.plan : failList(parsed.errors);
}

async function loadVariantConfig(path: string | undefined): Promise<VariantConfig> {
  const text = path === undefined ? defaultVariantConfigText : await readText(path);
  const parsed = parseVariantConfig(text);
  return parsed.ok ? parsed.config : failList(parsed.errors);
}

async function run(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.ok) {
    err(args.error);
    process.stderr.write(`${USAGE}\n`);
    return EXIT_USAGE;
  }
  const cmd = args.command;
  if (cmd.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return EXIT_PASS;
  }
  if (cmd.kind === 'validate') {
    await loadPlan(cmd.planPath);
    return EXIT_PASS;
  }

  // Check the numeric options first: a usage error needs no file access.
  const seedParsed = cmd.seedText === undefined ? undefined : parseSeedInput(cmd.seedText);
  if (seedParsed !== undefined && !seedParsed.ok) return fail(EXIT_USAGE, `--seed: ${seedParsed.error}`);
  if (cmd.variantsText !== undefined && !/^[0-9]+$/.test(cmd.variantsText)) {
    return fail(EXIT_USAGE, '--variants: Variant count must be a whole number written in digits only.');
  }

  const plan = await loadPlan(cmd.planPath);
  const wards = parseWards(await readText(cmd.wardsPath));
  if (!wards.ok) {
    for (const e of wards.errors) err(formatConfigError(e));
    return EXIT_INVALID_INPUT;
  }
  const variantConfig = await loadVariantConfig(cmd.variantConfigPath);
  const seed = seedParsed?.ok === true ? seedParsed.seed : variantConfig.defaultSeed;
  let variantCount = variantConfig.defaultCount;
  if (cmd.variantsText !== undefined) {
    const counted = validateVariantCount(Number(cmd.variantsText), variantConfig);
    if (!counted.ok) return fail(EXIT_USAGE, `--variants: ${counted.error}`);
    variantCount = counted.count;
  }

  const capabilities = probeCapabilities();
  const createWorld = (): Promise<GhostHandWorld> => createGhostHandWorld();
  const selfCheck = await runSelfCheck(createWorld, undefined);
  // Information only: it makes no isolation claim.
  err(
    selfCheck.state === 'ok'
      ? `Determinism self-check: two runs of the reference plan agree (hash ${selfCheck.hash.slice(0, 12)}).`
      : `Determinism self-check: not confirmed (${selfCheck.state === 'failed' ? selfCheck.reason : 'not run'}).`,
  );

  const world = await createGhostHandWorld({ recordFrames: true });
  const executor = createInlineExecutor(createWorld);
  try {
    const result = await runGhostHand({
      plan: plan.actions,
      wardSet: wards.wardSet,
      variantConfig,
      seed,
      variantCount,
      world,
      executor,
      evidence: { selfCheck, capabilities },
      planOrigin: plan.origin,
    });
    if (cmd.json) {
      const wardIds = [...new Set(result.wardVerdict.violations.map((v) => v.wardId))];
      const failedVariants = result.variantResults.filter((v) => !v.success).map((v) => v.variantId);
      process.stdout.write(`${JSON.stringify({ verdict: result.verdict, wardIds, failedVariants })}\n`);
    }
    process.stdout.write(`${result.message}\n`);
    return exitCodeFor(result.verdict);
  } catch (error) {
    if (error instanceof GhostHandRunError) return fail(EXIT_INVALID_INPUT, `${error.field}: [${error.code}] ${error.message}`);
    throw error;
  } finally {
    executor.dispose();
    world.dispose();
  }
}

async function main(): Promise<void> {
  let code: number;
  try {
    code = await run(process.argv.slice(2));
  } catch (error) {
    if (error instanceof CliExit) {
      code = error.code;
    } else {
      err(`internal error: ${error instanceof Error ? error.message : String(error)}`);
      code = EXIT_INTERNAL;
    }
  }
  process.exitCode = code;
}

void main();
