/**
 * Lending: a sibling plugin's records shown and edited as annotations (the
 * form plugin lends its widgets in design mode; host-contract.ts,
 * `AnnotationLender`). This holds the lender, and says which records are
 * lent: the view shows them, the store writes their edits as the lender's ops.
 */
import { memo, PluginError, type Unsubscribe } from '@embedpdf/core';
import type { Id } from '@embedpdf/core-annotation';
import {
  anchorOf,
  annotationKey,
  type Annotation,
  type AnnotationRef,
  type ChangeOp,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationLender } from '../host-contract';
import type { StoreChange } from './store';

/** The lent records now: as the engine confirmed them, and as they show. */
export interface LentRecords {
  readonly confirmed: readonly Annotation[];
  readonly shown: readonly Annotation[];
}

export interface Lending {
  /** The lender, or `null`. */
  lender(): AnnotationLender | null;
  /** Its records now, or `null` while it lends none. */
  records(): LentRecords | null;
  /** Whether the record is lent. */
  owns(id: Id): boolean;
  lend(lender: AnnotationLender): Unsubscribe;
}

const NONE: ReadonlySet<Id> = new Set();

export function createLending(notify: () => void): Lending {
  let current: AnnotationLender | null = null;
  const records = (): LentRecords | null => current?.records() ?? null;
  const lent = memo(
    () => [records()?.shown] as const,
    (shown): ReadonlySet<Id> =>
      shown ? new Set(shown.map((record) => annotationKey(record.ref))) : NONE,
  );
  return {
    lender: () => current,
    records,
    owns: (id) => lent().has(id),
    lend(lender) {
      current = lender;
      notify();
      return () => {
        if (current !== lender) return;
        current = null;
        notify();
      };
    },
  };
}

/** A lent record's change stated in code: refused, naming its owner. */
export function refuseLent(lending: Pick<Lending, 'owns' | 'lender'>, ref: AnnotationRef): void {
  if (!lending.owns(annotationKey(ref))) return;
  const owner = lending.lender()?.owner ?? 'its own';
  throw new PluginError(
    'invalid-input',
    'annotation',
    `${annotationKey(ref)} belongs to the ${owner} plugin: change it there`,
  );
}

type Reorder = Extract<StoreChange, { type: 'reorder' }>;

/**
 * A reorder stated in code, split by owner: lent records go through their
 * lender (their ops into `lent`), and the rest is returned; `null` when none
 * of it is this plugin's. Lent records keep their own drawing order, so a
 * neighbour of the other owner can't be theirs.
 */
export function ownReorder(
  lending: Pick<Lending, 'owns' | 'lender'>,
  change: Reorder,
  lent: ChangeOp[],
): Reorder | null {
  const lender = lending.lender();
  const isLent = (ref: AnnotationRef) => lending.owns(annotationKey(ref));
  const lentRefs = change.refs.filter(isLent);
  if (!lender || !lentRefs.length) return change;
  const ownRefs = change.refs.filter((ref) => !isLent(ref));
  const anchor = anchorOf(change.position);
  if (anchor && (ownRefs.length || !isLent(anchor))) {
    throw new PluginError(
      'invalid-input',
      'annotation',
      `${lender.owner} records move among their own: ${annotationKey(anchor)} can't be their neighbour`,
    );
  }
  lent.push(...lender.reorderOps(change.page, lentRefs, change.position));
  return ownRefs.length ? { ...change, refs: ownRefs } : null;
}
