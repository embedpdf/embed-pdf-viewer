import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentRedactionService,
  type RedactionApplyResult,
  type RedactionApplyScope,
} from '@embedpdf/engine-core/runtime';
import { RedactionApplyResultSchema, wirePaths } from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud-side redaction apply. Mirrors `LocalDocumentRedactionService` over
 * HTTP (POST /redactions/apply); the server enforces the capability gate
 * (`doc.pages.modify` + `doc.annotate.modify` + `doc.redact`) and persists
 * the rewritten layer artifact. See `DocumentRedactionService` for the
 * two-stage model and the layer trust boundary — an apply rewrites THIS
 * LAYER's bytes; the immutable base keeps the original.
 */
export class CloudDocumentRedactionService implements DocumentRedactionService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
  ) {}

  apply(scope: RedactionApplyScope): AbortablePromise<RedactionApplyResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<RedactionApplyResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerRedactionsApply(this.docId, this.layerName),
        { scope },
        (raw) => RedactionApplyResultSchema.parse(raw),
        signal,
      );
      // Nothing applied means no artifact and therefore no coherence bump.
      if (result.meta === null) return result;
      // Redaction-apply rewrites content and consumes the marks, so both
      // planes flip.
      this.manifest.apply(result.meta, ['content', 'annotations']);
      this.publisher.publishLocal({
        type: 'redaction.applied',
        ...result,
      });
      return result;
    });
  }
}
