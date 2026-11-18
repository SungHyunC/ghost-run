// Harness worker: computes the Trajectory_Hash of REFERENCE_PLAN twice, each time on a fresh Base_World, and
// reports the hashes. Used only by the Chrome harness (task 17.1).
import { REFERENCE_PLAN, createGhostHandWorld } from '@ghost-run/drawer-arm';

const scope = globalThis as unknown as {
  onmessage: ((event: unknown) => void) | null;
  postMessage(message: unknown): void;
};

async function hashOnce(): Promise<string> {
  const world = await createGhostHandWorld({ recordFrames: false });
  try {
    return (await world.referenceExecute(REFERENCE_PLAN)).trajectoryHash;
  } finally {
    world.dispose();
  }
}

scope.onmessage = () => {
  void (async () => {
    try {
      const first = await hashOnce();
      const second = await hashOnce();
      scope.postMessage({ ok: true, hashes: [first, second] });
    } catch (error) {
      scope.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
};
