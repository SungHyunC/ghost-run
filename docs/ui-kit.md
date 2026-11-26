# Ghost Run+: UI kit

The shared screens and the secret-like key rule. Part of [Ghost Run+](../README.md).

## UI kit

`@ghost-run/ui` (`ui/`) draws the mirror world, candle, blacklight, red thread, graveyard, and lights-on theme from data that `core` already produced. It computes no verdict, diff, or finding. It asserts none of P1 to P8 and shows only the claim flags it receives. Its render properties are named UI-P1 to UI-P11. A Plan B run never shows a P1 claim. Commands, the dependency table, and the asset table are in [ui/README.md](../ui/README.md).

### Secret-like key rule

The Mirror world hides the value of any field whose key name contains `secret`, `token`, `password`, `passwd`, `apikey`, `api_key`, `authorization`, `cookie`, `credential`, `private_key`, or `session`, ignoring letter case, and shows `[hidden: secret-like field]` instead. This is a heuristic. It matches key names by case-insensitive containment and never inspects values. It can miss a secret under an innocent key name (for example `pwd`, or `privateKey`, which does not contain `private_key`), and it can hide a harmless value (for example `session_count`). It does not detect a secret typed into a command string or any other displayed text. The producer of the changes and scenes remains responsible for redaction.
