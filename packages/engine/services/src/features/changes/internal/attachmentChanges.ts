import {
  authorizeCapability,
  EngineError,
  EngineErrorCode,
  type AttachmentRef,
  type ChangeOp,
  type PdfCoordinates,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { canonicalAttachment, exportAttachment, importAttachment } from './captures';
import { leftAlone, type ChangeContext, type Done } from './changeContext';
import { bytesEqual } from '../../../shared/bytesEqual';
import { AttachmentMutator } from '../../attachments';
import type { AttachmentRemoveStep, AttachmentRestoreStep } from '../ChangeRecord';

type Op<T extends ChangeOp['type']> = Extract<
  ChangeOp<PdfCoordinates, WireAnnotationResources>,
  { type: T }
>;

const mutatorOf = (ctx: ChangeContext) => new AttachmentMutator(ctx.runtime, ctx.session);
const authorize = (ctx: ChangeContext) =>
  authorizeCapability(ctx.authority, 'doc.attachments.modify');

/** `attachments.create`; its reverse deletes the file while it is still the file this made. */
export function createAttachment(ctx: ChangeContext, op: Op<'attachments.create'>): Done {
  authorize(ctx);
  const result = mutatorOf(ctx).create(op.file, op.resources.file, ctx.signal);
  return {
    item: { type: 'attachments.create', ...result },
    reverse: [removeStepOf(ctx, result.attachment.ref)],
  };
}

/** `attachments.delete`, captured in its transaction so an undo brings back the same file. */
export function deleteAttachment(ctx: ChangeContext, op: Op<'attachments.delete'>): Done {
  authorize(ctx);
  return writeDelete(ctx, op.ref);
}

/** Deletes a file a create or a restore brought, while it reads as the change left it. */
export function removeAttachment(ctx: ChangeContext, step: AttachmentRemoveStep): Done {
  const now = canonicalAttachment(ctx.runtime, ctx.session.requireDocPtr(), step.ref.key);
  if (!now || !bytesEqual(now, step.left)) return leftAlone(ctx, 'attachments.delete');
  authorize(ctx);
  return writeDelete(ctx, step.ref);
}

/** Brings back a file a delete removed, while no file has its key. */
export function restoreAttachment(ctx: ChangeContext, step: AttachmentRestoreStep): Done {
  const mutator = mutatorOf(ctx);
  if (mutator.find(step.ref)) return leftAlone(ctx, 'attachments.restore');
  authorize(ctx);
  importAttachment(ctx.runtime, ctx.session.requireDocPtr(), step.capture);
  const attachment = mutator.find(step.ref);
  if (!attachment) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      `attachment '${step.ref.key}' did not come back`,
    );
  }
  return {
    item: { type: 'attachments.restore', attachment, meta: mutator.meta(step.ref) },
    reverse: [removeStepOf(ctx, step.ref)],
  };
}

/** Deletes the file under `ref`, captured first so its restore brings it back. */
function writeDelete(ctx: ChangeContext, ref: AttachmentRef): Done {
  const mutator = mutatorOf(ctx);
  if (!mutator.find(ref)) {
    throw new EngineError(
      EngineErrorCode.NotFound,
      `no embedded file with key '${ref.key}' in the document`,
      { details: { field: 'ref' } },
    );
  }
  const capture = exportAttachment(ctx.runtime, ctx.session.requireDocPtr(), ref.key);
  const result = mutator.delete(ref, ctx.signal);
  return {
    item: { type: 'attachments.delete', ...result },
    reverse: [{ kind: 'attachments.restore', ref, capture }],
  };
}

/** The step that deletes the file under `ref` again while it reads as it does now. */
function removeStepOf(ctx: ChangeContext, ref: AttachmentRef): AttachmentRemoveStep {
  const left = canonicalAttachment(ctx.runtime, ctx.session.requireDocPtr(), ref.key);
  if (!left) {
    throw new EngineError(EngineErrorCode.Unknown, `attachment '${ref.key}' is not there to guard`);
  }
  return { kind: 'attachments.remove', ref, left };
}
