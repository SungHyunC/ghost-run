// Ghost Run+ docker-warmup (Pre Tool Use). Wakes a sleeping Docker Desktop VM before the gate's first
// check. It never blocks, prints nothing, and always exits 0. It does not read STDIN. No LLM and no
// network call; the only process it starts is one detached `docker info`.
import { warmUp } from './lib/warmup.mjs';

try {
  warmUp(process.cwd());
} catch {
  // never fail
}
process.exit(0);
