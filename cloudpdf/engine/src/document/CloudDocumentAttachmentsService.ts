import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type AttachmentList,
  type AttachmentRef,
  type AttachmentWriteVerb,
  type DocumentAttachmentsService,
} from '@embedpdf/engine-core/runtime';
import { AttachmentListSchema, wirePaths } from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

/**
 * The reads of document-level attachments (the catalog's `/EmbeddedFiles`
 * name tree) on the cloud engine; `create` and `delete` are changes
 * (`attachmentVerbs`, through `POST …/changes`). Reads use immutable leaves
 * pinned by the manifest's `attachmentsVersion`: `/attachments@…` for the
 * metadata listing and `/attachment-files/…@…` for one file's decoded
 * bytes — a separate capability tier, so a CDN credential for the listing
 * can never egress content.
 */
export class CloudDocumentAttachmentsService implements Omit<
  DocumentAttachmentsService,
  AttachmentWriteVerb
> {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  /**
   * Snapshot of the name tree, in tree (key-sorted) order. Pulls
   * `attachmentsVersion` from the cached manifest and, on a 404 (stale
   * pointer), transparently refreshes the manifest and retries once.
   * The pin bumps only on attachment writes, so this leaf stays cached
   * across page and annotation edits.
   */
  list(): AbortablePromise<AttachmentList> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AttachmentList>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        // Plane-scope rule: the listing depends on the `attachments` plane —
        // while inherited, one CDN object serves every visitor's sidebar
        // from the base worker session.
        return planesInherited(manifest, ['attachments'])
          ? wirePaths.docAttachments(this.docId, manifest.attachmentsVersion)
          : wirePaths.layerAttachments(this.docId, this.layerName, manifest.attachmentsVersion);
      };
      return this.http.getJsonWithRefresh(
        buildPath,
        (raw) => AttachmentListSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
    });
  }

  /**
   * One embedded file's decoded bytes; its name and type are what the
   * listing says. Same versioned-leaf + refresh-retry rails as
   * {@link list}. The server's limit on decoded size applies.
   */
  download(ref: AttachmentRef): AbortablePromise<Uint8Array> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        // Same plane switch as list(): the byte leaf shares too.
        return planesInherited(manifest, ['attachments'])
          ? wirePaths.docAttachmentFile(this.docId, ref.key, manifest.attachmentsVersion)
          : wirePaths.layerAttachmentFile(
              this.docId,
              this.layerName,
              ref.key,
              manifest.attachmentsVersion,
            );
      };
      const file = await this.http.getFileWithRefresh(
        buildPath,
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
      return file.bytes;
    });
  }
}
