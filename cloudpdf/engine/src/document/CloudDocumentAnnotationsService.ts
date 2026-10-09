import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  annotationImportFacts,
  concatAnnotationLists,
  assertAnnotationBundle,
  assertAnnotationBundleManifest,
  opIdOf,
  type AnnotationBundle,
  type BundleLimits,
  type AnnotationExportSelection,
  type AnnotationImportBody,
  type AnnotationImportOptions,
  type AnnotationImportResult,
  type AnnotationList,
  type AnnotationListOptions,
  type DocumentAnnotationsService,
  type DocumentManifest,
  type ManifestPage,
  type PageObjectNumber,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import {
  AnnotationImportResultSchema,
  AnnotationListSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { CloudWrites } from './CloudWrites';
import { planesInherited } from './planes';
import { bundleImportForm, NO_BUNDLE_LIMITS, readBundleParts } from '../transport/bundleMultipart';
import type { HttpClient } from '../transport/HttpClient';

/** Bulk-read restarts after a mid-flight mutation staled the pinned
 *  version (404 on the immutable leaf → refresh the manifest → retry). */
const MAX_COHERENCE_RESTARTS = 2;

export class CloudDocumentAnnotationsService implements DocumentAnnotationsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
    private readonly writes: CloudWrites,
    /** The server's import limits, as its `/v1/access` advertises them. */
    private readonly importLimits: () => Promise<BundleLimits>,
  ) {}

  /**
   * Every page: one coherent whole-document snapshot, a single read of the
   * immutable `annotations/items@annotationsVersion=N` leaf at the
   * manifest's pin — materialized server-side by one raw (no page-load)
   * sweep, CDN-cacheable because the pin bumps only when annotation list
   * bodies actually change. A stale pin mid-read (a concurrent mutation →
   * 404) refreshes the manifest and retries, so the result always belongs
   * to one document moment (the torn read this method exists to prevent).
   *
   * Some pages: each page's versioned leaf, the same read as
   * `page.annotations.list()`, in the order asked.
   */
  list(options: AnnotationListOptions = {}): AbortablePromise<AnnotationList> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    const { pages } = options;
    if (pages !== undefined) {
      return AbortablePromise.run<AnnotationList>(async (signal) =>
        concatAnnotationLists(await Promise.all(pages.map((page) => this.readPage(page, signal)))),
      );
    }
    return AbortablePromise.run<AnnotationList>(async (signal) => {
      for (let attempt = 0; ; attempt++) {
        const manifest =
          attempt === 0 ? await this.manifest.get(signal) : await this.manifest.refresh(signal);
        try {
          const list = await this.readBulkAt(manifest, signal);
          return { ...list, auditHead: list.auditHead ?? manifest.auditHead };
        } catch (err) {
          if (!EngineError.is(err, EngineErrorCode.NotFound) || attempt >= MAX_COHERENCE_RESTARTS) {
            throw err;
          }
          // The pin staled under us; retry against the fresh manifest.
        }
      }
    });
  }

  /** One bulk leaf read at the manifest's pin. The server stamps the body's
   *  `auditHead` at materialization time; a CDN-cached body may carry a
   *  cursor older than the current manifest's, which is still safe — the
   *  pin proves no items-affecting mutation landed in between, so replaying
   *  that window over the body is all no-ops. */
  private async readBulkAt(
    manifest: DocumentManifest,
    signal: AbortSignal,
  ): Promise<AnnotationList> {
    const path = planesInherited(manifest, ['annotations'])
      ? wirePaths.docAnnotationsAll(this.docId, manifest.annotationsVersion)
      : wirePaths.layerAnnotationsAll(this.docId, this.layerName, manifest.annotationsVersion);
    return this.http.getJson(path, (raw) => AnnotationListSchema.parse(raw), signal);
  }

  /** One page's versioned leaf, with the standard stale-pin retry
   *  (404 → refresh the manifest → once). */
  private readPage(page: PageRef, signal: AbortSignal): Promise<AnnotationList> {
    return this.http.getJsonWithRefresh(
      async (s) => this.versionedPagePath(await this.manifest.get(s), page.objectNumber),
      (raw) => AnnotationListSchema.parse(raw),
      async (s) => {
        await this.manifest.refresh(s);
      },
      signal,
    );
  }

  /**
   * One versioned, CDN-cacheable read at the manifest's annotation and
   * layout pins, with the stale-pin retry (404 → refresh the manifest →
   * once). The response is the bundle without its bytes and one part per
   * resource; every part is checked against its id before it is returned.
   */
  export(selection: AnnotationExportSelection = {}): AbortablePromise<AnnotationBundle> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AnnotationBundle>(async (signal) => {
      const read = async (s: AbortSignal): Promise<FormData> => {
        const manifest = await this.manifest.get(s);
        const path = this.exportPathAt(manifest, selection);
        if (path) return this.http.getFormData(path, s);
        // More refs than a URL holds: the pins and the selection in a POST
        // body.
        return this.http.postJsonFormData(
          wirePaths.layerAnnotationsExportRequest(this.docId, this.layerName),
          {
            annotationsVersion: manifest.annotationsVersion,
            layoutVersion: manifest.layoutVersion,
            selection,
          },
          s,
        );
      };
      let form: FormData;
      try {
        form = await read(signal);
      } catch (error) {
        // A pin that moved since the manifest was read: read it again, once.
        if (!EngineError.is(error, EngineErrorCode.NotFound)) throw error;
        await this.manifest.refresh(signal);
        form = await read(signal);
      }
      const { body, resources } = await readBundleParts('annotation', form);
      const bundle = { ...(body as Omit<AnnotationBundle, 'resources'>), resources };
      await assertAnnotationBundle(bundle, NO_BUNDLE_LIMITS);
      return bundle;
    });
  }

  /**
   * One request: the bundle's manifest and each resource once, as parts of
   * one multipart POST under the import's `opId` as `Idempotency-Key`, so a
   * retry applies once. The server holds the limits; the same numbers are checked
   * here first, so a bundle past one fails before its bytes move.
   */
  import(
    bundle: AnnotationBundle,
    options: AnnotationImportOptions = {},
  ): AbortablePromise<AnnotationImportResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AnnotationImportResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const { resources, ...rest } = bundle;
        const sizes = new Map(Object.entries(resources).map(([id, bytes]) => [id, bytes.length]));
        assertAnnotationBundleManifest(bundle, sizes, await this.importLimits());
        const body: AnnotationImportBody = {
          bundle: rest,
          options: {
            ...(options.pages !== undefined ? { pages: options.pages } : {}),
            ...(options.attribution !== undefined ? { attribution: options.attribution } : {}),
          },
        };
        const form = bundleImportForm(body, resources);
        const result = await write.send((sent) =>
          this.http.postMultipartJson(
            wirePaths.layerAnnotationsImport(this.docId, this.layerName),
            form,
            (raw) => AnnotationImportResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        this.manifest.apply(result.meta, ['annotations']);
        this.publisher.publishWrite(
          opId,
          ...annotationImportFacts(result).map((fact) => ({
            type: 'annotations.created' as const,
            ...fact,
          })),
        );
        return result;
      });
    });
  }

  /**
   * The cacheable export URL for `selection` at the manifest's pins — the
   * base leaf while the layer inherits both planes the bundle depends on —
   * or `null` when a URL can't carry it: a URL has room for a few hundred
   * refs.
   */
  private exportPathAt(
    manifest: DocumentManifest,
    selection: AnnotationExportSelection,
  ): string | null {
    const token = {
      annotationsVersion: manifest.annotationsVersion,
      layoutVersion: manifest.layoutVersion,
      selection,
    };
    try {
      return planesInherited(manifest, ['annotations', 'layout'])
        ? wirePaths.docAnnotationsExport(this.docId, token)
        : wirePaths.layerAnnotationsExport(this.docId, this.layerName, token);
    } catch {
      return null;
    }
  }

  /** Versioned leaf URL for one manifest page entry, with the same
   *  plane routing as `CloudPageAnnotationsService.list()`: an inherited
   *  `annotations` plane reads the doc-level base leaf. */
  private pagePathAt(manifest: DocumentManifest, page: ManifestPage): string {
    const ref = page.page;
    return planesInherited(manifest, ['annotations'])
      ? wirePaths.docPageAnnotations(this.docId, ref, page.cache.annotationVersion)
      : wirePaths.layerPageAnnotations(
          this.docId,
          this.layerName,
          ref,
          page.cache.annotationVersion,
        );
  }

  private versionedPagePath(
    manifest: DocumentManifest,
    pageObjectNumber: PageObjectNumber,
  ): string {
    const page = manifest.pages.find((p) => p.page.objectNumber === pageObjectNumber);
    if (!page) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no page with object number ${pageObjectNumber} in document ${this.docId}`,
      );
    }
    return this.pagePathAt(manifest, page);
  }
}
