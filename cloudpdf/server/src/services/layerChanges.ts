import {
  EngineError,
  EngineErrorCode,
  PermissionDenied,
  isSkippedItem,
  isUndoChange,
  objectNumbersNamedBy,
  type AnnotationActor,
  type CacheDelta,
  type ChangeAnswer,
  type ChangeAuthority,
  type Change,
  type ChangeItem,
  type ChangeItemType,
  type ChangeResult,
  type PageCoordinates,
  type SerializedEngineError,
  type ServerChange,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { OBJECT_NUMBER_ESTIMATES } from './LayerWriteObjectNumbers';
import type { AuditMutationKind } from '../db/repos/audit_log.repo';
import type { ChangeOutcomeRow } from '../db/repos/change_outcomes.repo';

/**
 * Changes on a layer (`POST …/changes`, and the single-op routes, each one
 * change): what a request answers, what its commit bumps, and who may undo
 * what. `LayerService.applyChanges` runs them.
 */

/** One change of a request, as the route read it. */
export interface RequestedChange {
  readonly opId: string;
  readonly change: Change<PageCoordinates, WireAnnotationResources>;
}

/** How long a change's answer, reverse and capture are kept: 30 days unless configured. */
export function changeRetentionMs(env: NodeJS.ProcessEnv = process.env): number {
  const days = Number(env.CLOUDPDF_CHANGE_RETENTION_DAYS ?? 30);
  return (Number.isFinite(days) && days > 0 ? days : 30) * 24 * 60 * 60 * 1000;
}

/** The object numbers a request's creates name: every one must be its session's. */
export function numbersNamedBy(changes: readonly RequestedChange[]): number[] {
  return changes.flatMap(({ change }) => objectNumbersNamedBy(change));
}

/**
 * How many objects a request's changes may make for themselves (appearance
 * streams, fonts), as the single verbs estimate theirs: form writes
 * regenerate many widget appearances, every other write few.
 */
export function objectNumberEstimateOf(changes: readonly RequestedChange[]): number {
  const forms = changes.some(
    ({ change }) => !isUndoChange(change) && change.ops.some((op) => op.type.startsWith('forms.')),
  );
  // An undo may restore what a form write took: estimate it as one.
  const undo = changes.some(({ change }) => isUndoChange(change));
  return forms || undo ? OBJECT_NUMBER_ESTIMATES.forms : OBJECT_NUMBER_ESTIMATES.default;
}

/** Items whose kind changes the bulk annotation list: annotations, and form structure. */
const LIST_ITEMS: ReadonlySet<ChangeItemType> = new Set([
  'annotations.create',
  'annotations.update',
  'annotations.delete',
  'annotations.move',
  'annotations.restore',
  'forms.create',
  'forms.update',
  'forms.delete',
  'forms.restore',
  'forms.addWidget',
  'forms.removeWidget',
]);

/** What a commit bumps for the changes that wrote: from what they did, not what they were. */
export interface ChangeFacts {
  /** The pages whose annotations changed: their `annotation_version`. */
  readonly pages: readonly number[];
  /** The layer's bulk annotation list (`annotations_version`). */
  readonly annotationList: boolean;
  /** The document's metadata (`metadata_version`). */
  readonly metadata: boolean;
}

/** The facts of every item that wrote. */
export function factsOf(results: readonly ChangeResult[]): ChangeFacts {
  const pages = new Set<number>();
  let annotationList = false;
  let metadata = false;
  for (const item of results.flatMap((result) => result.items)) {
    if (isSkippedItem(item)) continue;
    for (const page of item.meta.affectedPages) pages.add(page.objectNumber);
    if (LIST_ITEMS.has(item.type)) annotationList = true;
    if (item.type === 'metadata.update' || item.type === 'metadata.updateCustom') metadata = true;
  }
  return { pages: [...pages], annotationList, metadata };
}

/** Whether any item of a result wrote: a change left alone entirely wrote nothing. */
export function wrote(result: ChangeResult): boolean {
  return result.items.some((item) => !isSkippedItem(item));
}

/**
 * A change's result as the client gets it once the commit landed: the cache
 * delta of the request's commit on the change and on each item that wrote.
 */
export function withCacheDelta(result: ChangeResult, cacheDelta: CacheDelta | null): ChangeResult {
  return {
    items: result.items.map(
      (item) =>
        (isSkippedItem(item)
          ? item
          : { ...item, meta: { ...item.meta, cacheDelta } }) as ChangeItem,
    ),
    meta: { ...result.meta, cacheDelta },
  };
}

/**
 * Whether the caller may undo the change `row` answered, and what runs: the
 * record it left (null when it left none: it was refused, or wrote nothing),
 * or the refusal. Only the user who made a change may undo it; a final change
 * since ends undo for it, and so does expiry.
 */
export function undoTargetOf(
  undoOf: string,
  row: ChangeOutcomeRow | undefined,
  context: { readonly sub: string; readonly horizon: number | null; readonly now: number },
):
  | { readonly reverse: string | null; readonly captureKey: string | null }
  | { readonly refusal: EngineError } {
  const unavailable = (reason: 'final-change' | 'expired') => ({
    refusal: new EngineError(
      EngineErrorCode.UndoUnavailable,
      `change ${undoOf} can no longer be undone`,
      { details: { reason } },
    ),
  });
  if (!row || row.expiresAt <= context.now) return unavailable('expired');
  if (row.status === 'refused') return { reverse: null, captureKey: null };
  if (row.actor !== context.sub) return { refusal: new PermissionDenied('changes:undo', 'target') };
  if (context.horizon !== null && row.auditId !== null && row.auditId < context.horizon) {
    return unavailable('final-change');
  }
  return { reverse: row.reverse, captureKey: row.captureKey };
}

/** A single-op route's change: its audit row keeps the route's kind, and the route's result as payload. */
export interface SingleOpAudit {
  readonly auditKind: AuditMutationKind;
  readonly payloadOf: (result: ChangeResult) => unknown;
}

/**
 * What a request's changes need, decided before the job runs: one slot per
 * change, in order (a kept answer, a refusal, or a change the job runs), and
 * the job's changes.
 */
export interface ChangePlan {
  readonly now: number;
  readonly slots: ChangeSlot[];
  readonly run: ServerChange<PageCoordinates>[];
}

export type ChangeSlot =
  | { readonly kind: 'kept'; readonly answer: ChangeAnswer }
  | {
      readonly kind: 'refused';
      readonly opId: string;
      readonly fingerprint: string;
      readonly error: unknown;
      /** Whether the refusal is the change's own answer, kept under its opId. */
      readonly keep: boolean;
    }
  | {
      readonly kind: 'run';
      readonly opId: string;
      readonly fingerprint: string;
      readonly undoOf: string | null;
    };

/** The answer an outcome row keeps, as the client got it. */
export function answerOf(row: ChangeOutcomeRow): ChangeAnswer {
  return row.status === 'applied'
    ? { opId: row.opId, status: 'applied', result: row.response as ChangeResult }
    : { opId: row.opId, status: 'refused', error: row.response as SerializedEngineError };
}

/** A refusal's outcome row: no audit row, nothing to undo. */
export function refusedRow(
  layerId: string,
  opId: string,
  payloadHash: string,
  error: SerializedEngineError,
  actor: string,
  createdAt: number,
  expiresAt: number,
): ChangeOutcomeRow {
  return {
    layerId,
    opId,
    payloadHash,
    status: 'refused',
    response: error,
    actor,
    auditId: null,
    reverse: null,
    captureKey: null,
    createdAt,
    expiresAt,
  };
}

/** A different change under an opId that already has an answer. */
export function reusedOpId(opId: string): EngineError {
  return new EngineError(
    EngineErrorCode.IdempotencyKeyReused,
    `opId ${opId} already answered a different change`,
  );
}

/**
 * The authority of a single-op route's write, whose capability the route
 * checked: it acts for `actor`, stamping it on what it creates, and checks
 * nothing more.
 */
export function checkedAuthority(actor?: AnnotationActor): ChangeAuthority {
  return { identity: actor ?? {}, grants: null, protection: null };
}

/** A one-op change's result as its single verb answers it: the item, without its type and page. */
export function verbResultOf(result: ChangeResult): unknown {
  const item = result.items[0];
  if (!item || isSkippedItem(item)) {
    throw new EngineError(EngineErrorCode.Unknown, 'a single verb wrote nothing');
  }
  const {
    type: _type,
    page: _page,
    skipped: _skipped,
    ...rest
  } = item as ChangeItem & {
    page?: unknown;
    skipped?: unknown;
  };
  return rest;
}
