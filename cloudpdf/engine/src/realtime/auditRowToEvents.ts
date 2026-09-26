import {
  annotationImportFacts,
  deletedAnnotationOf,
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
} from '@embedpdf/engine-core/runtime';

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
 * `annotation.created` per annotation, sharing `origin.tx` (its id the
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
 *     `destIndex` is absent (remote consumers use `layout`).
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
      type: 'annotation.created',
      origin: { ...origin, tx: { id, index, count: facts.length } },
      ...fact,
    }));
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
      return { type: 'page.viewportsChanged', origin, ...(row.payload as PageScaleResult) };
    case 'annot.create':
      return {
        type: 'annotation.created',
        page: rowPage(),
        origin,
        ...(row.payload as AnnotationCreateResult),
      };
    case 'annot.update':
      return {
        type: 'annotation.updated',
        page: rowPage(),
        origin,
        ...(row.payload as AnnotationUpdateResult),
      };
    case 'annot.delete':
      return {
        type: 'annotation.deleted',
        page: rowPage(),
        origin,
        deleted: deletedAnnotationOf(row.payload as AnnotationDeleteResult),
        ...(row.payload as AnnotationDeleteResult),
      };
    case 'annot.move':
      return {
        type: 'annotation.moved',
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
    // originator's `destIndex` gesture field stays absent on remote events
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
        type: 'attachment.created',
        origin,
        ...(row.payload as AttachmentCreateResult),
      };
    case 'attachment.delete':
      return {
        type: 'attachment.deleted',
        origin,
        ...(row.payload as AttachmentDeleteResult),
      };
    // Form mutations: two audit kinds share the `form.valueChanged` event
    // (setValue and reset produce the same result shape) — the audit log
    // keeps them distinct for history, the event stream cares about effect.
    case 'form.setValue':
    case 'form.reset':
      return { type: 'form.valueChanged', origin, ...(row.payload as FormSetValueResult) };
    case 'form.import':
      return { type: 'form.imported', origin, ...(row.payload as FormImportResult) };
    case 'form.repair':
      return { type: 'form.repaired', origin, ...(row.payload as FormRepairResult) };
    case 'form.createField':
      return { type: 'form.fieldCreated', origin, ...(row.payload as FormFieldCreateResult) };
    case 'form.updateField':
    case 'form.setSignatureAppearance':
      return { type: 'form.fieldUpdated', origin, ...(row.payload as FormFieldUpdateResult) };
    case 'form.deleteField': {
      const result = row.payload as FormFieldDeleteResult;
      return { type: 'form.fieldDeleted', origin, deleted: deletedFieldOf(result), ...result };
    }
    case 'form.attachWidget':
      return { type: 'form.widgetAttached', origin, ...(row.payload as FormWidgetLinkResult) };
    case 'form.detachWidget':
      return { type: 'form.widgetDetached', origin, ...(row.payload as FormWidgetLinkResult) };
    case 'form.applyEffects':
      return { type: 'form.effectsApplied', origin, ...(row.payload as FormEffectsResult) };
    default:
      return null;
  }
}
