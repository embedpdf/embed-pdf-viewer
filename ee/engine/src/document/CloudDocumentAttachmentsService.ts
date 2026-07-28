import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  normalizeAttachmentFileSource,
  type AttachmentContent,
  type AttachmentCreateResult,
  type AttachmentDeleteResult,
  type AttachmentFileSource,
  type DocumentAttachmentsService,
  type EmbeddedFileItem,
  type EmbeddedFileRef,
} from '@embedpdf/engine-core/runtime';
import {
  AttachmentCreateResultSchema,
  AttachmentDeleteResultSchema,
  EmbeddedFileItemSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { buildMutationForm } from './buildMutationForm';
import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import { parseAttachmentContent } from './parseAttachmentContent';
import type { HttpClient } from '../transport/HttpClient';

/** The `/attachments@…` listing leaf is a bare array of name-tree entries. */
const EmbeddedFileListSchema = EmbeddedFileItemSchema.array();

/**
 * Cloud-side document-level attachments (the catalog's `/EmbeddedFiles`
 * name tree). Reads use immutable leaves pinned by the manifest's
 * `attachmentsVersion`: `/attachments@…` for the metadata listing and
 * `/attachment-files/…@…` for one file's decoded bytes — a separate
 * capability tier, so a CDN credential for the listing can never egress
 * content. Mutations use unversioned collection/member URLs and are
 * never cached.
 */
export class CloudDocumentAttachmentsService implements DocumentAttachmentsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
  ) {}

  /**
   * Snapshot of the name tree, in tree (key-sorted) order. Pulls
   * `attachmentsVersion` from the cached manifest and, on a 404 (stale
   * pointer), transparently refreshes the manifest and retries once.
   * The pin bumps only on attachment writes, so this leaf stays cached
   * across page and annotation edits.
   */
  list(): AbortablePromise<EmbeddedFileItem[]> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<EmbeddedFileItem[]>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        // WS2b plane rule: the listing depends on the `attachments` plane —
        // while inherited, one CDN object serves every visitor's sidebar
        // from the base worker session.
        return planesInherited(manifest, ['attachments'])
          ? wirePaths.docAttachments(this.docId, manifest.attachmentsVersion)
          : wirePaths.layerAttachments(this.docId, this.layerName, manifest.attachmentsVersion);
      };
      return this.http.getJsonWithRefresh(
        buildPath,
        (raw) => EmbeddedFileListSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
    });
  }

  /**
   * Decode and return one embedded file's bytes. The body is the decoded
   * stream; the name and mime type ride as response headers (see
   * `parseAttachmentContent`). Same versioned-leaf + refresh-retry rails
   * as {@link list}.
   */
  download(ref: EmbeddedFileRef): AbortablePromise<AttachmentContent> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AttachmentContent>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        // WS2b: same plane switch as list() — the byte leaf shares too.
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
      return parseAttachmentContent(file);
    });
  }

  /**
   * Create an embedded file in the name tree. Same splitter the
   * file-attachment annotation draft uses — metadata into the `body`
   * JSON part, bytes into the `resource:r0` file part — POSTed as the
   * standard multipart mutation envelope.
   */
  create(file: AttachmentFileSource): AbortablePromise<AttachmentCreateResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AttachmentCreateResult>(async (signal) => {
      const { wireFile, resource } = await normalizeAttachmentFileSource(file, 'r0');
      const result = await this.http.postMultipartJson(
        wirePaths.layerAttachmentsCollection(this.docId, this.layerName),
        buildMutationForm(wireFile, { r0: resource }),
        (raw) => AttachmentCreateResultSchema.parse(raw),
        signal,
      );
      // Patch the cached manifest, then publish (in that order — listeners
      // reading the manifest in their callback must see post-mutation
      // state). An attachment write only advances docVersion +
      // attachmentsVersion (no per-page pin changes, no layoutVersion), so
      // the cached manifest is patched in place — no refetch.
      if (result.cache) this.manifest.applyAttachments(result.cache);
      this.publisher.publishLocal({ type: 'attachment.created', ...result });
      return result;
    });
  }

  /** Delete an embedded file from the name tree by its durable key. */
  delete(ref: EmbeddedFileRef): AbortablePromise<AttachmentDeleteResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AttachmentDeleteResult>(async (signal) => {
      const result = await this.http.deleteJson(
        wirePaths.layerAttachmentItem(this.docId, this.layerName, ref.key),
        (raw) => AttachmentDeleteResultSchema.parse(raw),
        signal,
      );
      // Same absorb-then-publish rails as create().
      if (result.cache) this.manifest.applyAttachments(result.cache);
      this.publisher.publishLocal({ type: 'attachment.deleted', ...result });
      return result;
    });
  }
}
