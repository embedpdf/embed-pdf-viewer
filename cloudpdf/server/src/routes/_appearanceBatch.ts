import { Buffer } from 'node:buffer';

import {
  EngineError,
  EngineErrorCode,
  toPageRef,
  wirePack,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceBatch,
  type AnnotationAppearanceBatchEntry,
  type AnnotationFamily,
  type PageNetworkRenderFormat,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import {
  AnnotationAppearancesQuerySchema,
  annotationRenderOptionsFromImageOptions,
  PageNetworkRenderFormatSchema,
  unflatten,
  WidgetAppearancesQuerySchema,
  type ManifestPage,
} from '@embedpdf/engine-core/wire';
import type { FastifyReply } from 'fastify';

import { parseOrInvalidArg, setImmutableCache, setNoStore } from './_helpers';
import { buildMultipart, type MultipartPart } from './_multipart';
import type { SharpImageEncoder } from '../render/SharpImageEncoder';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService, OpenContext } from '../services/DocumentService';

/**
 * Page reads shared by the annotation and form routes: where a read resolves
 * (the base or a layer), the page as its manifest pins it, and a page's
 * appearance batch of one family.
 */

export type ReadScope =
  | { kind: 'base'; ctx: OpenContext; docId: string }
  | { kind: 'layer'; ctx: OpenContext; docId: string; layerName: string };

/**
 * A page's appearance batch of one family, as `multipart/form-data`: a JSON
 * manifest and one image part per appearance. The annotations' batch
 * (`annotations/pages/{p}/appearances`) is keyed by the page's
 * `annotationVersion`, the widgets' (`form/pages/{p}/appearances`) by its
 * `widgetVersion`; a pin that is no longer current is a 404 into the
 * client's manifest refresh.
 */
