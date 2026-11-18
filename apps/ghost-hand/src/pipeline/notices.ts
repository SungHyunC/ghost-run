// Req 8.7, 9.7, 9.9: fixed texts that depend on capabilities and on the WardSet.
import type { WardSet } from '@ghost-run/core';
import type { Capabilities } from '../capabilities';
import { JOINT_LIMIT_INACTIVE_TEXT, NO_PHYSICS_WARD_TEXT, PROVISIONAL_WORDING_TEXT } from '../texts';

export function buildNotices(caps: Capabilities, wardSet: WardSet): string[] {
  const out: string[] = [];
  if (!caps.jointSelfWard) out.push(JOINT_LIMIT_INACTIVE_TEXT);
  if (!caps.claimsOptional) out.push(PROVISIONAL_WORDING_TEXT);
  if (!wardSet.wards.some((w) => w.kind === 'physics')) out.push(NO_PHYSICS_WARD_TEXT);
  return out;
}
