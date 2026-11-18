import { TOMBSTONES } from './limits';
import { compact } from './escape';
import { arrayOf, pick } from './guards';
import type { Unreadable } from './guards';
import { EMPTY_GRAVEYARD, graveyardSummary, unreadableItem } from './texts';
import { parseUtcInstant } from './time';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface TombstoneModel {
  /** Stable identity for focus return (ids may repeat). */
  readonly inputIndex: number;
  /** Escaped; used only in a data attribute. The callback receives the original id. */
  readonly id: string;
  /** /^[A-Za-z0-9_-]{1,64}$/ on the raw id. False for an unreadable slot. */
  readonly rawIdValid: boolean;
  /** Compact. */
  readonly command: string;
  /** Escaped as supplied. */
  readonly recordedAt: string;
  readonly timeUnreadable: boolean;
  /** Compact each. */
  readonly wardIds: readonly string[];
  /** 'Open seance for blocked command <command>, recorded <recordedAt>, ward <ids>' | 'Unreadable item <index>' */
  readonly accessibleName: string;
  /** The entry could not be read; the view shows `accessibleName` and no button. */
  readonly unreadable: boolean;
}

export interface GraveyardModel {
  readonly kind: 'ok';
  /** '<N> blocked commands', N counts every received entry. */
  readonly summary: string;
  /** Every entry, in display order. The view renders the first `shownTombstones`. */
  readonly tombstones: readonly TombstoneModel[];
  readonly totalTombstones: number;
  /** min(totalTombstones, TOMBSTONES) */
  readonly shownTombstones: number;
  readonly emptyText: string | null;
}

interface Slot {
  readonly model: TombstoneModel;
  /** Epoch ms for a valid time, else null. */
  readonly instant: number | null;
}

function unreadableSlot(index: number): Slot {
  return {
    instant: null,
    model: {
      inputIndex: index,
      id: '',
      rawIdValid: false,
      command: '',
      recordedAt: '',
      timeUnreadable: false,
      wardIds: [],
      accessibleName: unreadableItem(index),
      unreadable: true,
    },
  };
}

function buildSlot(index: number, entry: unknown): Slot {
  const e = pick(entry, 'id', 'command', 'recordedAt', 'wardIds');
  if (e === null) return unreadableSlot(index);
  const wards = arrayOf(e.wardIds);
  if (
    typeof e.id !== 'string' ||
    typeof e.command !== 'string' ||
    typeof e.recordedAt !== 'string' ||
    wards === null ||
    !wards.every((w) => typeof w === 'string')
  ) {
    return unreadableSlot(index);
  }
  const command = compact(e.command);
  const recordedAt = compact(e.recordedAt);
  const wardIds = (wards as readonly string[]).map((w) => compact(w));
  const instant = parseUtcInstant(e.recordedAt);
  return {
    instant,
    model: {
      inputIndex: index,
      id: compact(e.id),
      rawIdValid: ID_PATTERN.test(e.id),
      command,
      recordedAt,
      timeUnreadable: instant === null,
      wardIds,
      accessibleName: `Open seance for blocked command ${command}, recorded ${recordedAt}, ward ${
        wardIds.length === 0 ? 'none' : wardIds.join(', ')
      }`,
      unreadable: false,
    },
  };
}

/**
 * Total; never throws. One tombstone per received entry (none merged or dropped, equal ids included).
 * Valid instants first, latest first, input order for equal instants; then every other entry in input order.
 */
export function buildGraveyardModel(entries: unknown): GraveyardModel | Unreadable {
  const list = arrayOf(entries);
  if (list === null) return { kind: 'unreadable' };
  const slots: Slot[] = [];
  for (let i = 0; i < list.length; i++) slots.push(buildSlot(i, list[i]));
  const valid = slots.filter((s) => s.instant !== null);
  const rest = slots.filter((s) => s.instant === null);
  valid.sort((a, b) => (b.instant as number) - (a.instant as number) || a.model.inputIndex - b.model.inputIndex);
  const tombstones = [...valid, ...rest].map((s) => s.model);
  return {
    kind: 'ok',
    summary: graveyardSummary(tombstones.length),
    tombstones,
    totalTombstones: tombstones.length,
    shownTombstones: Math.min(tombstones.length, TOMBSTONES),
    emptyText: tombstones.length === 0 ? EMPTY_GRAVEYARD : null,
  };
}
