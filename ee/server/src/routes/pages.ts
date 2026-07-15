import type { FastifyInstance, FastifyReply } from 'fastify';
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
  PageRenderQuerySchema,
  unflatten,
  type ManifestPage,
} from '@embedpdf/engine-core/wire';
import {
  requireDocAccessOnly,
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerResource,
  requireResource,
} from '../app/jwt-plugin';
import type { WorkerThreadPool } from '../runtime/WorkerThreadPool';
import type { DocumentService, OpenContext } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';
import type { SharpImageEncoder } from '../render/SharpImageEncoder';
import {
  abortSignalFromRequest,
  parseOrInvalidArg,
  parsePageObjectNumber,
  parseTokenOrInvalidArg,
  setImmutableCache,
  setNoStore,
  type SchemaLike,
} from './_helpers';

interface PageRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
  pool: WorkerThreadPool;
  imageEncoder: SharpImageEncoder;
}

type ReadScope =
  | { kind: 'base'; ctx: OpenContext; docId: string }
  | { kind: 'layer'; ctx: OpenContext; docId: string; layerName: string };

export async function registerPageRoutes(app: FastifyInstance, deps: PageRouteDeps): Promise<void> {
  const { documentService, layerService, pool, imageEncoder } = deps;

  app.get('/v1/docs/:docId/text/pages/:pon/data@:token', async (req, reply) => {
    const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId);
    const ctx = requireResource(req, docId, 'page-text', pdfBits);
    return readPageText({
      documentService,
      pool,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
      requestedVersion: parseTokenOrInvalidArg(decodeContentToken, token, 'contentVersion token'),
    });
  });

  app.get('/v1/docs/:docId/text/pages/:pon/data', async (req, reply) => {
    const { docId, pon } = req.params as { docId: string; pon: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId);
    const ctx = requireResource(req, docId, 'page-text', pdfBits);
    return readPageText({
      documentService,
      pool,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
    });
  });

  app.get('/v1/docs/:docId/geometry/pages/:pon/data@:token', async (req, reply) => {
    const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId);
    const ctx = requireResource(req, docId, 'page-geometry', pdfBits);
    return readPageGeometry({
      documentService,
      pool,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
      requestedVersion: parseTokenOrInvalidArg(decodeContentToken, token, 'contentVersion token'),
    });
  });

  app.get('/v1/docs/:docId/geometry/pages/:pon/data', async (req, reply) => {
    const { docId, pon } = req.params as { docId: string; pon: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId);
    const ctx = requireResource(req, docId, 'page-geometry', pdfBits);
    return readPageGeometry({
      documentService,
      pool,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
    });
  });

  app.get('/v1/docs/:docId/render/pages/:pon/data@:token', async (req, reply) => {
    const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId);
    const ctx = requireResource(req, docId, 'page-render', pdfBits);
    return renderPageImage({
      documentService,
      pool,
      imageEncoder,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
      tokenQuery: parseTokenOrInvalidArg(decodeRenderToken, token, 'render token'),
      query: req.query,
    });
  });

  app.get('/v1/docs/:docId/render/pages/:pon/data', async (req, reply) => {
    const { docId, pon } = req.params as { docId: string; pon: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId);
    const ctx = requireResource(req, docId, 'page-render', pdfBits);
    return renderPageImage({
      documentService,
      pool,
      imageEncoder,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
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
      pool,
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
      pool,
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
        pool,
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
      pool,
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
      pool,
      imageEncoder,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
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
      pool,
      imageEncoder,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
      pageObjectNumber: parsePageObjectNumber(pon),
      query: req.query,
    });
  });

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
  pool: WorkerThreadPool;
  imageEncoder: SharpImageEncoder;
  reply: FastifyReply;
  signal: AbortSignal;
  scope: ReadScope;
  pageObjectNumber: number;
  tokenQuery?: Record<string, string>;
  query: unknown;
}) {
  const page = await resolvePageForRead(input);
  if (input.tokenQuery !== undefined) rejectQueryParamsOnTokenUrl(input.query);
  // Both token and query strings arrive as flat string maps. Generic
  // `unflatten` turns dotted keys (`viewport.kind`, `target.rect.left`) into
  // the nested object `PageRenderQuerySchema` expects. The schema then
  // coerces, validates, and shapes the result into `PageRenderQuery`.
  const flatInput = (input.tokenQuery ?? input.query) as Record<string, unknown>;
  const nested = unflatten(flatInput);
  const parsedQuery = parseOrInvalidArg(
    PageRenderQuerySchema,
    nested,
    input.tokenQuery === undefined ? 'render query' : 'render token',
  );
  const imageOptions: PageImageOptions = parsedQuery.options;
  const requestedContentVersion = parsedQuery.contentVersion;
  const requestedAnnotationVersion = parsedQuery.annotationVersion;
  const includeAnnotations = imageOptions.includeAnnotations ?? true;
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

  if (input.scope.kind === 'layer') {
    await input.documentService.ensureLayerOnPool(
      input.scope.ctx,
      input.scope.docId,
      input.scope.layerName,
    );
  }

  const renderOptions = pageRenderOptionsFromImageOptions(imageOptions, includeAnnotations);
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'pages.render' as const,
      jobId,
      docId: input.scope.docId,
      ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
      pageObjectNumber: input.pageObjectNumber,
      options: renderOptions,
    });
  const result = await input.pool.run(input.scope.docId, build, input.signal);
  if (result.tag !== 'pages.render') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected layer pages.render payload: ${result.tag}`,
    );
  }

  const encoded = input.imageEncoder.encode(result.raster, {
    format,
    quality: imageOptions.quality,
  });
  requestedContentVersion === undefined ? setNoStore(input.reply) : setImmutableCache(input.reply);
  input.reply.type(encoded.contentType);
  input.reply.header('X-EmbedPDF-Image-Width', String(result.raster.width));
  input.reply.header('X-EmbedPDF-Image-Height', String(result.raster.height));
  return input.reply.send(encoded.stream);
}

async function readPageText(input: {
  documentService: DocumentService;
  pool: WorkerThreadPool;
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
  const result = await input.pool.run(input.scope.docId, build, input.signal);
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
  pool: WorkerThreadPool;
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
  const result = await input.pool.run(input.scope.docId, build, input.signal);
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
    return page;
  }
  throw new EngineError(
    EngineErrorCode.NotFound,
    input.scope.kind === 'layer'
      ? `no page with object number ${input.pageObjectNumber} in layer ${input.scope.layerName} for document ${input.scope.docId}`
      : `no page with object number ${input.pageObjectNumber} in document ${input.scope.docId}`,
  );
}
