import { Buffer } from 'node:buffer';

import {
  EngineError,
  EngineErrorCode,
  wirePack,
  type PageImageOptions,
  type PageNetworkRenderFormat,
  type PageDeleteInput,
  type PageFlattenInput,
  type PageMoveInput,
  type PageRotateInput,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import {
  decodeContentToken,
  decodeRenderToken,
  pageRenderOptionsFromImageOptions,
  PageDeleteInputSchema,
  PageFlattenInputSchema,
  PageMoveInputSchema,
  PageNetworkRenderFormatSchema,
  PageRotateInputSchema,
  PageRenderAnnotatedQuerySchema,
  PageRenderQuerySchema,
  unflatten,
  type ManifestPage,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  abortSignalFromRequest,
  parseOrInvalidArg,
  parsePageObjectNumber,
  parseTokenOrInvalidArg,
  setImmutableCache,
  setNoStore,
  type SchemaLike,
} from './_helpers';
import { requireSharedDocRead } from './_planeGuard';
import {
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerResource,
} from '../app/jwt-plugin';
import type { SharpImageEncoder } from '../render/SharpImageEncoder';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService, OpenContext } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';

interface PageRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
  imageEncoder: SharpImageEncoder;
  /** WS3 Phase B: encode renders in the engine worker (default). `false` is
   *  the one-release escape hatch (`CLOUDPDF_ENCODE_IN_ENGINE=0`) that keeps
   *  API-side sharp on the raw raster kinds. */
  encodeInEngine?: boolean;
  /** The derived-artifact plane for renders (absent = legacy compute-only). */
  derivedRenders?: DerivedRenderService;
}

type ReadScope =
  | { kind: 'base'; ctx: OpenContext; docId: string }
  | { kind: 'layer'; ctx: OpenContext; docId: string; layerName: string };

