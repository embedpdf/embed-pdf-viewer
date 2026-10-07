import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  deletedAnnotationsOf,
  createPageImageHandle,
  encodeAnnotKey,
  hasAnnotationResources,
  opIdOf,
  resolveAnnotationResources,
  withFileFromResource,
  type AnnotationResourceRole,
  type AnnotationCreateOptions,
  type AnnotationUpdateOptions,
  type WireAnnotationResources,
  type AnnotationAppearanceImage,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceImagesResult,
  type AnnotationDraft,
  type AnnotationList,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationCreateResult,
  type AnnotationDeleteResult,
  type AnnotationFlattenResult,
  type AnnotationMoveResult,
  type FlattenWriteOptions,
  type AnnotationUpdateResult,
  type DocumentEventInit,
  type MutationMeta,
  type PageAnnotationsService,
  type PageImageResult,
  type PageNetworkRenderFormat,
  type PageRef,
  type WriteOptions,
  checkImageQuality,
} from '@embedpdf/engine-core/runtime';
import {
  AnnotationCreateResultSchema,
  AnnotationDeleteResultSchema,
  AnnotationListSchema,
  AnnotationAppearanceManifestSchema,
  AnnotationFlattenResultSchema,
  AnnotationMoveResultSchema,
  AnnotationUpdateResultSchema,
  annotationAppearancesImageOptionsToWire,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { buildAnnotationMutationForm } from './buildMutationForm';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { CloudWrite, CloudWrites } from './CloudWrites';
import { planesInherited } from './planes';
import { withObjectNumbers } from '../shared/withObjectNumbers';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud-side page annotation service. Mirrors the local wiring: each
 * call produces an `AbortablePromise` that propagates `signal.abort()`
 * down to `fetch` and validates the JSON response with the wire-stable
 * Zod schema.
 *
 * Reads use immutable versioned layer URLs discovered from the
 * manifest. Mutations use unversioned layer URLs and are never cached.
 */
export class CloudPageAnnotationsService implements PageAnnotationsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageRef: PageRef,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
    private readonly writes: CloudWrites,
  ) {}

  list(): AbortablePromise<AnnotationList> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AnnotationList>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const pageObjectNumber = this.pageRef.objectNumber;
        const page = manifest.pages.find((p) => p.page.objectNumber === pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${pageObjectNumber} in document ${this.docId}`,
          );
        }
        // Plane-scope rule: the list depends on the `annotations` plane. A
        // base's own annotations are simply visible through an inheriting
        // layer, so every visitor reads one doc-level URL served from the
        // base session.
        return planesInherited(manifest, ['annotations'])
          ? wirePaths.docPageAnnotations(this.docId, this.pageRef, page.cache.annotationVersion)
          : wirePaths.layerPageAnnotations(
              this.docId,
              this.layerName,
              this.pageRef,
              page.cache.annotationVersion,
            );
      };
      return this.http.getJsonWithRefresh(
        buildPath,
        (raw) => AnnotationListSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
    });
  }

  renderAppearances(
    options: AnnotationAppearanceImageOptions = {},
  ): AbortablePromise<AnnotationAppearanceImagesResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AnnotationAppearanceImagesResult>(async (signal) => {
      checkImageQuality(options.quality);
      // The cloud appearance endpoint is always content-addressed, so the URL
      // must carry an explicit network format (PNG/WebP). Default to WebP when
      // the caller omits it, matching render.image().
      const format: PageNetworkRenderFormat = options.format ?? 'webp';
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const pageObjectNumber = this.pageRef.objectNumber;
        const page = manifest.pages.find((p) => p.page.objectNumber === pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${pageObjectNumber} in document ${this.docId}`,
          );
        }
        const wireToken = annotationAppearancesImageOptionsToWire(
          { ...options, format },
          { annotationVersion: page.cache.annotationVersion },
        );
        // Same `annotations` plane switch as list(): the appearance
        // batch shares too.
        return planesInherited(manifest, ['annotations'])
          ? wirePaths.docPageAnnotationAppearances(this.docId, this.pageRef, wireToken)
          : wirePaths.layerPageAnnotationAppearances(
              this.docId,
              this.layerName,
              this.pageRef,
              wireToken,
            );
      };
      const form = await this.http.getFormDataWithRefresh(
        buildPath,
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
      return parseAppearanceForm(form);
    });
  }

  /**
   * One of the annotation's resources. `file` is a read over the immutable
   * `attachment-files` leaf, pinned by the manifest's `attachmentsVersion`
   * (annotation-level files re-key on the same pin as document-level ones),
   * with the same stale-404 refresh retry as {@link list}. `appearance` is a
   * derived read (no-store), like {@link exportAppearance}. Both address the
   * annotation by the same `:annotKey` update()/delete() use.
   */
  downloadResource(ref: AnnotationRef, role: AnnotationResourceRole): AbortablePromise<Uint8Array> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    if (ref.page.objectNumber !== this.pageRef.objectNumber) {
      return AbortablePromise.rejectReason(
        new EngineError(
          EngineErrorCode.InvalidArg,
          `ref.page ${ref.page.objectNumber} != page ${this.pageRef.objectNumber}`,
        ),
      );
    }
    const annotKey = encodeAnnotKey(ref);
    if (role === 'appearance') {
      return AbortablePromise.run<Uint8Array>(async (signal) =>
        this.http.getBytes(
          wirePaths.layerAnnotationAppearanceResource(
            this.docId,
            this.layerName,
            this.pageRef,
            annotKey,
          ),
          signal,
        ),
      );
    }
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        // A FileAttachment annotation's bytes depend on both planes —
        // the annotation must exist in this view (`annotations`) and the
        // byte pin is `attachmentsVersion` (`attachments`).
        return planesInherited(manifest, ['annotations', 'attachments'])
          ? wirePaths.docAnnotationFile(
              this.docId,
              this.pageRef,
              annotKey,
              manifest.attachmentsVersion,
            )
          : wirePaths.layerAnnotationFile(
              this.docId,
              this.layerName,
              this.pageRef,
              annotKey,
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

  create(
    draft: AnnotationDraft,
    options: AnnotationCreateOptions = {},
  ): AbortablePromise<AnnotationCreateResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const { resources, objectNumber } = options;
    // A `File` brings its name and type; the bytes travel without them.
    const data = withFileFromResource(draft, resources);
    const path = withObjectNumbers(
      wirePaths.layerPageAnnotationsCreate(this.docId, this.layerName, this.pageRef),
      { objectNumber },
    );
    return AbortablePromise.run<AnnotationCreateResult>((signal) =>
      this.writes.run(
        opId,
        signal,
        async (write) => {
          // Without resources the request is the plain JSON POST of the data;
          // with them it is multipart (see `buildAnnotationMutationForm`).
          const wireResources = await resolveAnnotationResources(resources);
          const parse = (raw: unknown) => AnnotationCreateResultSchema.parse(raw);
          const result = await write.send((sent) =>
            hasAnnotationResources(wireResources)
              ? this.http.postMultipartJson(
                  path,
                  buildAnnotationMutationForm(data, wireResources),
                  parse,
                  signal,
                  sent,
                )
              : this.http.postJson(path, data, parse, signal, sent),
          );
          return this.absorbMutation(opId, result, 'annotations.created');
        },
        [objectNumber],
      ),
    );
  }

  update(
    ref: AnnotationRef,
    patch: AnnotationPatch,
    options: AnnotationUpdateOptions = {},
  ): AbortablePromise<AnnotationUpdateResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const { resources } = options;
    if (ref.page.objectNumber !== this.pageRef.objectNumber) {
      return AbortablePromise.rejectReason(
        new EngineError(
          EngineErrorCode.InvalidArg,
          `ref.page ${ref.page.objectNumber} != page ${this.pageRef.objectNumber}`,
        ),
      );
    }
    const path = wirePaths.layerAnnotationByKey(
      this.docId,
      this.layerName,
      this.pageRef,
      encodeAnnotKey(ref),
    );
    return AbortablePromise.run<AnnotationUpdateResult>((signal) =>
      this.writes.run(opId, signal, async (write) => {
        const wireResources = await resolveAnnotationResources(resources);
        const result = await this.patchMutation(write, path, { patch }, wireResources, signal);
        return this.absorbMutation(opId, result, 'annotations.updated');
      }),
    );
  }

  /** PATCH as plain JSON, or as multipart when resources came with the patch. */
  private patchMutation(
    write: CloudWrite,
    path: string,
    body: unknown,
    resources: WireAnnotationResources,
    signal: AbortSignal,
  ): Promise<AnnotationUpdateResult> {
    const parse = (raw: unknown) => AnnotationUpdateResultSchema.parse(raw);
    return write.send((sent) =>
      hasAnnotationResources(resources)
        ? this.http.patchMultipartJson(
            path,
            buildAnnotationMutationForm(body, resources),
            parse,
            signal,
            sent,
          )
        : this.http.patchJson(path, body, parse, signal, sent),
    );
  }

  delete(ref: AnnotationRef, options?: WriteOptions): AbortablePromise<AnnotationDeleteResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    if (ref.page.objectNumber !== this.pageRef.objectNumber) {
      return AbortablePromise.rejectReason(
        new EngineError(
          EngineErrorCode.InvalidArg,
          `ref.page ${ref.page.objectNumber} != page ${this.pageRef.objectNumber}`,
        ),
      );
    }
    const path = wirePaths.layerAnnotationByKey(
      this.docId,
      this.layerName,
      this.pageRef,
      encodeAnnotKey(ref),
    );
    return AbortablePromise.run<AnnotationDeleteResult>((signal) =>
      this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.deleteJson(
            path,
            (raw) => AnnotationDeleteResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbDelete(opId, result);
      }),
    );
  }

  move(
    refs: AnnotationRef[],
    toIndex: number,
    options?: WriteOptions,
  ): AbortablePromise<AnnotationMoveResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    // The page is part of the URL; the worker validates per-ref consistency
    // again, but rejecting up front gives a cleaner error from the client side.
    for (const r of refs) {
      if (r.page.objectNumber !== this.pageRef.objectNumber) {
        return AbortablePromise.rejectReason(
          new EngineError(
            EngineErrorCode.InvalidArg,
            `move ref points at page ${r.page.objectNumber}; service is bound to page ${this.pageRef.objectNumber}`,
          ),
        );
      }
    }
    const path = wirePaths.layerPageAnnotationsMove(this.docId, this.layerName, this.pageRef);
    return AbortablePromise.run<AnnotationMoveResult>((signal) =>
      this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            path,
            { refs, toIndex },
            (raw) => AnnotationMoveResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'annotations.moved');
      }),
    );
  }

  flatten(
    refs: AnnotationRef[],
    options?: FlattenWriteOptions,
  ): AbortablePromise<AnnotationFlattenResult> {
    const usage = options?.usage ?? 'display';
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    for (const r of refs) {
      if (r.page.objectNumber !== this.pageRef.objectNumber) {
        return AbortablePromise.rejectReason(
          new EngineError(
            EngineErrorCode.InvalidArg,
            `flatten ref points at page ${r.page.objectNumber}; service is bound to page ${this.pageRef.objectNumber}`,
          ),
        );
      }
    }
    const path = wirePaths.layerPageAnnotationsFlatten(this.docId, this.layerName, this.pageRef);
    return AbortablePromise.run<AnnotationFlattenResult>((signal) =>
      this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            path,
            { refs, usage },
            (raw) => AnnotationFlattenResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // Nothing applied comes back without a cache delta: no artifact, no
        // coherence bump, no event.
        if (result.meta.cacheDelta === null) return result;
        // Flatten bakes annotations into page content, so both planes flip.
        this.manifest.apply(result.meta, ['content', 'annotations']);
        this.publisher.publishWrite(opId, { type: 'annotations.flattened', ...result });
        return result;
      }),
    );
  }

  exportAppearance(refs: AnnotationRef[]): AbortablePromise<Uint8Array> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    for (const r of refs) {
      if (r.page.objectNumber !== this.pageRef.objectNumber) {
        return AbortablePromise.rejectReason(
          new EngineError(
            EngineErrorCode.InvalidArg,
            `exportAppearance ref points at page ${r.page.objectNumber}; service is bound to page ${this.pageRef.objectNumber}`,
          ),
        );
      }
    }
    // A read (gated by doc.download server-side): no absorb, no event.
    return AbortablePromise.run<Uint8Array>(async (signal) =>
      this.http.postJsonBytes(
        wirePaths.layerPageAnnotationsAppearance(this.docId, this.layerName, this.pageRef),
        { refs },
        signal,
      ),
    );
  }

  /**
   * Patch the cached manifest, then publish the mutation to the document's
   * event stream (in that order — listeners reading the manifest in their
   * callback must see post-mutation state). Each call site pairs the event
   * `type` with the matching result by construction; the cast localizes that
   * pairing here instead of widening every site.
   */
  /** A delete's event names what went, for listeners that didn't delete it. */
  private absorbDelete(opId: string, result: AnnotationDeleteResult): AnnotationDeleteResult {
    this.manifest.apply(result.meta, ['annotations']);
    this.publisher.publishWrite(opId, {
      type: 'annotations.deleted',
      page: this.pageRef,
      deleted: deletedAnnotationsOf(result),
      ...result,
    });
    return result;
  }

  private absorbMutation<T extends { meta: MutationMeta }>(
    opId: string,
    result: T,
    type: 'annotations.created' | 'annotations.updated' | 'annotations.moved',
  ): T {
    this.manifest.apply(result.meta, ['annotations']);
    this.publisher.publishWrite(opId, {
      type,
      page: this.pageRef,
      ...result,
    } as unknown as DocumentEventInit);
    return result;
  }
}

