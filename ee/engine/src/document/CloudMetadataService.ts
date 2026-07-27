import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentMetadata,
  type MetadataPatch,
  type MetadataService,
  type MetadataUpdateResult,
} from '@embedpdf/engine-core/runtime';
import {
  DocumentMetadataSchema,
  MetadataUpdateResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

export class CloudMetadataService implements MetadataService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
  ) {}

  /**
   * Document metadata read. The Info-dict JSON lives at the
   * content-addressed `/metadata@metadataVersion=N` leaf (not in the
   * manifest); the manifest only publishes the `metadataVersion` pointer.
   * So `read()` pulls `metadataVersion` from the cached manifest, fetches
   * the leaf, and on a 404 (stale pointer) transparently refreshes the
   * manifest and retries once. `metadataVersion` bumps only on metadata
   * writes, so this leaf stays cached across page and annotation edits.
   */
  read(): AbortablePromise<DocumentMetadata> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<DocumentMetadata>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        return wirePaths.layerMetadata(this.docId, this.layerName, manifest.metadataVersion);
      };
      return this.http.getJsonWithRefresh(
        buildPath,
        (raw) => DocumentMetadataSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
    });
  }

  update(patch: MetadataPatch): AbortablePromise<MetadataUpdateResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<MetadataUpdateResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerMetadataUpdate(this.docId, this.layerName),
        patch,
        (raw) => MetadataUpdateResultSchema.parse(raw),
        signal,
      );
      // A metadata write only advances docVersion + metadataVersion (no
      // per-page pin changes, no layoutVersion), so the cached manifest can
      // be patched in place — no refetch.
      if (result.cache) this.manifest.applyMetadata(result.cache);
      this.publisher.publishLocal({ type: 'metadata.updated', ...result });
      return result;
    });
  }
}
