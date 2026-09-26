import {
  annotationImportFacts,
  deletedAnnotationOf,
  deletedAttachmentOf,
  deletedFieldOf,
  toPageRef,
  type AnnotationCreateResult,
  type AnnotationImportResult,
  type AnnotationDeleteResult,
  type AnnotationMoveResult,
  type AnnotationUpdateResult,
  type AttachmentCreateResult,
  type AttachmentDeleteResult,
  type DocumentEvent,
  type EventOrigin,
  type FormFieldCreateResult,
  type FormFieldDeleteResult,
  type FormFieldUpdateResult,
  type FormEffectsResult,
  type FormImportResult,
  type FormRepairResult,
  type FormSetValueResult,
  type FormWidgetLinkResult,
  type MetadataUpdateResult,
  type PageDeleteResult,
  type PageFlattenResult,
  type PageInsertResult,
  type PageMoveResult,
  type PageRotateResult,
  type PageRotation,
  type PageScaleResult,
  type FormFieldRef,
  type SignatureCompleteResult,
} from '@embedpdf/engine-core/runtime';
import { decodePrepared, type SignaturePreparedWire } from '@embedpdf/engine-core/wire';

/** The SSE `mutation` event body — the audit row in JSON (the server's
 *  `toJsonlEvent` shape). `payload` is byte-identical to what the mutating
 *  caller received as its HTTP response. */
export interface AuditEventRow {
  id: number;
  ts: number;
  sub: string;
  kind: string;
  pageObjectNumber: number | null;
  affectedPages: number[];
  originSessionId: string | null;
  /** The request's `Idempotency-Key`, when it named the change. */
  idempotencyKey?: string | null;
  payload: unknown;
}

/**
 * Translate a remote audit row into the `DocumentEvent`s it records — pure,
 * so the exactly-once and verbatim-payload invariants are unit-testable
 * without a server. Most rows are one fact; an import is one
 * `annotations.created` per annotation, sharing `origin.tx` (its id the
 * request's `Idempotency-Key`). Returns none for an own echo and for kinds
 * this engine version doesn't know (a newer server's events degrade to
 * "ignored", never to a crash).
 *
 * Context-field fidelity differs by op, by design of the audit row:
 *   - rotate/delete: `affectedPages` is exactly the op's page set; rotation
 *     is recovered from the layout (it's absolute — every affected page
 *     carries the value).
 *   - move: the originator knows which block it moved; the audit row only
 *     records the resulting order, so `pages` is the full new order and
 *     `toIndex` is absent (remote consumers use `layout`).
 *
 * The audit row keys pages by object number (its storage identity); the
 * event carries them as `PageRef` addresses, like every other event.
 */
export function auditRowToEvents(row: AuditEventRow, mySessionId: string): DocumentEvent[] {
  if (row.originSessionId === mySessionId) return []; // own echo — local publish covered it

  const origin: EventOrigin = {
    kind: 'remote',
    sessionId: row.originSessionId ?? `unknown:${row.sub}`,
    sub: row.sub,
    ts: row.ts,
    serverId: row.id,
  };
  if (row.kind === 'annot.import') {
    const facts = annotationImportFacts(row.payload as AnnotationImportResult);
    const id = row.idempotencyKey ?? `audit:${row.id}`;
    return facts.map((fact, index) => ({
      type: 'annotations.created',
      origin: { ...origin, tx: { id, index, count: facts.length } },
      ...fact,
    }));
  }
  if (row.kind === 'signature.complete') {
    // A completion is two facts, as locally: the sealed signature, and the
    // document on a new version.
    const { signingId, ...result } = row.payload as { signingId: string } & SignatureCompleteResult;
    return [
      { type: 'signatures.completed', origin, signingId, ...result },
      { type: 'document.versioned', origin, version: result.version },
    ];
  }
  const event = eventOf(row, origin);
  return event ? [event] : [];
}

