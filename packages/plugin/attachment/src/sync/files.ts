/**
 * How the document's attachments change: `foldFiles` applies one confirmed
 * event, the mirror's `fold`; `predictFiles` applies one op of a pending
 * change by the engine's rules, the mirror's `predict`; `undoOf` says what
 * undoing ops looks like. Pure.
 */
import type { PredictedOp } from '@embedpdf/core';
import {
  toAttachmentRef,
  type Attachment,
  type ChangeOp,
  type DocumentEvent,
} from '@embedpdf/engine-core/runtime';

import type { DocumentFiles } from '../model';

type CreateOp = Extract<ChangeOp, { type: 'attachments.create' }>;

/** The files with each `index` its position, keeping the files whose position held. */
function indexed(files: readonly Attachment[]): readonly Attachment[] {
  return files.map((file, index) => (file.index === index ? file : { ...file, index }));
}

const has = (files: readonly Attachment[], key: string): boolean =>
  files.some((file) => file.ref.key === key);

/**
 * The files with `attachment` among them, before the first key that sorts
 * after its own, as the name tree puts a new entry; one with its key gives
 * way to it.
 */
function withFile(files: readonly Attachment[], attachment: Attachment): readonly Attachment[] {
  const key = attachment.ref.key;
  const rest = files.filter((file) => file.ref.key !== key);
  const at = rest.findIndex((file) => file.ref.key > key);
  return indexed(
    at < 0 ? [...rest, attachment] : [...rest.slice(0, at), attachment, ...rest.slice(at)],
  );
}

function withoutFile(files: readonly Attachment[], key: string): readonly Attachment[] {
  return has(files, key) ? indexed(files.filter((file) => file.ref.key !== key)) : files;
}

/* ── confirmed events ────────────────────────────────────────────────────── */

/** One confirmed event, applied with the record it carries. Before the first load there is nothing to apply it to. */
export function foldFiles(files: DocumentFiles, event: DocumentEvent): DocumentFiles {
  if (!files) return files;
  switch (event.type) {
    case 'attachments.created':
    case 'attachments.restored':
      return withFile(files, event.attachment);
    case 'attachments.deleted':
      return event.deleted ? withoutFile(files, event.deleted.key) : files;
    default:
      return files;
  }
}

/* ── pending changes ─────────────────────────────────────────────────────── */

/** A file a create adds, as it shows until the engine answers: what the op says of it, and its size. */
function predictedFile(op: CreateOp): Attachment {
  const bytes = op.resources.file;
  return {
    ref: toAttachmentRef(op.file.name),
    index: 0,
    name: op.file.name,
    mimeType: op.file.mimeType ?? null,
    description: op.file.description ?? null,
    size: bytes === undefined ? null : bytes instanceof Uint8Array ? bytes.byteLength : bytes.size,
    checksum: null,
    createdAt: null,
    modifiedAt: null,
  };
}

/**
 * One op of a change this session staged, shown before the engine answers,
 * by the engine's rules: a create of a name a file has, a delete of a file
 * that isn't there, and a restore of a name a file has change nothing.
 */
export function predictFiles(files: DocumentFiles, op: PredictedOp): DocumentFiles {
  if (!files) return files;
  switch (op.type) {
    case 'attachments.create':
      return has(files, op.file.name) ? files : withFile(files, predictedFile(op));
    case 'attachments.delete':
      return withoutFile(files, op.ref.key);
    case 'attachments.restore':
      return has(files, op.attachment.ref.key) ? files : withFile(files, op.attachment);
    default:
      return files;
  }
}

/** What undoing one op looks like, read off the files it applies to. */
function undoOfOp(files: readonly Attachment[], op: ChangeOp): PredictedOp[] {
  switch (op.type) {
    case 'attachments.create':
      return [{ type: 'attachments.delete', ref: toAttachmentRef(op.file.name) }];
    case 'attachments.delete': {
      const attachment = files.find((file) => file.ref.key === op.ref.key);
      return attachment ? [{ type: 'attachments.restore', attachment }] : [];
    }
    default:
      return [];
  }
}

/**
 * What undoing `ops` looks like, read off the files they apply to, each op
 * on the files the ops before it leave; the last op is undone first.
 */
export function undoOf(files: DocumentFiles, ops: readonly ChangeOp[]): PredictedOp[] {
  if (!files) return [];
  const undo: PredictedOp[][] = [];
  let current = files;
  for (const op of ops) {
    undo.push(undoOfOp(current, op));
    current = predictFiles(current, op) ?? current;
  }
  return undo.reverse().flat();
}
