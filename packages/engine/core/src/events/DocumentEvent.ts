import type { PageScaleResult } from '../mutation/PageScaleResult';
import type { FormEffectsResult } from '../forms/effects';
import type { PdfRotation } from '../geometry/primitives';
import type { AnnotationStableId } from '../identity/AnnotationStableId';
import type { PageRef } from '../identity/PageRef';
import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationMoveResult,
  AnnotationUpdateResult,
} from '../mutation/AnnotationMutationResults';
import type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
} from '../mutation/AttachmentMutationResults';
import type {
  FormFieldCreateResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormImportResult,
  FormRepairResult,
  FormSetValueResult,
  FormWidgetLinkResult,
} from '../mutation/FormMutationResults';
import type { MetadataUpdateResult } from '../mutation/MetadataUpdateResult';
import type { AnnotationFlattenResult } from '../mutation/AnnotationFlattenResult';
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import type { PageFlattenResult, PageFlattenUsage } from '../mutation/PageFlattenResult';
import type { RedactionApplyResult } from '../mutation/RedactionApplyResult';
import type { PageInsertResult } from '../mutation/PageInsertResult';
import type { PageMoveResult } from '../mutation/PageMoveResult';
import type { PageNameResult } from '../mutation/PageNameResult';
import type { PageRotateResult } from '../mutation/PageRotateResult';
import type { FormFieldRef } from '../identity/FormFieldRef';
import type { BaseVersionInfo, SignatureCompleteResult } from '../signature/types';

/**
 * Provenance of a `DocumentEvent` — whose hand caused the mutation, never
 * which transport delivered it (transport is invisible by design).
 *
 * `kind: 'local'` means caused by this engine instance — not "this user".
 * The same user in two tabs is two sessions: tab A's mutation arrives in
 * tab B as `'remote'` (with the same `sub`). Rule of thumb for consumers:
 * "is this my action" → check `kind` / `sessionId` (undo stacks, optimism
 * reconciliation); "is this my user" → check `sub` (attribution).
 */
export interface EventOrigin {
  /** 'local' = caused by this engine instance; 'remote' = another session. */
  kind: 'local' | 'remote';
  /** Identifies the engine instance that caused the mutation. */
  sessionId: string;
  /** Authenticated subject of the originator (cloud); `null` locally. */
  sub: string | null;
  /** Mutation timestamp (server ts for remote, client ts for local). */
  ts: number;
  /** Server audit-log row id — monotonic per document, the resume cursor.
   *  `null` until the mutation has a server identity (local engines; cloud
   *  own-mutation events before the server echoes the id). */
  serverId: number | null;
  /**
   * Set when this fact is one of several committed together, such as the
   * annotations of one import: they share `id`, and `index` counts from 0 to
   * `count - 1` in the order they were emitted.
   */
  tx?: { id: string; index: number; count: number };
}

/**
 * The one event stream both engines speak — the model is the contract, the
 * transport differs (local: in-process after the worker confirms; cloud:
 * in-process for your own mutations, SSE for everyone else's).
 *
 * Invariants (locked — the collaboration design rests on these):
 *
 *   - exactly once: every mutation that touches your document appears in
 *     your stream exactly once. The engine that performs a mutation emits
 *     the event itself at confirmation time; the remote channel exists to
 *     tell everyone else (own echoes are dropped by `sessionId`). A change
 *     that commits several facts at once, such as an import, emits one
 *     event per fact, back to back, sharing `origin.tx`.
 *   - ground truth only: events fire after the mutation is confirmed —
 *     never optimistically. Optimism is a plugin concern.
 *   - results ride verbatim: each event embeds the mutation result the
 *     caller received, unmodified — which (cloud) is byte-identical to the
 *     audit-log payload. A handler sees the same fact whether it performed
 *     the mutation, watched it locally, or received it over the wire.
 *   - published before settlement: the event for a session's own mutation
 *     reaches subscribers before the mutation's promise settles, so a caller
 *     awaiting the mutation already sees every state derived from the event.
 *
 * Handlers updating UI/document state should be origin-agnostic ("a page
 * was removed → update the registry"); `origin` is metadata for the few
 * provenance-aware features (undo, attribution toasts, camera etiquette).
 */
