// Argument parser of ghost-hand-run. Pure: takes the argument list, reads nothing.

export const USAGE = [
  'Usage:',
  '  ghost-hand-run <plan.json> --wards <wards.yaml> [--seed <uint32>] [--variants <n>] [--variant-config <file>] [--json]',
  '  ghost-hand-run validate <plan.json>',
].join('\n');

export type CliCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'validate'; readonly planPath: string }
  | {
      readonly kind: 'run';
      readonly planPath: string;
      readonly wardsPath: string;
      readonly seedText: string | undefined;
      readonly variantsText: string | undefined;
      readonly variantConfigPath: string | undefined;
      readonly json: boolean;
    };

export type ParseArgsResult =
  | { readonly ok: true; readonly command: CliCommand }
  | { readonly ok: false; readonly error: string };

const VALUE_OPTIONS = ['--wards', '--seed', '--variants', '--variant-config'] as const;

export function parseArgs(argv: readonly string[]): ParseArgsResult {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { ok: true, command: { kind: 'help' } };
  if (argv[0] === 'validate') {
    if (argv.length !== 2 || (argv[1] as string).startsWith('--')) {
      return { ok: false, error: 'validate takes exactly one plan file path.' };
    }
    return { ok: true, command: { kind: 'validate', planPath: argv[1] as string } };
  }
  const values = new Map<string, string>();
  const positional: string[] = [];
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--json') {
      json = true;
    } else if ((VALUE_OPTIONS as readonly string[]).includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined) return { ok: false, error: `${arg} needs a value.` };
      if (values.has(arg)) return { ok: false, error: `${arg} is given more than once.` };
      values.set(arg, value);
      i += 1;
    } else if (arg.startsWith('--')) {
      return { ok: false, error: `Unknown option ${arg}.` };
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) return { ok: false, error: 'Exactly one plan file path is required.' };
  const wardsPath = values.get('--wards');
  if (wardsPath === undefined) return { ok: false, error: '--wards <wards.yaml> is required.' };
  return {
    ok: true,
    command: {
      kind: 'run',
      planPath: positional[0] as string,
      wardsPath,
      seedText: values.get('--seed'),
      variantsText: values.get('--variants'),
      variantConfigPath: values.get('--variant-config'),
      json,
    },
  };
}
