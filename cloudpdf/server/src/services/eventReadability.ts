/**
 * Whether one event-stream connection can read an audit row at all.
 *
 * A client reads the kinds of row, and the kinds of change item, that its
 * version has (docs/conventions/api-evolution.md, "Adding a change kind"). A
 * row it can't read goes out as `full-refresh` in the row's place: the client
 * reads the document again, which every 3.x client does.
 */
import { changeKindsUnknownTo, lacksWhatArrivedIn } from '@embedpdf/engine-core/wire';

import type { StreamRow } from './eventVisibility';
import type { AuditMutationKind } from '../db/repos/audit_log.repo';

/**
 * The version each kind of audit row arrived in. Every kind is named, so a
 * new one doesn't compile without its version.
 */
const ROW_KIND_SINCE: Record<AuditMutationKind, string> = {
  'measure.setScale': '3.0',
  'annot.create': '3.0',
  'annot.update': '3.0',
  'annot.delete': '3.0',
  'annot.reorder': '3.0',
  'annot.import': '3.0',
  'pages.reorder': '3.0',
  'pages.flatten': '3.0',
  'redaction.apply': '3.0',
  'metadata.update': '3.0',
  'metadata.updateCustom': '3.0',
  'form.setValue': '3.0',
  'form.reset': '3.0',
  'form.import': '3.0',
  'form.importValues': '3.0',
  'form.repair': '3.0',
  'form.createField': '3.0',
  'form.updateField': '3.0',
  'form.deleteField': '3.0',
  'form.addWidget': '3.0',
  'form.detachWidget': '3.0',
  'form.updateWidget': '3.0',
  'form.reorderWidgets': '3.0',
  'form.reorderCalculations': '3.0',
  'form.deleteWidget': '3.0',
  'form.setSignatureAppearance': '3.0',
  'signature.prepare': '3.0',
  'signature.cancel': '3.0',
  'signature.complete': '3.0',
  change: '3.0',
};

/** The version a kind of row arrived in; `null` for a kind this server doesn't have. */
const rowKindSince = (kind: string): string | null =>
  Object.hasOwn(ROW_KIND_SINCE, kind) ? ROW_KIND_SINCE[kind as AuditMutationKind] : null;

/**
 * Whether a connection that speaks `version` (its `EmbedPDF-Version`; `null`
 * when it sent none) can't read `row`, as the connection may see it: a kind
 * of row newer than the connection, or a change with an item of a kind newer
 * than it. A kind this server doesn't have, written by a newer replica, is
 * one only a newer client reads.
 *
 * A withheld row holds only its pins, which every client reads.
 */
export function unreadableBy(version: string | null, row: StreamRow): boolean {
  if (row.withheld === true) return false;
  if (lacksWhatArrivedIn(version, rowKindSince(row.kind))) return true;
  if (row.kind !== 'change') return false;
  const items = ((row.payload as { items?: unknown } | null)?.items ?? []) as {
    type?: unknown;
    op?: unknown;
  }[];
  // What an undo left alone names the kind it would have been.
  const kinds = items.map((item) => String(item.type === 'skipped' ? item.op : item.type));
  return changeKindsUnknownTo(version, kinds).length > 0;
}
