import type {
  FormDataFormat,
  FormFieldDTO,
  FormFieldRef,
  FormSnapshot,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { withScratch } from '../../runtime/memory/scratch';
import { acquireFormModel } from './internal/formModelCache';
import { readFieldAt, readFormSnapshot } from './internal/readFormSnapshot';
import { resolveFieldRef } from './internal/resolveFieldRef';

/**
 * Read side of the forms feature. All reads go through the session's
 * version-keyed model cache, so repeated reads between mutations reuse
 * one native snapshot build.
 */
export class FormReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  snapshot(signal: AbortSignal): FormSnapshot {
    throwIfAborted(signal);
    const model = acquireFormModel(this.runtime, this.session);
    return readFormSnapshot(this.runtime, model, this.session.requireDocPtr());
  }

  field(ref: FormFieldRef, signal: AbortSignal): FormFieldDTO {
    throwIfAborted(signal);
    const model = acquireFormModel(this.runtime, this.session);
    const { fieldIndex } = resolveFieldRef(this.runtime, model, ref);
    return readFieldAt(this.runtime, model, fieldIndex, this.session.requireDocPtr());
  }

  /**
   * Serialize form data. Exports read the reconciled view (recovered
   * fields included; on layers, promoted values win) straight from the
   * document — the model cache is not involved.
   */
  exportData(
    format: FormDataFormat,
    signal: AbortSignal,
  ): { format: FormDataFormat; bytes: ArrayBuffer } {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const call = format === 'fdf' ? fn.EPDFForm_ExportFDF : fn.EPDFForm_ExportXFDF;

    const length = call(docPtr, NULL_PTR, 0, NULL_PTR, 0);
    if (length <= 0) {
      throw new EngineError(EngineErrorCode.Unknown, `form ${format} export failed`);
    }
    return withScratch(mem, length, (buf) => {
      const written = call(docPtr, NULL_PTR, 0, buf, length);
      if (written !== length) {
        throw new EngineError(EngineErrorCode.Unknown, `form ${format} export failed`);
      }
      const view = mem.readBytes(buf, length);
      const bytes = new ArrayBuffer(view.byteLength);
      new Uint8Array(bytes).set(view);
      return { format, bytes };
    });
  }
}