/** The one event a single-fact row records, or `null` for a kind this version doesn't know. */
function eventOf(row: AuditEventRow, origin: EventOrigin): DocumentEvent | null {
  // The row's page: its explicit column, else the first affected page.
  const rowPage = () => toPageRef(row.pageObjectNumber ?? row.affectedPages[0] ?? 0);
  const affectedPages = () =>
    row.affectedPages.map((pageObjectNumber) => toPageRef(pageObjectNumber));

  switch (row.kind) {
    case 'measure.setScale':
      return { type: 'pages.scaleSet', origin, ...(row.payload as PageScaleResult) };
    case 'annot.create':
      return {
        type: 'annotations.created',
        page: rowPage(),
        origin,
        ...(row.payload as AnnotationCreateResult),
      };
    case 'annot.update':
      return {
        type: 'annotations.updated',
        page: rowPage(),
        origin,
        ...(row.payload as AnnotationUpdateResult),
      };
    case 'annot.delete':
      return {
        type: 'annotations.deleted',
        page: rowPage(),
        origin,
        deleted: deletedAnnotationOf(row.payload as AnnotationDeleteResult),
        ...(row.payload as AnnotationDeleteResult),
      };
    case 'annot.move':
      return {
        type: 'annotations.moved',
        page: rowPage(),
        origin,
        ...(row.payload as AnnotationMoveResult),
      };
    case 'pages.move':
      return {
        type: 'pages.moved',
        pages: affectedPages(),
        origin,
        ...(row.payload as PageMoveResult),
      };
    case 'pages.rotate': {
      const payload = row.payload as PageRotateResult;
      const rotation = (payload.layout.pages.find(
        (page) => page.ref.pageObjectNumber === row.affectedPages[0],
      )?.rotation ?? 0) as PageRotation;
      return {
        type: 'pages.rotated',
        pages: affectedPages(),
        rotation,
        origin,
        ...payload,
      };
    }
    case 'pages.delete':
      return {
        type: 'pages.deleted',
        pages: affectedPages(),
        origin,
        ...(row.payload as PageDeleteResult),
      };
    // Two audit kinds share the `pages.inserted` event (bytes-import and
    // blank creation produce the same result shape) — the audit log keeps
    // them distinct for history, the event stream cares about effect. The
    // originator's `toIndex` gesture field stays absent on remote events
    // by design: remote consumers derive placement from `layout`.
    case 'pages.insert':
    case 'pages.insertBlank':
      return {
        type: 'pages.inserted',
        origin,
        ...(row.payload as PageInsertResult),
      };
    case 'pages.flatten':
      return {
        type: 'pages.flattened',
        origin,
        ...(row.payload as PageFlattenResult),
      };
    case 'metadata.update':
      return {
        type: 'metadata.updated',
        origin,
        ...(row.payload as MetadataUpdateResult),
      };
    case 'attachment.create':
      return {
        type: 'attachments.created',
        origin,
        ...(row.payload as AttachmentCreateResult),
      };
    case 'attachment.delete':
      return {
        type: 'attachments.deleted',
        origin,
        deleted: deletedAttachmentOf(row.payload as AttachmentDeleteResult),
        ...(row.payload as AttachmentDeleteResult),
      };
    // Form mutations: two audit kinds share the `forms.valueSet` event
    // (setValue and reset produce the same result shape) — the audit log
    // keeps them distinct for history, the event stream cares about effect.
    case 'form.setValue':
    case 'form.reset':
      return { type: 'forms.valueSet', origin, ...(row.payload as FormSetValueResult) };
    case 'form.import':
      return { type: 'forms.imported', origin, ...(row.payload as FormImportResult) };
    case 'form.repair':
      return { type: 'forms.repaired', origin, ...(row.payload as FormRepairResult) };
    case 'form.createField':
      return { type: 'forms.created', origin, ...(row.payload as FormFieldCreateResult) };
    case 'form.updateField':
    case 'form.setSignatureAppearance':
      return { type: 'forms.updated', origin, ...(row.payload as FormFieldUpdateResult) };
    case 'form.deleteField': {
      const result = row.payload as FormFieldDeleteResult;
      return { type: 'forms.deleted', origin, deleted: deletedFieldOf(result), ...result };
    }
    case 'form.attachWidget':
      return { type: 'forms.widgetAdded', origin, ...(row.payload as FormWidgetLinkResult) };
    case 'form.detachWidget':
      return { type: 'forms.widgetRemoved', origin, ...(row.payload as FormWidgetLinkResult) };
    case 'form.applyEffects':
      return { type: 'forms.effectsApplied', origin, ...(row.payload as FormEffectsResult) };
    case 'signature.prepare': {
      const { field, ...wire } = row.payload as { field: FormFieldRef } & SignaturePreparedWire;
      return { type: 'signatures.prepared', origin, field, ...decodePrepared(wire) };
    }
    case 'signature.cancel':
      return {
        type: 'signatures.cancelled',
        origin,
        signingId: (row.payload as { signingId: string }).signingId,
      };
    default:
      return null;
  }
}
