import type { FormEffectsResult } from '../forms/effects';
import type { PdfRotation } from '../geometry/primitives';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
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
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import type { PageFlattenResult, PageFlattenUsage } from '../mutation/PageFlattenResult';
import type { PageInsertResult } from '../mutation/PageInsertResult';
import type { PageMoveResult } from '../mutation/PageMoveResult';
import type { PageRotateResult } from '../mutation/PageRotateResult';

/**
 * Provenance of a `DocumentEvent` — WHOSE HAND caused the mutation, never
 * which transport delivered it (transport is invisible by design).
 *
 * `kind: 'local'` means caused by THIS ENGINE INSTANCE — not "this user".
 * The same user in two tabs is two sessions: tab A's mutation arrives in
 * tab B as `'remote'` (with the same `sub`). Rule of thumb for consumers:
 * "is this MY ACTION" → check `kind` / `sessionId` (undo stacks, optimism
 * reconciliation); "is this MY USER" → check `sub` (attribution).
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
}

/**
 * The one event stream both engines speak — the model is the contract, the
 * transport differs (local: in-process after the worker confirms; cloud:
 * in-process for your own mutations, SSE for everyone else's).
 *
 * Invariants (locked — the collaboration design rests on these):
 *
 *   - EXACTLY ONCE: every mutation that touches your document appears in
 *     your stream exactly once. The engine that performs a mutation emits
 *     the event itself at confirmation time; the remote channel exists to
 *     tell everyone ELSE (own echoes are dropped by `sessionId`).
 *   - GROUND TRUTH ONLY: events fire after the mutation is confirmed —
 *     never optimistically. Optimism is a plugin concern.
 *   - RESULTS RIDE VERBATIM: each event embeds the mutation result the
 *     caller received, unmodified — which (cloud) is byte-identical to the
 *     audit-log payload. A handler sees the same fact whether it performed
 *     the mutation, watched it locally, or received it over the wire.
 *
 * Handlers updating UI/document state should be ORIGIN-AGNOSTIC ("a page
 * was removed → update the registry"); `origin` is metadata for the few
 * provenance-aware features (undo, attribution toasts, camera etiquette).
 */
export type DocumentEvent =
  | ({
      type: 'annotation.created';
      pageObjectNumber: PageObjectNumber;
      origin: EventOrigin;
    } & AnnotationCreateResult)
  | ({
      type: 'annotation.updated';
      pageObjectNumber: PageObjectNumber;
      origin: EventOrigin;
    } & AnnotationUpdateResult)
  | ({
      type: 'annotation.deleted';
      pageObjectNumber: PageObjectNumber;
      origin: EventOrigin;
    } & AnnotationDeleteResult)
  | ({
      type: 'annotation.moved';
      pageObjectNumber: PageObjectNumber;
      origin: EventOrigin;
    } & AnnotationMoveResult)
  | ({
      type: 'pages.moved';
      /** Locally: the moved block. Remotely the audit row only records the
       *  outcome, so this is the full new order — consumers should read
       *  `layout` for positions, never reconstruct the gesture. */
      pageObjectNumbers: PageObjectNumber[];
      /** The originator's insertion point; absent on remote events. */
      destIndex?: number;
      origin: EventOrigin;
    } & PageMoveResult)
  | ({
      type: 'pages.rotated';
      pageObjectNumbers: PageObjectNumber[];
      rotation: PdfRotation;
      origin: EventOrigin;
    } & PageRotateResult)
  | ({
      type: 'pages.deleted';
      /** The RETIRED pons — not derivable from the surviving `layout`. */
      pageObjectNumbers: PageObjectNumber[];
      origin: EventOrigin;
    } & PageDeleteResult)
  | ({
      type: 'pages.inserted';
      /** The originator's insertion point; absent on remote events. */
      destIndex?: number;
      origin: EventOrigin;
    } & PageInsertResult)
  | ({ type: 'attachment.created'; origin: EventOrigin } & AttachmentCreateResult)
  | ({ type: 'attachment.deleted'; origin: EventOrigin } & AttachmentDeleteResult)
  | ({ type: 'metadata.updated'; origin: EventOrigin } & MetadataUpdateResult)
  | ({ type: 'form.valueChanged'; origin: EventOrigin } & FormSetValueResult)
  | ({ type: 'form.imported'; origin: EventOrigin } & FormImportResult)
  | ({ type: 'form.repaired'; origin: EventOrigin } & FormRepairResult)
  | ({ type: 'form.fieldCreated'; origin: EventOrigin } & FormFieldCreateResult)
  | ({ type: 'form.fieldUpdated'; origin: EventOrigin } & FormFieldUpdateResult)
  | ({ type: 'form.fieldDeleted'; origin: EventOrigin } & FormFieldDeleteResult)
  | ({ type: 'form.widgetAttached'; origin: EventOrigin } & FormWidgetLinkResult)
  | ({ type: 'form.widgetDetached'; origin: EventOrigin } & FormWidgetLinkResult)
  | ({ type: 'form.effectsApplied'; origin: EventOrigin } & FormEffectsResult)
  | ({
      type: 'pages.flattened';
      pageObjectNumbers: PageObjectNumber[];
      usage: PageFlattenUsage;
      origin: EventOrigin;
    } & PageFlattenResult);

export type DocumentEventType = DocumentEvent['type'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A `DocumentEvent` before provenance is stamped — what mutation paths
 *  hand to their engine's publisher, which adds `origin`. */
export type DocumentEventInit = DistributiveOmit<DocumentEvent, 'origin'>;
