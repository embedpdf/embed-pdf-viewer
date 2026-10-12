import {
  EngineError,
  EngineErrorCode,
  PermissionDenied,
  isSkippedItem,
  isUndoChange,
  itemWrote,
  objectNumbersNamedBy,
  type AnnotationActor,
  type CacheDelta,
  type ChangeAnswer,
  type ChangeAuthority,
  type RecordedChange,
  type ChangeItem,
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
  /** Its ops (a single-verb route's one op, an import's among them), or an undo. */
  readonly change: RecordedChange<PageCoordinates, WireAnnotationResources>;
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

/**
 * What a commit bumps for the changes that wrote: from what they did, not
 * what they were. Each read family has its own pins: an annotation write
 * moves the annotation list and its pages' `annotation_version`; a form
 * write moves the form and its widgets' pages' `widget_version`.
 */
export interface ChangeFacts {
  /** The pages whose annotations (widgets excepted) changed: their `annotation_version`. */
  readonly annotationPages: readonly number[];
  /** The pages whose widgets changed: their `widget_version`. */
  readonly widgetPages: readonly number[];
  /** The layer's annotation list (`annotations_version`). */
  readonly annotationList: boolean;
  /** The layer's form: fields and widget rows (`forms_version`). */
  readonly form: boolean;
  /** The document's metadata (`metadata_version`). */
  readonly metadata: boolean;
}

/** The facts of every item that wrote. */
export function factsOf(results: readonly ChangeResult[]): ChangeFacts {
  const annotationPages = new Set<number>();
  const widgetPages = new Set<number>();
  let annotationList = false;
  let form = false;
  let metadata = false;
  for (const item of results.flatMap((result) => result.items)) {
    if (isSkippedItem(item)) continue;
    const pages = item.meta.affectedPages.map((page) => page.objectNumber);
    if (item.type.startsWith('annotations.')) {
      for (const page of pages) annotationPages.add(page);
      annotationList = true;
    } else if (item.type.startsWith('forms.')) {
      for (const page of pages) widgetPages.add(page);
      form = true;
    } else if (item.type === 'metadata.update' || item.type === 'metadata.updateCustom') {
      metadata = true;
    }
  }
  return {
    annotationPages: [...annotationPages],
    widgetPages: [...widgetPages],
    annotationList,
    form,
    metadata,
  };
}

/**
 * Whether any item of a result wrote: a change left alone entirely, or an
 * import that left every item out, wrote nothing.
 */
export function wrote(result: ChangeResult): boolean {
  return result.items.some(itemWrote);
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

/** A one-op change's result as its single verb answers it: the item, without its type. */
export function verbResultOf(result: ChangeResult): unknown {
  const item = result.items[0];
  if (!item || isSkippedItem(item)) {
    throw new EngineError(EngineErrorCode.Unknown, 'a single verb wrote nothing');
  }
  const { type: _type, skipped: _skipped, ...rest } = item as ChangeItem & { skipped?: unknown };
  // An annotation item names its page beside the verb's result; a form
  // result that names one (`forms.reorderWidgets`) keeps it.
  if (!item.type.startsWith('annotations.')) return rest;
  const { page: _page, ...verbResult } = rest as { page?: unknown };
  return verbResult;
}
