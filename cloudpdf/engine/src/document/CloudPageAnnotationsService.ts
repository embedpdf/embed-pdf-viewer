import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  deletedAnnotationOf,
  createPageImageHandle,
  encodeStableIdKey,
  hasAnnotationResources,
  resolveAnnotationResources,
  type AnnotationResourceRole,
  type AnnotationResources,
  type WireAnnotationResources,
  type AnnotationAppearanceImage,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceImagesResult,
  type AnnotationAppearanceRenderOptions,
  type AnnotationAppearancesResult,
  type AnnotationDraft,
  type AnnotationList,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationCreateResult,
  type AnnotationDeleteResult,
  type AnnotationFlattenResult,
  type AnnotationMoveResult,
  type FlattenOptions,
  type AnnotationUpdateResult,
  type DocumentEventInit,
  type MutationMeta,
  type PageAnnotationsService,
  type PageImageResult,
  type PageNetworkRenderFormat,
  type PageRef,
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
import { planesInherited } from './planes';
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
        const pageObjectNumber = this.pageRef.pageObjectNumber;
        const page = manifest.pages.find((p) => p.state.page.pageObjectNumber === pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${pageObjectNumber} in document ${this.docId}`,
          );
        }
        // Plane-scope rule: the list depends on the `annotations` plane. A
        // base's own annotations (weak-identity ones included) are simply
        // visible through an inheriting layer, so every visitor reads one
        // doc-level URL served from the base session.
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

  renderAppearancesRaw(
    _options?: AnnotationAppearanceRenderOptions,
  ): AbortablePromise<AnnotationAppearancesResult> {
    return AbortablePromise.rejectReason(
      new EngineError(
        EngineErrorCode.NotImplemented,
        'annotations.renderAppearancesRaw() raw rasters are not available in the cloud engine; use renderAppearances()',
      ),
    );
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
      // The cloud appearance endpoint is always content-addressed, so the URL
      // must carry an explicit network format (PNG/WebP). Default to WebP when
      // the caller omits it, matching render.image().
      const format: PageNetworkRenderFormat = options.format ?? 'webp';
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const pageObjectNumber = this.pageRef.pageObjectNumber;
        const page = manifest.pages.find((p) => p.state.page.pageObjectNumber === pageObjectNumber);
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
   * derived read (no-store), like {@link exportAppearance}. Weak `index` refs
   * cannot be spliced into a GET URL (no body to carry the revision), so both
   * require a stable id — the same `:annotKey` routing update()/delete() use.
   */
  downloadResource(ref: AnnotationRef, role: AnnotationResourceRole): AbortablePromise<Uint8Array> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    if (ref.page.pageObjectNumber !== this.pageRef.pageObjectNumber) {
      return AbortablePromise.rejectReason(
        new EngineError(
          EngineErrorCode.InvalidArg,
          `ref.page ${ref.page.pageObjectNumber} != page ${this.pageRef.pageObjectNumber}`,
        ),
      );
    }
    if (ref.kind === 'index') {
      return AbortablePromise.rejectReason(
        new EngineError(
          EngineErrorCode.InvalidArg,
          'downloadResource requires a stable ref (objectNumber or nm); index refs cannot address a resource URL',
        ),
      );
    }
    const annotKey = encodeStableIdKey(refToStableId(ref));
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
    resources?: AnnotationResources,
  ): AbortablePromise<AnnotationCreateResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AnnotationCreateResult>(async (signal) => {
      // Without resources the request is the plain JSON POST of the data;
      // with them it is multipart (see `buildAnnotationMutationForm`).
      const wireResources = await resolveAnnotationResources(resources);
      const path = wirePaths.layerPageAnnotationsCreate(this.docId, this.layerName, this.pageRef);
      const parse = (raw: unknown) => AnnotationCreateResultSchema.parse(raw);
      const result = hasAnnotationResources(wireResources)
        ? await this.http.postMultipartJson(
            path,
            buildAnnotationMutationForm(draft, wireResources),
            parse,
            signal,
          )
        : await this.http.postJson(path, draft, parse, signal);
      return this.absorbMutation(result, 'annotations.created');
    });
  }

  update(
    ref: AnnotationRef,
    patch: AnnotationPatch,
    resources?: AnnotationResources,
  ): AbortablePromise<AnnotationUpdateResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    if (ref.page.pageObjectNumber !== this.pageRef.pageObjectNumber) {
      return AbortablePromise.rejectReason(
        new EngineError(
          EngineErrorCode.InvalidArg,
          `ref.page ${ref.page.pageObjectNumber} != page ${this.pageRef.pageObjectNumber}`,
        ),
      );
    }
    if (ref.kind === 'index') {
      // Index refs cannot be addressed by stable id. Send the full ref
      // in the body so the server can validate the revision and resolve
      // it the same way the local mutator does.
      const path = wirePaths.layerAnnotationByKey(
        this.docId,
        this.layerName,
        this.pageRef,
        'index',
      );
      return AbortablePromise.run<AnnotationUpdateResult>(async (signal) => {
        const wireResources = await resolveAnnotationResources(resources);
        const result = await this.patchMutation(path, { ref, patch }, wireResources, signal);
        return this.absorbMutation(result, 'annotations.updated');
      });
    }
    const stableKey = encodeStableIdKey(refToStableId(ref));
    const path = wirePaths.layerAnnotationByKey(
      this.docId,
      this.layerName,
      this.pageRef,
      stableKey,
    );
    return AbortablePromise.run<AnnotationUpdateResult>(async (signal) => {
      const wireResources = await resolveAnnotationResources(resources);
      const result = await this.patchMutation(path, { patch }, wireResources, signal);
      return this.absorbMutation(result, 'annotations.updated');
    });
  }

  /** PATCH as plain JSON, or as multipart when resources came with the patch. */
  private patchMutation(
    path: string,
    body: unknown,
    resources: WireAnnotationResources,
    signal: AbortSignal,
  ): Promise<AnnotationUpdateResult> {
    const parse = (raw: unknown) => AnnotationUpdateResultSchema.parse(raw);
    if (hasAnnotationResources(resources)) {
      return this.http.patchMultipartJson(
        path,
        buildAnnotationMutationForm(body, resources),
        parse,
        signal,
      );
    }
    return this.http.patchJson(path, body, parse, signal);
  }

  delete(ref: AnnotationRef): AbortablePromise<AnnotationDeleteResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    if (ref.page.pageObjectNumber !== this.pageRef.pageObjectNumber) {
      return AbortablePromise.rejectReason(
        new EngineError(
          EngineErrorCode.InvalidArg,
          `ref.page ${ref.page.pageObjectNumber} != page ${this.pageRef.pageObjectNumber}`,
        ),
      );
    }
    if (ref.kind === 'index') {
      // DELETE has no body in plain HTTP, so we PATCH the same
      // 'index' key with `{ ref, op: 'delete' }`. This keeps the
      // semantics atomic on the server (single round-trip).
      const path = wirePaths.layerAnnotationByKey(
        this.docId,
        this.layerName,
        this.pageRef,
        'index',
      );
      return AbortablePromise.run<AnnotationDeleteResult>(async (signal) => {
        const result = await this.http.patchJson(
          path,
          { ref, op: 'delete' },
          (raw) => AnnotationDeleteResultSchema.parse(raw),
          signal,
        );
        return this.absorbDelete(result);
      });
    }
    const stableKey = encodeStableIdKey(refToStableId(ref));
    const path = wirePaths.layerAnnotationByKey(
      this.docId,
      this.layerName,
      this.pageRef,
      stableKey,
    );
    return AbortablePromise.run<AnnotationDeleteResult>(async (signal) => {
      const result = await this.http.deleteJson(
        path,
        (raw) => AnnotationDeleteResultSchema.parse(raw),
        signal,
      );
      return this.absorbDelete(result);
    });
  }

  move(refs: AnnotationRef[], toIndex: number): AbortablePromise<AnnotationMoveResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    // The page is part of the URL; the worker validates per-ref consistency
    // again, but rejecting up front gives a cleaner error from the client side.
    for (const r of refs) {
      if (r.page.pageObjectNumber !== this.pageRef.pageObjectNumber) {
        return AbortablePromise.rejectReason(
          new EngineError(
            EngineErrorCode.InvalidArg,
            `move ref points at page ${r.page.pageObjectNumber}; service is bound to page ${this.pageRef.pageObjectNumber}`,
          ),
        );
      }
    }
    const path = wirePaths.layerPageAnnotationsMove(this.docId, this.layerName, this.pageRef);
    return AbortablePromise.run<AnnotationMoveResult>(async (signal) => {
      const result = await this.http.postJson(
        path,
        { refs, toIndex },
        (raw) => AnnotationMoveResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'annotations.moved');
    });
  }

  flatten(
    refs: AnnotationRef[],
    options?: FlattenOptions,
  ): AbortablePromise<AnnotationFlattenResult> {
    const usage = options?.usage ?? 'display';
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    for (const r of refs) {
      if (r.page.pageObjectNumber !== this.pageRef.pageObjectNumber) {
        return AbortablePromise.rejectReason(
          new EngineError(
            EngineErrorCode.InvalidArg,
            `flatten ref points at page ${r.page.pageObjectNumber}; service is bound to page ${this.pageRef.pageObjectNumber}`,
          ),
        );
      }
    }
    const path = wirePaths.layerPageAnnotationsFlatten(this.docId, this.layerName, this.pageRef);
    return AbortablePromise.run<AnnotationFlattenResult>(async (signal) => {
      const result = await this.http.postJson(
        path,
        { refs, usage },
        (raw) => AnnotationFlattenResultSchema.parse(raw),
        signal,
      );
      // Nothing applied comes back without a cache delta: no artifact, no
      // coherence bump, no event.
      if (result.meta.cacheDelta === null) return result;
      // Flatten bakes annotations into page content, so both planes flip.
      this.manifest.apply(result.meta, ['content', 'annotations']);
      this.publisher.publishLocal({ type: 'annotations.flattened', ...result });
      return result;
    });
  }

  exportAppearance(refs: AnnotationRef[]): AbortablePromise<Uint8Array> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    for (const r of refs) {
      if (r.page.pageObjectNumber !== this.pageRef.pageObjectNumber) {
        return AbortablePromise.rejectReason(
          new EngineError(
            EngineErrorCode.InvalidArg,
            `exportAppearance ref points at page ${r.page.pageObjectNumber}; service is bound to page ${this.pageRef.pageObjectNumber}`,
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
  private absorbDelete(result: AnnotationDeleteResult): AnnotationDeleteResult {
    this.manifest.apply(result.meta, ['annotations']);
    this.publisher.publishLocal({
      type: 'annotations.deleted',
      page: this.pageRef,
      deleted: deletedAnnotationOf(result),
      ...result,
    });
    return result;
  }

  private absorbMutation<T extends { meta: MutationMeta }>(
    result: T,
    type: 'annotations.created' | 'annotations.updated' | 'annotations.moved',
  ): T {
    this.manifest.apply(result.meta, ['annotations']);
    this.publisher.publishLocal({
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
        rect: entry.rect,
        image,
      };
    }),
  );

  return { pageState: manifest.pageState, appearances };
}

/**
 * Local helper: project a non-index `AnnotationRef` into the matching
 * `AnnotationStableId` shape so we can route by stable key. The compiler
 * narrows on `ref.kind` here so we can't accidentally pass an index ref.
 */
function refToStableId(
  ref: Extract<AnnotationRef, { kind: 'objectNumber' | 'nm' }>,
): { kind: 'objectNumber'; value: number } | { kind: 'nm'; value: string } {
  if (ref.kind === 'objectNumber') {
    return { kind: 'objectNumber', value: ref.annotObjectNumber };
  }
  return { kind: 'nm', value: ref.nm };
}
