// Fixed texts of the Ghost Hand page (requirements.md), written exactly as specified.
// Pure constants and two small formatters; no I/O. Only task 18.2 may edit this file,
// and only to flip P2_TEXT_ENABLED.

/**
 * Build switch for every P2 text (the P2 claim sentence and the P2 check lines).
 * Stays false until the world-contract steering update (S5) has landed.
 */
export const P2_TEXT_ENABLED = false;

/** Req 2.8: engine start failure (element with role `alert`). */
export const ENGINE_START_FAILURE_TEXT = 'The physics engine could not start in this browser.';

/** Req 4.7: unknown `forbidden_contacts` entry (role `status`). The caller escapes the name. */
export function unknownWardEntryText(name: string): string {
  return `Ward entry "${name}" matches no body in this world.`;
}

/** Req 8.7: joint-limit and self-collision ward not active (role `status`). */
export const JOINT_LIMIT_INACTIVE_TEXT =
  'Joint-limit and self-collision wards are not active in this build.';

/** Req 9.7: WardSet without a physics ward (role `status`). */
export const NO_PHYSICS_WARD_TEXT = 'No physics ward is active: variant results are not judged.';

/** Req 9.8: label of the message panel. */
export const MESSAGE_PANEL_LABEL = 'Message the agent receives';

/** Req 9.9: provisional wording note, shown while PR-2 has not landed. */
export const PROVISIONAL_WORDING_TEXT =
  'Message wording of the wards module is provisional: its last line does not apply to this physics world.';

/** Req 10.3: P1 failure (role `alert`). */
export const P1_FAILURE_TEXT = 'Ghost run changed reality: this is a bug in the playground.';

/** Req 10.4: P5 and P6 line, next to the Claim_Banner. */
export const P5_P6_TEXT =
  'P5 and P6 concern files and secrets and are not claimed for this physics world.';

/** Req 10.5: Docker line. */
export const DOCKER_TEXT = 'Docker box (real mode) is not used by this page.';

/** Req 10.6: P2 check lines (role `status`); shown only while P2_TEXT_ENABLED is true. */
export const P2_MATCH_TEXT = 'P2 check: the reference execution matched the base ghost diff.';
export const P2_MISMATCH_TEXT =
  'P2 check: MISMATCH between the base ghost diff and the reference execution.';
/** Req 10.6: the check text adds this scope sentence (no physical arm statement). */
export const P2_CHECK_SCOPE_TEXT =
  'P2 is checked for this engine build in this browser and says nothing about a physical arm.';
/** Req 10.6 and the world-contract steering: P2 scope wording. */
export const P2_SCOPE_TEXT =
  "On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware.";

/** Req 10.7: determinism check lines. `hash` is the Trajectory_Hash as hex. */
export function determinismReproducedText(hash: string): string {
  return `Determinism check: this browser reproduced the reference trajectory (hash ${hash.slice(0, 12)}).`;
}
export const DETERMINISM_FAILED_TEXT =
  'Determinism check: this browser did NOT reproduce the reference trajectory; the same-seed guarantee (P8) is not claimed here.';

/** Req 10.8: P8 scope line (always visible). */
export const P8_SCOPE_TEXT =
  'Same-seed determinism (P8) was verified only in Node.js 20.20.2 and Chrome 157 on an Apple M1 Mac.';

/** Req 10.10: reference-simulation line, wherever the Reference_Arm is named or executed. */
export const REFERENCE_SIMULATION_TEXT =
  'The "real" arm here is a reference simulation, not hardware.';

/** Req 11.6: plan origin lines. */
export const PLAN_ORIGIN_RECORDED_TEXT =
  'Recorded plan: replayed here, not decided by an LLM in this page.';
export const PLAN_ORIGIN_SCRIPTED_TEXT = 'Scripted plan: not decided by an LLM in this page.';

/** Req 13.11: WebGL fallback (role `status`). */
export const WEBGL_FALLBACK_TEXT =
  '3D view unavailable: WebGL is not available in this browser. Results are shown as text.';

/** Req 14.9: graveyard drop line. */
export const GRAVEYARD_DROP_TEXT = 'Oldest blocked command dropped (limit 200).';

/** Req 16.6: possession lines. */
export const POSSESSION_ANALYSIS_TEXT = 'Text analysis does not catch every injection.';
export const POSSESSION_CONTACT_TEXT =
  'A forbidden contact with the vase is blocked by what the ghost does, with or without hidden text.';
