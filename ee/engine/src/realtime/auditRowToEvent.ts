import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationMoveResult,
  AnnotationUpdateResult,
  DocumentEvent,
  EventOrigin,
  FormFieldCreateResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormEffectsResult,
  FormImportResult,
  FormRepairResult,
  FormSetValueResult,
  FormWidgetLinkResult,
  MetadataUpdateResult,
  PageDeleteResult,
  PageFlattenResult,
  PageMoveResult,
  PageRotateResult,
  PageRotation,
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
  payload: unknown;
}

/**
 * Translate a remote audit row into a `DocumentEvent` — pure, so the
 * exactly-once and verbatim-payload invariants are unit-testable without a
 * server. Returns `null` for kinds this engine version doesn't know
 * (a NEWER server's events degrade to "ignored", never to a crash).
 *
 * Context-field fidelity differs by op, by design of the audit row:
 *   - rotate/delete: `affectedPages` is exactly the op's page set; rotation
 *     is recovered from the layout (it's absolute — every affected page
 *     carries the value).
 *   - move: the originator knows which block it moved; the audit row only
 *     records the resulting order, so `pageObjectNumbers` is the full new
 *     order and `destIndex` is absent (remote consumers use `layout`).
 */
export function auditRowToEvent(row: AuditEventRow, mySessionId: string): DocumentEvent | null {
  if (row.originSessionId === mySessionId) return null; // own echo — local publish covered it

  const origin: EventOrigin = {
    kind: 'remote',
    sessionId: row.originSessionId ?? `unknown:${row.sub}`,
    sub: row.sub,
    ts: row.ts,
    serverId: row.id,
  };

  switch (row.kind) {
    case 'annot.create':
      return {
        type: 'annotation.created',
        pageObjectNumber: row.pageObjectNumber ?? row.affectedPages[0] ?? 0,
        origin,
        ...(row.payload as AnnotationCreateResult),
      };
    case 'annot.update':
      return {
        type: 'annotation.updated',
        pageObjectNumber: row.pageObjectNumber ?? row.affectedPages[0] ?? 0,
        origin,
        ...(row.payload as AnnotationUpdateResult),
      };
    case 'annot.delete':
      return {
        type: 'annotation.deleted',
        pageObjectNumber: row.pageObjectNumber ?? row.affectedPages[0] ?? 0,
        origin,
        ...(row.payload as AnnotationDeleteResult),
      };
    case 'annot.move':
      return {
        type: 'annotation.moved',
        pageObjectNumber: row.pageObjectNumber ?? row.affectedPages[0] ?? 0,
        origin,
        ...(row.payload as AnnotationMoveResult),
      };
    case 'pages.move':
      return {
        type: 'pages.moved',
        pageObjectNumbers: row.affectedPages,
        origin,
        ...(row.payload as PageMoveResult),
      };
    case 'pages.rotate': {
      const payload = row.payload as PageRotateResult;
      const rotation = (payload.layout.pages.find(
        (page) => page.pageObjectNumber === row.affectedPages[0],
      )?.rotation ?? 0) as PageRotation;
      return {
        type: 'pages.rotated',
        pageObjectNumbers: row.affectedPages,
        rotation,
        origin,
        ...payload,
      };
    }
    case 'pages.delete':
      return {
        type: 'pages.deleted',
        pageObjectNumbers: row.affectedPages,
        origin,
        ...(row.payload as PageDeleteResult),
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
      return { type: 'form.fieldUpdated', origin, ...(row.payload as FormFieldUpdateResult) };
    case 'form.deleteField':
      return { type: 'form.fieldDeleted', origin, ...(row.payload as FormFieldDeleteResult) };
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
