import type { PageScaleResult } from '../mutation/PageScaleResult';
import type { FormEffectsResult } from '../forms/effects';
import type { PdfRotation } from '../geometry/primitives';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageRef } from '../identity/PageRef';
import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationReorderResult,
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
  FormMutationMeta,
  FormRepairResult,
  FormSetValueResult,
  FormWidgetDeleteResult,
  FormWidgetLinkResult,
  FormWidgetRestoreResult,
  FormWidgetsReorderResult,
  FormCalculationsReorderResult,
  FormWidgetUpdateResult,
} from '../mutation/FormMutationResults';
import type { AnnotationListMutationMeta } from '../mutation/AnnotationListMutationMeta';
import type { Annotation } from '../annotation/kinds';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { FormFieldDTO } from '../forms/field';
import type { CustomMetadataUpdateResult } from '../mutation/CustomMetadataUpdateResult';
import type { MetadataUpdateResult } from '../mutation/MetadataUpdateResult';
import type { AnnotationFlattenResult } from '../mutation/AnnotationFlattenResult';
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import type { PageFlattenResult, PageFlattenUsage } from '../mutation/PageFlattenResult';
import type { RedactionApplyResult } from '../mutation/RedactionApplyResult';
import type { PageInsertResult } from '../mutation/PageInsertResult';
import type { PageReorderResult } from '../mutation/PageReorderResult';
import type { PageNameResult } from '../mutation/PageNameResult';
import type { PageRotateResult } from '../mutation/PageRotateResult';
import type { FormFieldRef } from '../identity/FormFieldRef';
import type {
  BaseVersionInfo,
  SignatureCompleteResult,
  SignaturePrepared,
} from '../signature/types';
import type { AttachmentRef } from '../dto/Attachment';

/**
 * Provenance of a `DocumentEvent` — whose hand caused the mutation, never
 * which transport delivered it (transport is invisible by design).
 *
 * `kind: 'local'` means made through this open document (this handle), not
 * "this user". Every open is its own session: the same user in two tabs, or
 * an app that opens one cloud document twice, is two sessions, and a
 * mutation made through one arrives in the other as `'remote'` (with the
 * same `sub`). Rule of thumb for consumers: "is this my action" → check
 * `kind` / `sessionId` (undo stacks, optimism reconciliation); "is this my
 * user" → check `sub` (attribution).
 */
export interface EventOrigin {
  /** 'local' = made through this handle; 'remote' = another session. */
  kind: 'local' | 'remote';
  /** Identifies the session (the open document handle) that made the mutation. */
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
  /** Set on the events of an undo: the `opId` of the change it undid. */
  undoOf?: string;
}

/**
 * The one event stream both engines speak — the model is the contract, the
 * transport differs (local: in-process after the worker confirms; cloud:
 * in-process for your own mutations, SSE for everyone else's).
 *
 * Invariants (locked — the collaboration design rests on these):
 *
 *   - exactly once: every mutation that touches your document appears in
 *     your stream exactly once. The handle that performs a mutation emits
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
      /**
       * What was deleted: the annotation and what went with it (replies,
       * grouped parts, review states, popups), the annotation first; see
       * `deletedAnnotationsOf`.
       */
      deleted: AnnotationRef[];
    } & AnnotationDeleteResult)
  | ({
      /** A stacking-order change: the page's annotations in their new order. */
      type: 'annotations.reordered';
      page: PageRef;
      origin: EventOrigin;
    } & AnnotationReorderResult)
  | {
      /**
       * An undo brought deleted annotations back: the same objects, under
       * the refs they had, with their owner, replies and popup. A listener
       * that keeps things by ref (comments, links) attaches them again.
       */
      type: 'annotations.restored';
      page: PageRef;
      origin: EventOrigin;
      /** What came back, in `/Annots` order: the annotation first, then what went with it. */
      annotations: Annotation[];
      meta: AnnotationListMutationMeta;
    }
  | ({
      type: 'annotations.flattened';
      origin: EventOrigin;
    } & AnnotationFlattenResult)
  | ({ type: 'pages.reordered'; origin: EventOrigin } & PageReorderResult)
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
  | ({ type: 'pages.inserted'; origin: EventOrigin } & PageInsertResult)
  | ({
      type: 'pages.named';
      /** The decoded key that was registered, renamed, or removed. */
      name: string;
      /** The page it now points at; `null` when the registration was removed. */
      page: PageRef | null;
      origin: EventOrigin;
    } & PageNameResult)
  | ({ type: 'attachments.created'; origin: EventOrigin } & AttachmentCreateResult)
  | ({
      type: 'attachments.deleted';
      origin: EventOrigin;
      /** What was deleted (see `deletedAttachmentOf`). */
      deleted: AttachmentRef | null;
    } & AttachmentDeleteResult)
  | ({ type: 'metadata.updated'; origin: EventOrigin } & MetadataUpdateResult)
  | ({ type: 'metadata.customUpdated'; origin: EventOrigin } & CustomMetadataUpdateResult)
  | ({ type: 'forms.valueSet'; origin: EventOrigin } & FormSetValueResult)
  | ({ type: 'forms.repaired'; origin: EventOrigin } & FormRepairResult)
  | ({ type: 'forms.created'; origin: EventOrigin } & FormFieldCreateResult)
  | ({ type: 'forms.updated'; origin: EventOrigin } & FormFieldUpdateResult)
  | ({
      type: 'forms.deleted';
      origin: EventOrigin;
      /** The field that went (see `deletedFieldOf`). */
      deleted: FormFieldRef | null;
    } & FormFieldDeleteResult)
  | {
      /**
       * An undo brought a deleted field back: the same field and widgets,
       * under the refs they had, at their places, with its value.
       */
      type: 'forms.restored';
      origin: EventOrigin;
      field: FormFieldDTO;
      widgets: WidgetAnnotation[];
      meta: FormMutationMeta;
    }
  | ({ type: 'forms.widgetAdded'; origin: EventOrigin } & FormWidgetLinkResult)
  | ({ type: 'forms.widgetRemoved'; origin: EventOrigin } & FormWidgetLinkResult)
  | ({ type: 'forms.widgetDeleted'; origin: EventOrigin } & FormWidgetDeleteResult)
  | ({
      /** An undo brought a deleted widget back: onto its page at its place, into its field. */
      type: 'forms.widgetRestored';
      origin: EventOrigin;
    } & FormWidgetRestoreResult)
  | ({ type: 'forms.widgetUpdated'; origin: EventOrigin } & FormWidgetUpdateResult)
  | ({
      /** A stacking-order change: the page's widgets in their new order. */
      type: 'forms.widgetsReordered';
      origin: EventOrigin;
    } & FormWidgetsReorderResult)
  | ({
      /** A calculation-order change: the form's whole new order. */
      type: 'forms.calculationsReordered';
      origin: EventOrigin;
    } & FormCalculationsReorderResult)
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
  | ({
      /** A signing candidate was parked: the document is read-only until it completes or is cancelled. */
      type: 'signatures.prepared';
      field: FormFieldRef;
      origin: EventOrigin;
    } & SignaturePrepared)
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
