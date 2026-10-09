import {
  changeEvents,
  formImportFacts,
  formResetFacts,
  formValuesImportFacts,
  annotationImportFacts,
  deletedAnnotationsOf,
  deletedAttachmentOf,
  deletedFieldOf,
  toPageRef,
  type AnnotationCreateResult,
  type AnnotationImportResult,
  type AnnotationDeleteResult,
  type AnnotationReorderResult,
  type AnnotationUpdateResult,
  type AttachmentCreateResult,
  type AttachmentDeleteResult,
  type ChangeResult,
  type DocumentEvent,
  type EventOrigin,
  type FormFieldCreateResult,
  type FormFieldDeleteResult,
  type FormFieldUpdateResult,
  type FormEffectsResult,
  type FormImportResult,
  type FormValuesImportResult,
  type FormRepairResult,
  type FormResetResult,
  type FormSetValueResult,
  type FormWidgetLinkResult,
  type FormWidgetDeleteResult,
  type FormWidgetUpdateResult,
  type FormWidgetsReorderResult,
  type FormCalculationsReorderResult,
  type MetadataUpdateResult,
  type CustomMetadataUpdateResult,
  type PageDeleteResult,
  type PageFlattenResult,
  type PageInsertResult,
  type PageReorderResult,
  type PageRotateResult,
  type PdfRotation,
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
  /** On a change that undid another: the `opId` of the change it undid. */
  undoOf?: string | null;
  /**
   * The change holds nothing this connection may read: `payload` is only
   * `{ meta: { cacheDelta } }`, its pins.
   */
  withheld?: boolean;
  payload: unknown;
}

/**
 * Translate a remote audit row into the `DocumentEvent`s it records — pure,
 * so the exactly-once and verbatim-payload invariants are unit-testable
 * without a server. Most rows are one fact; a change is the events of its
 * items, a form reset is one `forms.valueSet` per field it changed, an
 * import is one `annotations.created` per annotation, and a completed
 * signing is the signature and the new version. An undo's events name the
 * change it undid (`origin.undoOf`). Every event of a row shares `origin.tx`,
 * its id the request's `Idempotency-Key`. Returns none for an own echo and for kinds
 * this engine version doesn't know (a newer server's events degrade to
 * "ignored", never to a crash).
 *
 * Context-field fidelity differs by op, by design of the audit row:
 *   - rotate/delete: `affectedPages` is exactly the op's page set; rotation
 *     is recovered from the layout (it's absolute — every affected page
 *     carries the value).
 *   - reorder: the payload is the result, as the originator got it: the
 *     pages that moved and the new `layout`.
 *
 * The audit row keys pages by object number (its storage identity); the
 * event carries them as `PageRef` addresses, like every other event.
 */
export function auditRowToEvents(row: AuditEventRow, mySessionId: string): DocumentEvent[] {
  if (row.originSessionId === mySessionId) return []; // own echo — local publish covered it
  if (row.withheld) return []; // nothing this connection may read: no facts, only pins

  const origin: EventOrigin = {
    kind: 'remote',
    sessionId: row.originSessionId ?? `unknown:${row.sub}`,
    sub: row.sub,
    ts: row.ts,
    serverId: row.id,
    ...(row.undoOf ? { undoOf: row.undoOf } : {}),
  };
  // Every event of the write shares its id: the request's `Idempotency-Key`,
  // or the row's own id when it came without one.
  const id = row.idempotencyKey ?? `audit:${row.id}`;
  const events = factsOf(row, origin);
  return events.map((event, index) => ({
    ...event,
    origin: { ...origin, tx: { id, index, count: events.length } },
  }));
}

/** The events a row records, in order, or none for a kind this version doesn't know. */
function factsOf(row: AuditEventRow, origin: EventOrigin): DocumentEvent[] {
  if (row.kind === 'change') {
    // A change is the events its items publish, in op order, as locally.
    return changeEvents(row.payload as ChangeResult).map(
      (event) => ({ ...event, origin }) as DocumentEvent,
    );
  }
  if (row.kind === 'annot.import') {
    return annotationImportFacts(row.payload as AnnotationImportResult).map((fact) => ({
      type: 'annotations.created',
      origin,
      ...fact,
    }));
  }
  if (row.kind === 'form.import') {
    // One `forms.created` per field the import made, as locally.
    return formImportFacts(row.payload as FormImportResult).map((fact) => ({
      type: 'forms.created',
      origin,
      ...fact,
    }));
  }
  if (row.kind === 'form.importValues') {
    // One `forms.valueSet` per field the import filled, as locally.
    return formValuesImportFacts(row.payload as FormValuesImportResult).map((fact) => ({
      type: 'forms.valueSet',
      origin,
      ...fact,
    }));
  }
  if (row.kind === 'form.reset') {
    // One `forms.valueSet` per field the reset changed, as locally.
    return formResetFacts(row.payload as FormResetResult).map((fact) => ({
      type: 'forms.valueSet',
      origin,
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
        deleted: deletedAnnotationsOf(row.payload as AnnotationDeleteResult),
        ...(row.payload as AnnotationDeleteResult),
      };
    case 'annot.reorder':
      return {
        type: 'annotations.reordered',
        page: rowPage(),
        origin,
        ...(row.payload as AnnotationReorderResult),
      };
    case 'pages.reorder':
      return { type: 'pages.reordered', origin, ...(row.payload as PageReorderResult) };
    case 'pages.rotate': {
      const payload = row.payload as PageRotateResult;
      const rotation = (payload.layout.pages.find(
        (page) => page.ref.objectNumber === row.affectedPages[0],
      )?.rotation ?? 0) as PdfRotation;
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
    // them distinct for history, the event stream cares about effect.
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
    case 'metadata.updateCustom':
      return {
        type: 'metadata.customUpdated',
        origin,
        ...(row.payload as CustomMetadataUpdateResult),
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
    // A value write is one `forms.valueSet`; a reset and an import are one
    // per field they changed (above).
    case 'form.setValue':
      return { type: 'forms.valueSet', origin, ...(row.payload as FormSetValueResult) };
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
    case 'form.addWidget':
      return { type: 'forms.widgetAdded', origin, ...(row.payload as FormWidgetLinkResult) };
    case 'form.detachWidget':
      return { type: 'forms.widgetRemoved', origin, ...(row.payload as FormWidgetLinkResult) };
    case 'form.updateWidget':
      return { type: 'forms.widgetUpdated', origin, ...(row.payload as FormWidgetUpdateResult) };
    case 'form.deleteWidget':
      return { type: 'forms.widgetDeleted', origin, ...(row.payload as FormWidgetDeleteResult) };
    case 'form.reorderWidgets':
      return {
        type: 'forms.widgetsReordered',
        origin,
        ...(row.payload as FormWidgetsReorderResult),
      };
    case 'form.reorderCalculations':
      return {
        type: 'forms.calculationsReordered',
        origin,
        ...(row.payload as FormCalculationsReorderResult),
      };
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
