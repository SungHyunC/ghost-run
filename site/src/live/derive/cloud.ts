// Plan_Record derivation for Ghost Cloud. Shared by the adapter and the record script.
// Pure: structural inputs only, no engine import, no I/O.

import type { CheckRow, CopyScene, PlanRecord, RealityScene } from '../../data/types';
import { destinations, extraChips, reasonOf, violatedIds, violationsOf } from './common';
import type { ObservedEventLike, ViolationLike } from './common';

/** The part of the world's scene that the derivation reads. */
export interface CloudSceneLike {
  buckets: readonly {
    name: string;
    protected: boolean;
    acl: string;
    publicAccessBlocked: boolean;
    objects: readonly { key: string }[];
  }[];
}

/** The headline ward: the first `path` ward of the wards file. */
export interface CloudWardLike {
  id: string;
  deny: readonly string[];
  paths: readonly string[];
}

type CloudBucket = Extract<CopyScene, { kind: 'cloud' }>['buckets'][number];

const bucketsOf = (scene: CloudSceneLike): CloudBucket[] =>
  scene.buckets.map((b) => ({ name: b.name, objects: b.objects.map((o) => o.key), protected: b.protected }));

/** The kind line of the ward card. */
export function cloudWardLine(ward: CloudWardLike): string {
  return `kind: path \u00B7 deny ${ward.deny.join(', ')} on ${ward.paths.join(', ')}`;
}

/** The Reality pane: buckets with their objects, before the run. */
export function cloudReality(before: CloudSceneLike): RealityScene {
  return { kind: 'cloud', buckets: bucketsOf(before) };
}

export interface CloudPlanInput {
  commands: readonly string[];
  verdict: 'pass' | 'warn' | 'block';
  violations: readonly ViolationLike[];
  ward: CloudWardLike;
  before: CloudSceneLike;
  after: CloudSceneLike;
  /** `effectsOutside` of the report: one list per step. */
  effects: readonly (readonly { destination: string }[])[];
  observedEvents: readonly ObservedEventLike[];
  p1: { before: string; after: string };
  message: string;
}

/** A tag for a bucket whose ACL or public-access block differs from reality, else undefined. */
function tagOf(was: CloudSceneLike['buckets'][number] | undefined, now: CloudSceneLike['buckets'][number]): string | undefined {
  if (was === undefined) return undefined;
  const parts: string[] = [];
  if (now.acl !== was.acl) parts.push(`acl: ${now.acl}`);
  if (was.publicAccessBlocked && !now.publicAccessBlocked) parts.push('public access open');
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** The Plan_Record of one Ghost Cloud run. */
export function cloudPlanRecord(input: CloudPlanInput): PlanRecord {
  const { ward, before, after } = input;
  const pattern = ward.paths[0] ?? '';
  const beforeBuckets = bucketsOf(before);
  const kept = new Set(after.buckets.map((b) => b.name));
  const removed = beforeBuckets.filter((b) => !kept.has(b.name));
  const names = removed.map((b) => b.name).join(', ');
  const wasByName = new Map(before.buckets.map((b) => [b.name, b]));

  // Objects that left a bucket that is still there (`aws s3 rm --recursive`), by bucket.
  const afterKeys = new Map(after.buckets.map((b) => [b.name, new Set(b.objects.map((o) => o.key))]));
  const emptied = beforeBuckets.flatMap((b) => {
    const now = afterKeys.get(b.name);
    if (now === undefined) return [];
    const n = b.objects.filter((o) => !now.has(o)).length;
    return n > 0 ? [{ name: b.name, objects: n, protected: b.protected }] : [];
  });
  const objectsDeleted = emptied.reduce((n, b) => n + b.objects, 0);
  const inBucket = (b: { name: string; objects: number }): string => `${b.objects} ${b.objects === 1 ? 'object' : 'objects'} deleted in ${b.name}`;

  // The chip is a cross exactly when the ward has a violation in this run; the text says what happened.
  const wardViolated = violationsOf(input.violations, ward.id).length > 0;
  let measured: string;
  if (wardViolated) {
    const parts = [
      ...removed.filter((b) => b.protected).map((b) => `${b.name} deleted`),
      ...emptied.filter((b) => b.protected).map(inBucket),
    ];
    measured = parts.length > 0 ? parts.join(', ') : (reasonOf(input.violations, ward.id) ?? 'ward violated');
  } else if (removed.length > 0) {
    measured = `${names} is not ${pattern}`;
  } else if (emptied.length > 0) {
    measured = `${emptied.map(inBucket).join(', ')}, none in ${pattern}`;
  } else {
    measured = 'no bucket deleted';
  }
  const checks: CheckRow[] = [{ label: `never delete ${pattern}`, measured, ok: !wardViolated }];
  for (const chip of extraChips(input.violations, ward.id)) checks.push({ label: chip.wardId, measured: chip.text, ok: false });

  const afterBuckets: CloudBucket[] = after.buckets.map((b) => {
    const tag = tagOf(wasByName.get(b.name), b);
    const base: CloudBucket = { name: b.name, objects: b.objects.map((o) => o.key), protected: b.protected };
    return tag === undefined ? base : { ...base, tag };
  });

  return {
    commands: [...input.commands],
    display: input.commands.join(' && '),
    verdict: input.verdict,
    violatedWardIds: violatedIds(input.violations),
    checks,
    effectsOutside: destinations(input.effects, input.observedEvents),
    p1: { equal: input.p1.before === input.p1.after, before: input.p1.before, after: input.p1.after },
    copyAfter: { kind: 'cloud', buckets: afterBuckets },
    facts: {
      bucketsRemoved: removed.length,
      objectsRemoved: removed.reduce((n, b) => n + b.objects.length, 0),
      removedBuckets: removed.map((b) => b.name).join(','),
      // Only a run that empties a bucket without deleting it (`aws s3 rm --recursive`) has these two facts.
      ...(emptied.length > 0 ? { objectsDeleted, objectsDeletedIn: emptied.map((b) => b.name).join(',') } : {}),
    },
    message: input.message,
  };
}
