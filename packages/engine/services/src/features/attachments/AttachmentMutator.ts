import type {
  Attachment,
  AttachmentCreateResult,
  AttachmentDeleteResult,
  AttachmentFileBase,
  AttachmentMutationMeta,
  AttachmentRef,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, toAttachmentRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import {
  readAttachmentFileInfo,
  resolveAttachmentIndex,
  writeAttachmentFilePayload,
} from './internal/attachmentPrimitives';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

/**
 * Create/delete writes over the document catalog's `/EmbeddedFiles` name
 * tree, sharing the write path (`writeAttachmentFilePayload`) with the
 * file-attachment annotation writer. The change ops run them
 * (`attachmentChanges.ts`), which decide what an undo needs.
 *
 * Identity is the name-tree key (unique by construction). Note the
 * tree is key-sorted: both writes shift other entries' indices; keys
 * never move.
 */
export class AttachmentMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * Create an embedded file from `bytes`. `file.name` becomes the tree key
   * (PDFium writes key = /UF = /F); a duplicate key rejects with
   * `InvalidArg`. The result carries the read-back entry,
   * `checksum`/`size`/dates included.
   */
  create(
    file: AttachmentFileBase,
    bytes: ArrayBuffer | undefined,
    signal: AbortSignal,
  ): AttachmentCreateResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    if (!bytes) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'an attachments.create op needs its bytes as its file resource',
        { details: { field: 'resources.file' } },
      );
    }
    if (file.name.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'attachment file requires a name');
    }

    // Duplicate keys are an identity violation, not a replace.
    // (FPDFDoc_AddAttachment would also refuse, but a probe first gives
    // the caller a precise error instead of a generic native failure.)
    if (resolveAttachmentIndex(fn, mem, docPtr, { kind: 'key', key: file.name }) !== -1) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `an embedded file with key '${file.name}' already exists — keys are unique; rename and retry`,
      );
    }

    throwIfAborted(signal);
    const namePtr = mem.writeU16String(file.name);
    let attachmentPtr: Ptr;
    try {
      attachmentPtr = fn.FPDFDoc_AddAttachment(docPtr, namePtr);
    } finally {
      mem.free(namePtr);
    }
    if (!attachmentPtr) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDFDoc_AddAttachment returned NULL');
    }

    writeAttachmentFilePayload(fn, mem, attachmentPtr, docPtr, file, {
      bytes,
      ...(file.mimeType !== undefined ? { mimeType: file.mimeType } : {}),
      name: file.name,
    });

    // Read back the materialised entry at its (name-sorted) position.
    const ref = toAttachmentRef(file.name);
    const attachment = this.find(ref);
    if (!attachment) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'created attachment did not resolve by key after the write',
      );
    }
    return { attachment, meta: this.meta(ref) };
  }

  /** The entry under `ref`'s key as it reads now; `null` when no file has the key. */
  find(ref: AttachmentRef): Attachment | null {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const index = resolveAttachmentIndex(fn, mem, docPtr, ref);
    const attachmentPtr = index < 0 ? null : fn.FPDFDoc_GetAttachment(docPtr, index);
    if (!attachmentPtr) return null;
    return { ...readAttachmentFileInfo(fn, mem, attachmentPtr), ref, index };
  }

  /** A write's meta, naming the file it changed. Cloud coherence pins are a server concern. */
  meta(ref: AttachmentRef): AttachmentMutationMeta {
    return { affectedPages: [], cacheDelta: null, ...this.session.writeStamp(), changed: [ref] };
  }

  /** Delete an embedded file by key. Unlinks the tree entry only. */
  delete(ref: AttachmentRef, signal: AbortSignal): AttachmentDeleteResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    const index = resolveAttachmentIndex(fn, mem, docPtr, ref);
    if (index < 0) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no embedded file with key '${ref.key}' in the document`,
      );
    }
    if (!fn.FPDFDoc_DeleteAttachment(docPtr, index)) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDFDoc_DeleteAttachment returned false');
    }
    return { meta: this.meta(ref) };
  }
}
