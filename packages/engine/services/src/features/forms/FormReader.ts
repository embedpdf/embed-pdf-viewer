import type {
  FormFieldDTO,
  FormFieldRef,
  FormSnapshot,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { acquireFormModel } from './internal/formModelCache';
import { readFieldAt } from './internal/readFormSnapshot';
import { resolveFieldRef } from './internal/resolveFieldRef';
import { readForm } from './internal/widgetRows';
import type { FontRegistrar } from '../fonts/FontRegistrar';

/**
 * Read side of the forms feature. Field reads go through the session's
 * version-keyed model cache, so repeated reads between mutations reuse
 * one native snapshot build; widget rows are read from the pages.
 */
export class FormReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry, for the widget rows. */
    private readonly fonts?: FontRegistrar,
  ) {}

  snapshot(signal: AbortSignal): FormSnapshot<PdfCoordinates> {
    throwIfAborted(signal);
    return readForm(this.runtime, this.session, signal, this.fonts);
  }

  field(ref: FormFieldRef, signal: AbortSignal): FormFieldDTO<PdfCoordinates> {
    throwIfAborted(signal);
    const model = acquireFormModel(this.runtime, this.session);
    const { fieldIndex } = resolveFieldRef(this.runtime, model, ref);
    return readFieldAt(this.runtime, model, fieldIndex, this.session.requireDocPtr());
  }
}
