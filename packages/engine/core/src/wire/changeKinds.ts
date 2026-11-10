import type { AnnotationImportOp, ChangeItemType, FormImportOp } from '../mutation/Change';
import { lacksWhatArrivedIn } from './apiVersion';
import { CHANGE_KINDS } from './changeSchemas';

/**
 * A kind of change op or result item as it travels: an op's type, or a
 * restore. An import is a route of its own, so it isn't one.
 */
export type ChangeKind = Exclude<ChangeItemType, AnnotationImportOp['type'] | FormImportOp['type']>;

/**
 * The version each kind of change op and result item arrived in. A kind that
 * isn't here arrived in 3.0.
 *
 * Neither side sends a kind to a side that is older than the kind
 * (docs/conventions/api-evolution.md, "Adding a change kind"): a client holds
 * a change back from an older server, and a server sends an older client
 * `full-refresh` in place of a row it can't read. A new kind gets its row
 * here in the pull request that adds it.
 */
export const CHANGE_KIND_SINCE: Partial<Record<ChangeKind, string>> = {
  'pages.setScale': '3.1',
};

/** The version every kind without a row in {@link CHANGE_KIND_SINCE} arrived in. */
const FIRST_VERSION = '3.0';

const known = new Set<string>(CHANGE_KINDS);

/** Whether `kind` is a kind of change op or result item this build has. */
export function isChangeKind(kind: string): kind is ChangeKind {
  return known.has(kind);
}

/** The version `kind` arrived in, as `<major>.<minor>`. */
export function changeKindSince(kind: ChangeKind): string {
  return CHANGE_KIND_SINCE[kind] ?? FIRST_VERSION;
}

/**
 * The kinds among `kinds` that the other side doesn't have, each once, in
 * the order given; `version` is what the other side said it speaks (see
 * {@link lacksWhatArrivedIn}). A kind this build doesn't have (a newer server
 * wrote it) is one only a newer side has.
 */
export function changeKindsUnknownTo(version: string | null, kinds: Iterable<string>): string[] {
  const unknown = new Set<string>();
  for (const kind of kinds) {
    const since = isChangeKind(kind) ? changeKindSince(kind) : null;
    if (lacksWhatArrivedIn(version, since)) unknown.add(kind);
  }
  return [...unknown];
}