export async function registerPageRoutes(app: FastifyInstance, deps: PageRouteDeps): Promise<void> {
  const { documentService, layerService, imageEncoder, derivedRenders } = deps;
  const encodeInEngine = deps.encodeInEngine ?? true;

  // Doc-level SHARED routes (plane-scope model): served from the BASE worker
  // session; visible through a layer-pinned token only while every plane the
  // resource depends on is inherited (`requireSharedDocRead` is the one
  // door — auth chain + origin plane guard).

  app.get('/v1/docs/:docId/text/pages/:pon/data@:token', async (req, reply) => {
    const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-text', ['content']);
    return readPageText({
      documentService,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
      requestedVersion: parseTokenOrInvalidArg(decodeContentToken, token, 'contentVersion token'),
    });
  });

  app.get('/v1/docs/:docId/text/pages/:pon/data', async (req, reply) => {
    const { docId, pon } = req.params as { docId: string; pon: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-text', ['content']);
    return readPageText({
      documentService,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
    });
  });

  app.get('/v1/docs/:docId/geometry/pages/:pon/data@:token', async (req, reply) => {
    const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-geometry', [
      'content',
    ]);
    return readPageGeometry({
      documentService,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
      requestedVersion: parseTokenOrInvalidArg(decodeContentToken, token, 'contentVersion token'),
    });
  });

  app.get('/v1/docs/:docId/geometry/pages/:pon/data', async (req, reply) => {
    const { docId, pon } = req.params as { docId: string; pon: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-geometry', [
      'content',
    ]);
    return readPageGeometry({
      documentService,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
    });
  });

  app.get('/v1/docs/:docId/render/pages/:pon/data@:token', async (req, reply) => {
    const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-render', ['content']);
    return renderPageImage({
      documentService,
      imageEncoder,
      encodeInEngine,
      ...(derivedRenders ? { derivedRenders } : {}),
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      annotated: false,
      pageObjectNumber: parsePageObjectNumber(pon),
      tokenQuery: parseTokenOrInvalidArg(decodeRenderToken, token, 'render token'),
      query: req.query,
    });
  });

  app.get('/v1/docs/:docId/render/pages/:pon/data', async (req, reply) => {
    const { docId, pon } = req.params as { docId: string; pon: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-render', ['content']);
    return renderPageImage({
      documentService,
      imageEncoder,
      encodeInEngine,
      ...(derivedRenders ? { derivedRenders } : {}),
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      annotated: false,
      pageObjectNumber: parsePageObjectNumber(pon),
      query: req.query,
    });
  });

  app.get('/v1/docs/:docId/render/annotated/pages/:pon/data@:token', async (req, reply) => {
    const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-render-annotated', [
      'content',
      'annotations',
    ]);
    return renderPageImage({
      documentService,
      imageEncoder,
      encodeInEngine,
      ...(derivedRenders ? { derivedRenders } : {}),
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      annotated: true,
      pageObjectNumber: parsePageObjectNumber(pon),
      tokenQuery: parseTokenOrInvalidArg(decodeRenderToken, token, 'render token'),
      query: req.query,
    });
  });

  app.get('/v1/docs/:docId/render/annotated/pages/:pon/data', async (req, reply) => {
    const { docId, pon } = req.params as { docId: string; pon: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-render-annotated', [
      'content',
      'annotations',
    ]);
    return renderPageImage({
      documentService,
      imageEncoder,
      encodeInEngine,
      ...(derivedRenders ? { derivedRenders } : {}),
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      annotated: true,
      pageObjectNumber: parsePageObjectNumber(pon),
      query: req.query,
    });
  });

  app.get('/v1/docs/:docId/layers/:layerName/text/pages/:pon/data@:token', async (req, reply) => {
    const { docId, layerName, pon, token } = req.params as {
      docId: string;
      layerName: string;
      pon: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-page-text', pdfBits);
    return readPageText({
      documentService,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
      pageObjectNumber: parsePageObjectNumber(pon),
      requestedVersion: parseTokenOrInvalidArg(decodeContentToken, token, 'contentVersion token'),
    });
  });

  app.get('/v1/docs/:docId/layers/:layerName/text/pages/:pon/data', async (req, reply) => {
    const { docId, layerName, pon } = req.params as {
      docId: string;
      layerName: string;
      pon: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-page-text', pdfBits);
    return readPageText({
      documentService,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
      pageObjectNumber: parsePageObjectNumber(pon),
    });
  });

  app.get(
    '/v1/docs/:docId/layers/:layerName/geometry/pages/:pon/data@:token',
    async (req, reply) => {
      const { docId, layerName, pon, token } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-page-geometry', pdfBits);
      return readPageGeometry({
        documentService,
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: parsePageObjectNumber(pon),
        requestedVersion: parseTokenOrInvalidArg(decodeContentToken, token, 'contentVersion token'),
      });
    },
  );

  app.get('/v1/docs/:docId/layers/:layerName/geometry/pages/:pon/data', async (req, reply) => {
    const { docId, layerName, pon } = req.params as {
      docId: string;
      layerName: string;
      pon: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-page-geometry', pdfBits);
    return readPageGeometry({
      documentService,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
      pageObjectNumber: parsePageObjectNumber(pon),
    });
  });

  app.get('/v1/docs/:docId/layers/:layerName/render/pages/:pon/data@:token', async (req, reply) => {
    const { docId, layerName, pon, token } = req.params as {
      docId: string;
      layerName: string;
      pon: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-page-render', pdfBits);
    return renderPageImage({
      documentService,
      imageEncoder,
      encodeInEngine,
      ...(derivedRenders ? { derivedRenders } : {}),
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
      annotated: false,
      pageObjectNumber: parsePageObjectNumber(pon),
      tokenQuery: parseTokenOrInvalidArg(decodeRenderToken, token, 'render token'),
      query: req.query,
    });
  });

  app.get('/v1/docs/:docId/layers/:layerName/render/pages/:pon/data', async (req, reply) => {
    const { docId, layerName, pon } = req.params as {
      docId: string;
      layerName: string;
      pon: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-page-render', pdfBits);
    return renderPageImage({
      documentService,
      imageEncoder,
      encodeInEngine,
      ...(derivedRenders ? { derivedRenders } : {}),
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
      annotated: false,
      pageObjectNumber: parsePageObjectNumber(pon),
      query: req.query,
    });
  });

  app.get(
    '/v1/docs/:docId/layers/:layerName/render/annotated/pages/:pon/data@:token',
    async (req, reply) => {
      const { docId, layerName, pon, token } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(
        req,
        docId,
        layerName,
        'layer-page-render-annotated',
        pdfBits,
      );
      return renderPageImage({
        documentService,
        imageEncoder,
        encodeInEngine,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        annotated: true,
        pageObjectNumber: parsePageObjectNumber(pon),
        tokenQuery: parseTokenOrInvalidArg(decodeRenderToken, token, 'render token'),
        query: req.query,
      });
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/render/annotated/pages/:pon/data',
    async (req, reply) => {
      const { docId, layerName, pon } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(
        req,
        docId,
        layerName,
        'layer-page-render-annotated',
        pdfBits,
      );
      return renderPageImage({
        documentService,
        imageEncoder,
        encodeInEngine,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        annotated: true,
        pageObjectNumber: parsePageObjectNumber(pon),
        query: req.query,
      });
    },
  );

  app.post('/v1/docs/:docId/layers/:layerName/pages/move', async (req, reply) => {
    const { docId, layerName } = req.params as {
      docId: string;
      layerName: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.pages.assemble', pdfBits);
    const body = parseOrInvalidArg<PageMoveInput>(
      PageMoveInputSchema as unknown as SchemaLike<PageMoveInput>,
      req.body,
      'request body',
    );

    setNoStore(reply);
    return layerService.movePages(
      ctx,
      {
        docId,
        layerName,
        pageObjectNumbers: body.pageObjectNumbers,
        destIndex: body.destIndex,
      },
      abortSignalFromRequest(req),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/pages/rotate', async (req, reply) => {
    const { docId, layerName } = req.params as {
      docId: string;
      layerName: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.pages.assemble', pdfBits);
    const body = parseOrInvalidArg<PageRotateInput>(
      PageRotateInputSchema as unknown as SchemaLike<PageRotateInput>,
      req.body,
      'request body',
    );

    setNoStore(reply);
    return layerService.rotatePages(
      ctx,
      {
        docId,
        layerName,
        pageObjectNumbers: body.pageObjectNumbers,
        rotation: body.rotation,
      },
      abortSignalFromRequest(req),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/pages/delete', async (req, reply) => {
    const { docId, layerName } = req.params as {
      docId: string;
      layerName: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.pages.assemble', pdfBits);
    const body = parseOrInvalidArg<PageDeleteInput>(
      PageDeleteInputSchema as unknown as SchemaLike<PageDeleteInput>,
      req.body,
      'request body',
    );

    setNoStore(reply);
    return layerService.deletePages(
      ctx,
      {
        docId,
        layerName,
        pageObjectNumbers: body.pageObjectNumbers,
      },
      abortSignalFromRequest(req),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/pages/flatten', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.pages.modify', pdfBits);
    // Flatten deletes page annotations as it paints them, so page-content
    // authority alone is insufficient. This deliberately excludes collab-
    // scoped annotation writers from the bulk page endpoint.
    requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
    const raw = (req.body ?? {}) as { pageObjectNumbers?: unknown; usage?: unknown };
    const body = parseOrInvalidArg<PageFlattenInput>(
      PageFlattenInputSchema as unknown as SchemaLike<PageFlattenInput>,
      { pageObjectNumbers: raw.pageObjectNumbers, usage: raw.usage ?? 'display' },
      'request body',
    );

    setNoStore(reply);
    return layerService.flattenPages(
      ctx,
      {
        docId,
        layerName,
        pageObjectNumbers: body.pageObjectNumbers,
        usage: body.usage,
      },
      abortSignalFromRequest(req),
    );
  });
}

function rejectQueryParamsOnTokenUrl(query: unknown): void {
  if (query && typeof query === 'object' && Object.keys(query).length > 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'versioned render URLs must encode render options in the path token, not query params',
    );
  }
}

async function renderPageImage(input: {
  documentService: DocumentService;
  imageEncoder: SharpImageEncoder;
  encodeInEngine: boolean;
  derivedRenders?: DerivedRenderService;
  reply: FastifyReply;
  signal: AbortSignal;
  scope: ReadScope;
  /**
   * The render FAMILY this route belongs to: `…/render/pages/` is
   * annotation-free, `…/render/annotated/pages/`
   * annotated — at BOTH the doc and layer tiers. The token carries no
   * annotatedness at all; each family's query schema enforces its own pin
   * grammar (`annotationVersion` required on versioned annotated requests,
   * unrepresentable on free ones), so contradictory requests fail schema
   * parse instead of needing a guard.
   */
  annotated: boolean;
  pageObjectNumber: number;
  tokenQuery?: Record<string, string>;
  query: unknown;
}) {
  const { page, baseSha } = await resolvePageAndManifestForRead(input);
  if (input.tokenQuery !== undefined) rejectQueryParamsOnTokenUrl(input.query);
  // Both token and query strings arrive as flat string maps. Generic
  // `unflatten` turns dotted keys (`viewport.kind`, `target.rect.left`) into
  // the nested object the family's schema expects. The schema then coerces,
  // validates, and shapes the result into `PageRenderQuery` (stamping
  // `includeAnnotations` from the family).
  const flatInput = (input.tokenQuery ?? input.query) as Record<string, unknown>;
  const nested = unflatten(flatInput);
  const parsedQuery = parseOrInvalidArg(
    input.annotated ? PageRenderAnnotatedQuerySchema : PageRenderQuerySchema,
    nested,
    input.tokenQuery === undefined ? 'render query' : 'render token',
  );
  const imageOptions: PageImageOptions = parsedQuery.options;
  const requestedContentVersion = parsedQuery.contentVersion;
  const requestedAnnotationVersion = parsedQuery.annotationVersion;
  const includeAnnotations = input.annotated;
  // Format lives in the token (versioned) or query (unversioned). The Zod
  // schema enforces "format required when versioned", so the unversioned
  // fallback is the only place a default applies.
  const format: PageNetworkRenderFormat = parseOrInvalidArg(
    PageNetworkRenderFormatSchema,
    imageOptions.format ?? 'webp',
    'render format',
  );

  if (
    requestedContentVersion !== undefined &&
    requestedContentVersion !== page.cache.contentVersion
  ) {
    setNoStore(input.reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `render contentVersion ${requestedContentVersion} no longer current (current=${page.cache.contentVersion}) for page ${input.pageObjectNumber}`,
    );
  }

  if (
    requestedAnnotationVersion !== undefined &&
    requestedAnnotationVersion !== page.cache.annotationVersion
  ) {
    setNoStore(input.reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `render annotationVersion ${requestedAnnotationVersion} no longer current (current=${page.cache.annotationVersion}) for page ${input.pageObjectNumber}`,
    );
  }

  // ── The derived-artifact plane ───────────────────────────────────────
  // Lattice renders are durable: URL space == artifact space at canonical
  // points. Off-lattice tokens are rejected when enforcement is on (the
  // storage-DoS guard); until the SDK ships its `snap` helper they fall
  // through to the legacy compute-only path below.
  const derived = input.derivedRenders;
  const classification = derived?.classify({
    imageOptions,
    format,
    annotated: input.annotated,
    ...(requestedContentVersion !== undefined ? { contentVersion: requestedContentVersion } : {}),
    ...(requestedAnnotationVersion !== undefined
      ? { annotationVersion: requestedAnnotationVersion }
      : {}),
  });
  // Enforcement is scoped to FULL-PAGE requests: rect targets belong to
  // the tile policy once advertised and stay compute-only until then;
  // otherwise flipping `enforce` would 400 every region render.
  if (
    derived !== undefined &&
    derived.enforced &&
    input.tokenQuery !== undefined &&
    classification !== undefined &&
    classification.fullPage &&
    !classification.onLattice
  ) {
    setNoStore(input.reply);
    derived.rejectOffLattice();
  }

  const ensureScopeOnPool = async () => {
    if (input.scope.kind === 'layer') {
      await input.documentService.ensureLayerOnPool(
        input.scope.ctx,
        input.scope.docId,
        input.scope.layerName,
      );
    }
  };
  // Every server render carries the deployment's output-pixel budget —
  // the worker rejects before allocating (degenerate-geometry guard).
  const preparedRenderOptions = () => ({
    ...pageRenderOptionsFromImageOptions(imageOptions, includeAnnotations),
    ...(derived !== undefined ? { maxOutputPixels: derived.maxRenderPixels } : {}),
  });
  const renderRaster = async () => {
    await ensureScopeOnPool();
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'pages.render' as const,
        jobId,
        docId: input.scope.docId,
        ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
        pageObjectNumber: input.pageObjectNumber,
        options: preparedRenderOptions(),
      });
    const scope = input.scope;
    const result = await input.documentService.readOnPool(
      scope.ctx,
      scope.docId,
      scope.kind === 'layer' ? scope.layerName : undefined,
      build,
      input.signal,
    );
    if (result.tag !== 'pages.render') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected layer pages.render payload: ${result.tag}`,
      );
    }
    return result.raster;
  };
  // WS3 Phase B (the default): render + encode in ONE worker op — the
  // raster never leaves the worker; only the compressed image crosses
  // the engine boundary.
  const renderEncoded = async () => {
    await ensureScopeOnPool();
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'pages.renderEncoded' as const,
        jobId,
        docId: input.scope.docId,
        ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
        pageObjectNumber: input.pageObjectNumber,
        options: preparedRenderOptions(),
        encode: {
          format,
          ...(imageOptions.quality !== undefined ? { quality: imageOptions.quality } : {}),
        },
      });
    const scope = input.scope;
    const result = await input.documentService.readOnPool(
      scope.ctx,
      scope.docId,
      scope.kind === 'layer' ? scope.layerName : undefined,
      build,
      input.signal,
    );
    if (result.tag !== 'pages.renderEncoded') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected pages.renderEncoded payload: ${result.tag}`,
      );
    }
    return result.image;
  };

  if (derived !== undefined && classification?.canonicalToken !== undefined) {
    // Read-through: object store (CDN-shaped bytes) first, one in-flight
    // producer per key, persist on miss. Store hits never touch a worker
    // session at all.
    const key =
      input.scope.kind === 'base'
        ? derived.baseKey(
            input.scope.ctx.tenantId,
            baseSha,
            input.pageObjectNumber,
            classification.canonicalToken,
            input.annotated,
          )
        : derived.layerKey(
            input.scope.ctx.tenantId,
            input.scope.docId,
            input.scope.layerName,
            input.pageObjectNumber,
            classification.canonicalToken,
            input.annotated,
          );
    const artifact = await derived.getOrRender(key, async () => {
      if (input.encodeInEngine) {
        const image = await renderEncoded();
        return { bytes: image.bytes, contentType: image.contentType };
      }
      return input.imageEncoder.encodeToBuffer(await renderRaster(), {
        format,
        quality: imageOptions.quality,
      });
    });
    setImmutableCache(input.reply);
    input.reply.type(artifact.contentType);
    return input.reply.send(Buffer.from(artifact.bytes));
  }

  // Compute-only path (off-lattice or unpinned): unchanged contract —
  // body plus the advisory dimension headers.
  if (input.encodeInEngine) {
    const image = await renderEncoded();
    requestedContentVersion === undefined
      ? setNoStore(input.reply)
      : setImmutableCache(input.reply);
    input.reply.type(image.contentType);
    input.reply.header('X-EmbedPDF-Image-Width', String(image.width));
    input.reply.header('X-EmbedPDF-Image-Height', String(image.height));
    return input.reply.send(Buffer.from(image.bytes));
  }
  const raster = await renderRaster();
  const encoded = input.imageEncoder.encode(raster, {
    format,
    quality: imageOptions.quality,
  });
  requestedContentVersion === undefined ? setNoStore(input.reply) : setImmutableCache(input.reply);
  input.reply.type(encoded.contentType);
  input.reply.header('X-EmbedPDF-Image-Width', String(raster.width));
  input.reply.header('X-EmbedPDF-Image-Height', String(raster.height));
  return input.reply.send(encoded.stream);
}

async function readPageText(input: {
  documentService: DocumentService;
  reply: { header(name: 'Cache-Control', value: string): unknown };
  signal: AbortSignal;
  scope: ReadScope;
  pageObjectNumber: number;
  requestedVersion?: number;
}) {
  const page = await resolvePageForRead(input);
  if (
    input.requestedVersion !== undefined &&
    input.requestedVersion !== page.cache.contentVersion
  ) {
    setNoStore(input.reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `${input.scope.kind === 'layer' ? 'layer ' : ''}text version ${
        input.requestedVersion
      } no longer current (current=${page.cache.contentVersion}) for page ${
        input.pageObjectNumber
      }`,
    );
  }

  if (input.scope.kind === 'layer') {
    await input.documentService.ensureLayerOnPool(
      input.scope.ctx,
      input.scope.docId,
      input.scope.layerName,
    );
  }
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'pages.text' as const,
      jobId,
      docId: input.scope.docId,
      ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
      pageObjectNumber: input.pageObjectNumber,
    });
  const scope = input.scope;
  const result = await input.documentService.readOnPool(
    scope.ctx,
    scope.docId,
    scope.kind === 'layer' ? scope.layerName : undefined,
    build,
    input.signal,
  );
  if (result.tag !== 'pages.text') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected ${input.scope.kind === 'layer' ? 'layer ' : ''}pages.text payload: ${result.tag}`,
    );
  }

  input.requestedVersion === undefined ? setNoStore(input.reply) : setImmutableCache(input.reply);
  // The text body is immutable and keyed by contentVersion. Annotation
  // liveness (revision / weak-state) changes on a different cadence, so it
  // is intentionally NOT baked in here; it lives on annotation reads.
  return result.snapshot;
}

async function readPageGeometry(input: {
  documentService: DocumentService;
  reply: { header(name: 'Cache-Control', value: string): unknown };
  signal: AbortSignal;
  scope: ReadScope;
  pageObjectNumber: number;
  requestedVersion?: number;
}) {
  const page = await resolvePageForRead(input);
  if (
    input.requestedVersion !== undefined &&
    input.requestedVersion !== page.cache.contentVersion
  ) {
    setNoStore(input.reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `${input.scope.kind === 'layer' ? 'layer ' : ''}geometry version ${
        input.requestedVersion
      } no longer current (current=${page.cache.contentVersion}) for page ${
        input.pageObjectNumber
      }`,
    );
  }

  if (input.scope.kind === 'layer') {
    await input.documentService.ensureLayerOnPool(
      input.scope.ctx,
      input.scope.docId,
      input.scope.layerName,
    );
  }
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'pages.geometry' as const,
      jobId,
      docId: input.scope.docId,
      ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
      pageObjectNumber: input.pageObjectNumber,
    });
  const scope = input.scope;
  const result = await input.documentService.readOnPool(
    scope.ctx,
    scope.docId,
    scope.kind === 'layer' ? scope.layerName : undefined,
    build,
    input.signal,
  );
  if (result.tag !== 'pages.geometry') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected ${
        input.scope.kind === 'layer' ? 'layer ' : ''
      }pages.geometry payload: ${result.tag}`,
    );
  }

  input.requestedVersion === undefined ? setNoStore(input.reply) : setImmutableCache(input.reply);
  // See readPageText: geometry is content-cached; liveness is not baked in.
  return result.snapshot;
}

async function resolvePageForRead(input: {
  documentService: DocumentService;
  scope: ReadScope;
  pageObjectNumber: number;
}): Promise<ManifestPage> {
  const { page } = await resolvePageAndManifestForRead(input);
  return page;
}

async function resolvePageAndManifestForRead(input: {
  documentService: DocumentService;
  scope: ReadScope;
  pageObjectNumber: number;
}): Promise<{ page: ManifestPage; baseSha: string }> {
  const manifest =
    input.scope.kind === 'layer'
      ? await input.documentService.getLayerManifest(
          input.scope.ctx,
          input.scope.docId,
          input.scope.layerName,
        )
      : await input.documentService.getManifest(input.scope.ctx, input.scope.docId);
  const page = manifest.pages.find((p) => p.state.pageObjectNumber === input.pageObjectNumber);
  if (page) {
    return { page, baseSha: manifest.baseSha };
  }
  throw new EngineError(
    EngineErrorCode.NotFound,
    input.scope.kind === 'layer'
      ? `no page with object number ${input.pageObjectNumber} in layer ${input.scope.layerName} for document ${input.scope.docId}`
      : `no page with object number ${input.pageObjectNumber} in document ${input.scope.docId}`,
  );
}