export type DocumentEvent =
  | ({ type: 'pages.scaleSet'; origin: EventOrigin } & PageScaleResult)
  | ({
      type: 'annotations.created';
      page: PageRef;
      origin: EventOrigin;
    } & AnnotationCreateResult)
  | ({
      type: 'annotations.updated';
      page: PageRef;
      origin: EventOrigin;
    } & AnnotationUpdateResult)
  | ({
      type: 'annotations.deleted';
      page: PageRef;
      origin: EventOrigin;
      /** What was deleted: its stable id, or `null` for a weak annotation (see `deletedAnnotationOf`). */
      deleted: AnnotationStableId | null;
    } & AnnotationDeleteResult)
  | ({
      type: 'annotations.moved';
      page: PageRef;
      origin: EventOrigin;
    } & AnnotationMoveResult)
  | ({
      type: 'annotations.flattened';
      origin: EventOrigin;
    } & AnnotationFlattenResult)
  | ({
      type: 'pages.moved';
      /** Locally: the moved block. Remotely the audit row only records the
       *  outcome, so this is the full new order — consumers should read
       *  `layout` for positions, never reconstruct the gesture. */
      pages: PageRef[];
      /** The originator's insertion point; absent on remote events. */
      toIndex?: number;
      origin: EventOrigin;
    } & PageMoveResult)
  | ({
      type: 'pages.rotated';
      pages: PageRef[];
      rotation: PdfRotation;
      origin: EventOrigin;
    } & PageRotateResult)
  | ({
      type: 'pages.deleted';
      /** The retired pages — not derivable from the surviving `layout`. */
      pages: PageRef[];
      origin: EventOrigin;
    } & PageDeleteResult)
  | ({
      type: 'pages.inserted';
      /** The originator's insertion point; absent on remote events. */
      toIndex?: number;
      origin: EventOrigin;
    } & PageInsertResult)
  | ({
      type: 'pages.named';
      /** The decoded key that was registered, renamed, or removed. */
      name: string;
      /** The page it now points at; `null` when the registration was removed. */
      page: PageRef | null;
      origin: EventOrigin;
    } & PageNameResult)
  | ({ type: 'attachments.created'; origin: EventOrigin } & AttachmentCreateResult)
  | ({ type: 'attachments.deleted'; origin: EventOrigin } & AttachmentDeleteResult)
  | ({ type: 'metadata.updated'; origin: EventOrigin } & MetadataUpdateResult)
  | ({ type: 'forms.valueSet'; origin: EventOrigin } & FormSetValueResult)
  | ({ type: 'forms.imported'; origin: EventOrigin } & FormImportResult)
  | ({ type: 'forms.repaired'; origin: EventOrigin } & FormRepairResult)
  | ({ type: 'forms.created'; origin: EventOrigin } & FormFieldCreateResult)
  | ({ type: 'forms.updated'; origin: EventOrigin } & FormFieldUpdateResult)
  | ({
      type: 'forms.deleted';
      origin: EventOrigin;
      /** The field that went (see `deletedFieldOf`). */
      deleted: FormFieldRef | null;
    } & FormFieldDeleteResult)
  | ({ type: 'forms.widgetAdded'; origin: EventOrigin } & FormWidgetLinkResult)
  | ({ type: 'forms.widgetRemoved'; origin: EventOrigin } & FormWidgetLinkResult)
  | ({ type: 'forms.effectsApplied'; origin: EventOrigin } & FormEffectsResult)
  | ({
      type: 'pages.flattened';
      pages: PageRef[];
      usage: PageFlattenUsage;
      origin: EventOrigin;
    } & PageFlattenResult)
  | ({
      type: 'redaction.applied';
      origin: EventOrigin;
    } & RedactionApplyResult)
  | {
      /** A signing candidate was parked: the document is read-only until it completes or is cancelled. */
      type: 'signatures.prepared';
      signingId: string;
      field: FormFieldRef;
      origin: EventOrigin;
    }
  | ({
      /** The sealed bytes are installed; `version` is what they became. */
      type: 'signatures.completed';
      signingId: string;
      origin: EventOrigin;
    } & SignatureCompleteResult)
  | {
      type: 'signatures.cancelled';
      signingId: string;
      origin: EventOrigin;
    }
  | {
      /**
       * The session moved to a new saved version (a completed signature,
       * here or in another session). Byte-level facts — revisions,
       * coverage, digests, verdicts — must be re-read.
       */
      type: 'document.versioned';
      version: BaseVersionInfo;
      origin: EventOrigin;
    }
  | {
      /**
       * Cloud only: the live event stream fell too far behind to replay
       * (the server's SSE `full-refresh`) — state derived from earlier
       * events or snapshots may be stale, and the gap's mutations will
       * never arrive as events. Consumers must re-read the snapshots they
       * keep fresh from this stream (`doc.annotations.list()`,
       * `doc.forms.list()`, …).
       *
       * Carries no `EventOrigin`: it is a transport notice, not a
       * document mutation — the exactly-once / results-ride-verbatim
       * invariants above apply to mutation events only. The local engine
       * never emits it.
       */
      type: 'stream.desynced';
      reason: 'backlog-overflow';
      ts: number;
    };

export type DocumentEventType = DocumentEvent['type'];

/** The event of one type, such as `DocumentEventOf<'annotations.created'>`. */
export type DocumentEventOf<T extends DocumentEventType> = Extract<DocumentEvent, { type: T }>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A `DocumentEvent` before provenance is stamped — what mutation paths
 *  hand to their engine's publisher, which adds `origin`. Transport
 *  notices (`stream.desynced`) are excluded: they are published directly
 *  by the remote channel, never through a mutation publisher. */
export type DocumentEventInit = DistributiveOmit<
  Exclude<DocumentEvent, { type: 'stream.desynced' }>,
  'origin'
>;