/**
 * Parse the appearance `multipart/form-data` response into the same
 * `AnnotationAppearanceImagesResult` shape the local engine produces. The
 * `manifest` part is validated against the wire schema; each image part is
 * wrapped in a `PageImageHandle` backed by the in-memory blob we already
 * downloaded.
 */
async function parseAppearanceForm(form: FormData): Promise<AnnotationAppearanceImagesResult> {
  const manifestRaw = form.get('manifest');
  if (typeof manifestRaw !== 'string') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      'appearance response missing JSON manifest part',
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(manifestRaw);
  } catch (err) {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `appearance manifest is not valid JSON: ${(err as Error)?.message ?? err}`,
    );
  }
  const manifest = AnnotationAppearanceManifestSchema.parse(parsedJson);

  const appearances: AnnotationAppearanceImage[] = await Promise.all(
    manifest.appearances.map(async (entry) => {
      const partValue = form.get(entry.part);
      if (partValue === null || typeof partValue === 'string') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `appearance response missing image part "${entry.part}"`,
        );
      }
      const blob = partValue as Blob;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const result: PageImageResult = {
        width: entry.width,
        height: entry.height,
        format: entry.format,
        contentType: entry.contentType,
        source: { kind: 'bytes', bytes },
      };
      const image = createPageImageHandle(result, {
        async blob() {
          return blob;
        },
      });
      return {
        ref: entry.ref,
        mode: entry.mode,
        state: entry.state,
        rect: entry.rect,
        image,
      };
    }),
  );

  return { page: manifest.page, appearances };
}
