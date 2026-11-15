import type { ValidationInfo } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { readValidationStore } from './internal/validationStore';
import type { DocumentSession } from '../../document-session/DocumentSession';

/**
 * Reads the validation data a document holds (its security store, `/DSS`).
 * Unlike the signature model, this is the document as it is now: what a
 * write added and no save has written yet is part of it.
 */
export class ValidationInfoReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  read(): ValidationInfo {
    return readValidationStore(this.runtime, this.session.requireDocPtr());
  }
}
