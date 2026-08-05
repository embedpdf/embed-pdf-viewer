import type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
  EmbeddedFileRef,
  WireAttachmentFile,
  WireResourceMap,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import {
  readAttachmentFileInfo,
  resolveAttachmentIndex,
  writeAttachmentFilePayload,
} from './internal/attachmentPrimitives';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

/**
 * Create/delete mutations over the document catalog's `/EmbeddedFiles`
 * name tree — the doc-level sibling of `AnnotationMutator`, sharing the
 * write path (`writeAttachmentFilePayload`) with the file-attachment
 * annotation writer.
 *
 * Identity is the name-tree KEY (unique by construction), so unlike
 * annotations there is no weak-ref/revision bookkeeping here. Note the
 * tree is key-sorted: both mutations shift OTHER entries' indices; keys
 * never move. Layer persistence (`finishMutation`) and event publication
 * happen in the callers, exactly like every other mutation family.
 */
export class AttachmentMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * Create an embedded file. `file.name` becomes the tree key (PDFium
   * writes key = /UF = /F); a duplicate key rejects with `InvalidArg`.
   * The result carries the read-back entry, `checksum`/`size`/dates
   * included.
   */
  create(
    file: WireAttachmentFile,
    resources: WireResourceMap | undefined,
    signal: AbortSignal,
  ): AttachmentCreateResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    const resource = resources?.[file.resource];
    if (!resource) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `attachment file references resource '${file.resource}' but no such binary payload accompanied the mutation`,
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

    writeAttachmentFilePayload(fn, mem, attachmentPtr, docPtr, file, resource);

    // Read back the materialised entry at its (name-sorted) position.
    const index = resolveAttachmentIndex(fn, mem, docPtr, { kind: 'key', key: file.name });
    if (index < 0) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'created attachment did not resolve by key after the write',
      );
    }
    return {
      created: { ...readAttachmentFileInfo(fn, mem, attachmentPtr), key: file.name, index },
      // Cloud coherence pins are a server concern; the worker reports none.
      cache: null,
    };
  }

  /** Delete an embedded file by key. Unlinks the tree entry only. */
  delete(ref: EmbeddedFileRef, signal: AbortSignal): AttachmentDeleteResult {
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
    return { deleted: ref, cache: null };
  }
}