export async function renderAppearanceBatch(input: {
  family: AnnotationFamily;
  documentService: DocumentService;
  imageEncoder: SharpImageEncoder;
  encodeInEngine: boolean;
  derivedRenders?: DerivedRenderService;
  reply: FastifyReply;
  signal: AbortSignal;
  scope: ReadScope;
  pageObjectNumber: number;
  tokenQuery?: Record<string, string>;
  query: unknown;
}) {
  const page = await resolvePageForRead(input);
  if (input.tokenQuery !== undefined) rejectQueryParamsOnTokenUrl(input.query);

  // Token (versioned) and query (unversioned) both arrive as flat string maps.
  // `unflatten` turns the dotted `viewport.*` keys into the nested object the
  // schema expects; z.coerce handles the string→number/enum coercions.
  const flatInput = (input.tokenQuery ?? input.query) as Record<string, unknown>;
  const label =
    input.tokenQuery === undefined ? 'appearance render query' : 'appearance render token';
  const widgets = input.family === 'widgets';
  // The family's pin: the token's, against the page's in the manifest.
  let imageOptions: AnnotationAppearanceImageOptions;
  let requestedPin: number | undefined;
  if (widgets) {
    const parsed = parseOrInvalidArg(WidgetAppearancesQuerySchema, unflatten(flatInput), label);
    imageOptions = parsed.options;
    requestedPin = parsed.widgetVersion;
  } else {
    const parsed = parseOrInvalidArg(AnnotationAppearancesQuerySchema, unflatten(flatInput), label);
    imageOptions = parsed.options;
    requestedPin = parsed.annotationVersion;
  }
  const pinName = widgets ? 'widgetVersion' : 'annotationVersion';
  const currentPin = widgets ? page.cache.widgetVersion : page.cache.annotationVersion;
  // Format lives in the token (versioned) or query (unversioned). The schema
  // requires it on versioned requests; the unversioned alias defaults to webp.
  const format: PageNetworkRenderFormat = parseOrInvalidArg(
    PageNetworkRenderFormatSchema,
    imageOptions.format ?? 'webp',
    'render format',
  );

  if (requestedPin !== undefined && requestedPin !== currentPin) {
    setNoStore(input.reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `appearance ${pinName} ${requestedPin} no longer current (current=${currentPin}) for page ${input.pageObjectNumber}`,
    );
  }

  // Appearance-scale enforcement: the appearance lattice
  // bounds scale — appearances are sized by `rect × scale`, so a page-sized
  // stamp at a high scale is a full-page memory bomb wearing a different
  // token. Same scoping as pages: only versioned (token) requests are
  // enforced; the unversioned alias stays compute-only (no-store), which is
  // the escape hatch for off-canonical needs (an unusual quality).
  const derived = input.derivedRenders;
  if (
    derived !== undefined &&
    derived.enforced &&
    input.tokenQuery !== undefined &&
    !derived.classifyAppearance({ imageOptions, format }).onLattice
  ) {
    setNoStore(input.reply);
    derived.rejectOffLattice(
      "use a scale viewport: { kind: 'scale', scale: snapAppearanceScale(policy, scale) }",
    );
  }

  if (input.scope.kind === 'layer') {
    await input.documentService.ensureLayerOnPool(
      input.scope.ctx,
      input.scope.docId,
      input.scope.layerName,
    );
  }

  // Every server render carries the deployment's output-pixel budget —
  // the worker rejects before allocating (degenerate-geometry guard).
  const renderOptions = {
    ...annotationRenderOptionsFromImageOptions(imageOptions),
    ...(derived !== undefined ? { maxOutputPixels: derived.maxRenderPixels } : {}),
  };
  // Both branches produce the same manifest ingredients. In-engine encode
  // With in-engine encoding (the default), the appearance raster batch never leaves
  // the worker — it crosses the engine boundary as compressed images.
  // The legacy branch (CLOUDPDF_ENCODE_IN_ENGINE=0) keeps API-side sharp
  // on the raw raster payload for one release.
  const collect = async (): Promise<{
    page: AnnotationAppearanceBatch['page'];
    entries: AnnotationAppearanceBatchEntry[];
    parts: MultipartPart[];
  }> => {
    const entries: AnnotationAppearanceBatchEntry[] = [];
    const parts: MultipartPart[] = [];
    const ext = format === 'webp' ? 'webp' : 'png';
    let i = 0;
    if (input.encodeInEngine) {
      const build = (jobId: WorkerJobId) =>
        wirePack({
          kind: 'annotations.renderAppearancesEncoded' as const,
          effect: 'read' as const,
          jobId,
          docId: input.scope.docId,
          ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
          page: toPageRef(input.pageObjectNumber),
          family: input.family,
          options: renderOptions,
          encode: {
            format,
            ...(imageOptions.quality !== undefined ? { quality: imageOptions.quality } : {}),
          },
        });
      const scope = input.scope;
      const payload = await input.documentService.readOnPool(
        scope.ctx,
        scope.docId,
        scope.kind === 'layer' ? scope.layerName : undefined,
        build,
        input.signal,
      );
      if (payload.tag !== 'annotations.renderAppearancesEncoded') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `unexpected annotations.renderAppearancesEncoded payload: ${payload.tag}`,
        );
      }
      // Every annotation with an appearance stream is emitted, once per mode
      // and state: the client finds the image by its key and identifies it
      // by `ref`, `mode` and `state`.
      for (const appearance of payload.result.appearances) {
        const key = `appearance-${i++}`;
        entries.push({
          resources: { image: key },
          ref: appearance.ref,
          mode: appearance.mode,
          state: appearance.state,
          rect: appearance.rect,
          width: appearance.image.width,
          height: appearance.image.height,
          format,
          contentType: appearance.image.contentType,
        });
        parts.push({
          key,
          filename: `${key}.${ext}`,
          contentType: appearance.image.contentType,
          body: Buffer.from(appearance.image.bytes),
        });
      }
      return { page: payload.result.page, entries, parts };
    }
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.renderAppearances' as const,
        effect: 'read' as const,
        jobId,
        docId: input.scope.docId,
        ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
        page: toPageRef(input.pageObjectNumber),
        family: input.family,
        options: renderOptions,
      });
    const scope = input.scope;
    const payload = await input.documentService.readOnPool(
      scope.ctx,
      scope.docId,
      scope.kind === 'layer' ? scope.layerName : undefined,
      build,
      input.signal,
    );
    if (payload.tag !== 'annotations.renderAppearances') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected annotations.renderAppearances payload: ${payload.tag}`,
      );
    }
    // The worker payload nests the render result under `.result`
    // (`{ tag, result: { pageState, appearances } }`), unlike the flat
    // `pages.render` payload — unwrap it before consuming.
    const result = payload.result;

    // Encode each appearance to the requested format. Every annotation with an
    // appearance stream is emitted: the client finds the image by its key
    // and identifies the annotation by `ref`.
    for (const appearance of result.appearances) {
      const encoded = input.imageEncoder.encode(appearance.raster, {
        format,
        ...(imageOptions.quality !== undefined ? { quality: imageOptions.quality } : {}),
      });
      const body = await encoded.stream.toBuffer();
      const key = `appearance-${i++}`;
      entries.push({
        resources: { image: key },
        ref: appearance.ref,
        mode: appearance.mode,
        state: appearance.state,
        rect: appearance.rect,
        width: appearance.raster.width,
        height: appearance.raster.height,
        format,
        contentType: encoded.contentType,
      });
      parts.push({
        key,
        filename: `${key}.${ext}`,
        contentType: encoded.contentType,
        body,
      });
    }
    return { page: result.page, entries, parts };
  };
  const collected = await collect();

  const manifest: AnnotationAppearanceBatch = {
    page: collected.page,
    appearances: collected.entries,
  };

  requestedPin === undefined ? setNoStore(input.reply) : setImmutableCache(input.reply);

  const { contentType, body } = buildMultipart(manifest, collected.parts);
  input.reply.type(contentType);
  input.reply.header('X-EmbedPDF-Appearance-Count', String(collected.entries.length));
  return input.reply.send(body);
}

function rejectQueryParamsOnTokenUrl(query: unknown): void {
  if (query && typeof query === 'object' && Object.keys(query).length > 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'versioned appearance URLs must encode options in the path token, not query params',
    );
  }
}

/** The page as the read's manifest pins it; `NotFound` when it has none. */
export async function resolvePageForRead(input: {
  documentService: DocumentService;
  scope: ReadScope;
  pageObjectNumber: number;
}): Promise<ManifestPage> {
  const manifest =
    input.scope.kind === 'layer'
      ? await input.documentService.getLayerManifest(
          input.scope.ctx,
          input.scope.docId,
          input.scope.layerName,
        )
      : await input.documentService.getManifest(input.scope.ctx, input.scope.docId);
  const page = manifest.pages.find((p) => p.page.objectNumber === input.pageObjectNumber);
  if (page) {
    return page;
  }
  throw new EngineError(
    EngineErrorCode.NotFound,
    input.scope.kind === 'layer'
      ? `no page with object number ${input.pageObjectNumber} in layer ${input.scope.layerName} for document ${input.scope.docId}`
      : `no page with object number ${input.pageObjectNumber} in document ${input.scope.docId}`,
  );
}
