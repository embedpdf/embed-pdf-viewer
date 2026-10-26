import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';

import { DownloadLinkRequestSchema } from '@cloudpdf/contract';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  DEFAULT_PDF_SAVE_MODE,
  EngineError,
  EngineErrorCode,
  type PdfSaveMode,
} from '@embedpdf/engine-core/runtime';
import {
  decodeDocToken,
  decodeDownloadToken,
  decodeLayoutToken,
  decodeActionsToken,
  PdfSaveModeSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import {
  requireDocAccessOnly,
  requireLayerDocAccessOnly,
  requireLayerResource,
  requireResource,
} from '../app/jwt-plugin';
import type { SignDevTokenInput } from '../auth/JwtVerifier';
import type { DocumentService, OpenContext, PdfDownload } from '../services/DocumentService';
import { abortSignalOf, parseTokenOrInvalidArg, setImmutableCache, setNoStore } from './_helpers';
import { requireSharedDocRead } from './_planeGuard';

export interface DocsRouteDeps {
  service: DocumentService;
  /** Mints download links; absent where the deployment only verifies tokens (JWKS). */
  sign?: (input: SignDevTokenInput) => string;
}

/** How long a download link works unless its maker says otherwise. */
const DEFAULT_DOWNLOAD_LINK_SECONDS = 5 * 60;

/**
 * Document-level cloud routes: heads, manifests, and pre-warm.
 *
 * Page, annotation, and metadata endpoints live in their domain route
 * modules so reads and writes for the same concept stay together.
 */
export async function registerDocsRoutes(app: FastifyInstance, deps: DocsRouteDeps): Promise<void> {
  const { service } = deps;

  // Helper: every read route needs the document's PDF bits before the
  // capability check (they drive `pdf.permissions` expansion). For
  // encrypted documents the DB row is stale (populated by an anonymous
  // probe at ingest); the authoritative bits live in the caller's
  // active password session. `getEffectivePdfBits` encapsulates the
  // precedence so route handlers don't have to think about it.
  const bitsForDoc = async (accessCtx: ReturnType<typeof requireDocAccessOnly>, docId: string) =>
    service.getEffectivePdfBits(accessCtx, docId);
  const bitsForLayer = async (
    accessCtx: ReturnType<typeof requireLayerDocAccessOnly>,
    docId: string,
    layerName: string,
  ) => service.getEffectivePdfBits(accessCtx, docId, layerName);

  app.get('/v1/docs/:docId/head', async (req, reply) => {
    const { docId } = req.params as { docId: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'head', pdfBits);
    const head = await service.getHead(ctx, docId);
    setNoStore(reply);
    return head;
  });

  app.get('/v1/docs/:docId/manifest@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'manifest', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeDocToken, token, 'docVersion token');
    const manifest = await service.getManifest(ctx, docId);
    if (requested !== manifest.docVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `manifest version ${requested} no longer current (current=${manifest.docVersion})`,
      );
    }
    setImmutableCache(reply);
    return manifest;
  });

  app.get('/v1/docs/:docId/manifest', async (req, reply) => {
    const { docId } = req.params as { docId: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'manifest', pdfBits);
    const manifest = await service.getManifest(ctx, docId);
    setNoStore(reply);
    return manifest;
  });

  // ── Plane-scoped doc-level reads: served from the base worker session,
  //    visible through a layer-pinned token only while the plane each
  //    depends on is inherited (`requireSharedDocRead` = auth chain +
  //    origin plane guard). ────────────────────────────────────────────────

  app.get('/v1/docs/:docId/layout@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const ctx = await requireSharedDocRead(req, service, docId, 'layout', ['layout']);
    const requested = parseTokenOrInvalidArg(decodeLayoutToken, token, 'layoutVersion token');
    const manifest = await service.getManifest(ctx, docId);
    if (requested !== manifest.layoutVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `layout version ${requested} no longer current (current=${manifest.layoutVersion})`,
      );
    }
    const snapshot = await service.getLayerLayout(ctx, docId, undefined, abortSignalOf(reply));
    setImmutableCache(reply);
    return snapshot;
  });

  app.get('/v1/docs/:docId/actions@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const ctx = await requireSharedDocRead(req, service, docId, 'actions', ['actions']);
    const requested = parseTokenOrInvalidArg(decodeActionsToken, token, 'actionsVersion token');
    const manifest = await service.getManifest(ctx, docId);
    if (requested !== manifest.actionsVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `actions version ${requested} no longer current (current=${manifest.actionsVersion})`,
      );
    }
    const snapshot = await service.getLayerActions(ctx, docId, undefined, abortSignalOf(reply));
    setImmutableCache(reply);
    return snapshot;
  });

  app.get('/v1/docs/:docId/layers/:layerName/head', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'head', pdfBits);
    const head = await service.getLayerHead(ctx, docId, layerName);
    setNoStore(reply);
    return head;
  });

  app.get('/v1/docs/:docId/layers/:layerName/manifest@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-manifest', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeDocToken, token, 'layerDocVersion token');
    const manifest = await service.getLayerManifest(ctx, docId, layerName);
    if (requested !== manifest.docVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `layer manifest version ${requested} no longer current (current=${manifest.docVersion})`,
      );
    }
    setImmutableCache(reply);
    return manifest;
  });

  app.get('/v1/docs/:docId/layers/:layerName/manifest', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-manifest', pdfBits);
    const manifest = await service.getLayerManifest(ctx, docId, layerName);
    setNoStore(reply);
    return manifest;
  });

  app.get('/v1/docs/:docId/layers/:layerName/layout@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-layout', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeLayoutToken, token, 'layoutVersion token');
    const manifest = await service.getLayerManifest(ctx, docId, layerName);
    if (requested !== manifest.layoutVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `layout version ${requested} no longer current (current=${manifest.layoutVersion})`,
      );
    }
    const snapshot = await service.getLayerLayout(ctx, docId, layerName, abortSignalOf(reply));
    setImmutableCache(reply);
    return snapshot;
  });

  app.get('/v1/docs/:docId/layers/:layerName/layout', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-layout', pdfBits);
    const snapshot = await service.getLayerLayout(ctx, docId, layerName, abortSignalOf(reply));
    setNoStore(reply);
    return snapshot;
  });

  app.get('/v1/docs/:docId/layers/:layerName/actions@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-actions', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeActionsToken, token, 'actionsVersion token');
    const manifest = await service.getLayerManifest(ctx, docId, layerName);
    if (requested !== manifest.actionsVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `actions version ${requested} no longer current (current=${manifest.actionsVersion})`,
      );
    }
    const snapshot = await service.getLayerActions(ctx, docId, layerName, abortSignalOf(reply));
    setImmutableCache(reply);
    return snapshot;
  });

  /**
   * A layer's PDF. Incremental (the default) is its base file followed by
   * its stored delta, with no engine involved; a rewrite, or an artifact
   * this server doesn't read, is saved by the engine.
   */
  const layerDownload = async (
    ctx: OpenContext,
    docId: string,
    layerName: string,
    mode: PdfSaveMode,
    opts: { passwordChecked?: boolean } = {},
  ): Promise<PdfDownload> => {
    if (mode === 'incremental') {
      const direct = await service.incrementalLayerDownload(ctx, docId, layerName, opts);
      if (direct) return direct;
    }
    const file = await service.saveLayerDownloadToTemp(ctx, docId, layerName, mode);
    return { size: file.size, open: () => createReadStream(file.path), cleanup: file.cleanup };
  };

  app.get('/v1/docs/:docId/layers/:layerName/download@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    // A download link (`?link=`) opens exactly the version it was made for.
    const link = req.downloadLink;
    rejectQueryParamsOnTokenUrl(req.query, link ? ['link'] : []);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'download-versioned', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeDownloadToken, token, 'download token');
    if (link && (link.docVersion !== requested.docVersion || link.mode !== requested.mode)) {
      throw new EngineError(
        EngineErrorCode.Forbidden,
        `this link downloads version ${link.docVersion} (${link.mode}) only`,
      );
    }
    const current = await service.layerDocVersion(ctx, docId, layerName);
    if (requested.docVersion !== current) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `download version ${requested.docVersion} no longer current (current=${current})`,
      );
    }
    // The link's maker passed the password check; the link carries no password.
    const file = await layerDownload(ctx, docId, layerName, requested.mode, {
      passwordChecked: link !== undefined,
    });
    return sendDownload(
      reply,
      file,
      docId,
      layerName,
      requested.mode,
      link ? 'no-store' : 'immutable',
    );
  });

  /**
   * A download link: the layer's versioned download URL with a token in
   * `link` that opens only that download, for a service that takes a plain
   * URL and no Authorization header. It downloads the layer as it is now;
   * once the layer changes it answers 404.
   */
  app.post('/v1/docs/:docId/layers/:layerName/download-link', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'download-current', pdfBits);
    const parsed = DownloadLinkRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `invalid download link request: ${parsed.error.message}`,
      );
    }
    if (!deps.sign) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        'this deployment verifies tokens with its own keys: make download links on your backend, as a doc token with layer_name and a `download` claim',
      );
    }
    await service.checkOpenPassword(ctx, docId, layerName);
    const download = {
      docVersion: await service.layerDocVersion(ctx, docId, layerName),
      mode: 'incremental' as const,
    };
    const expiresIn = parsed.data.expiresIn ?? DEFAULT_DOWNLOAD_LINK_SECONDS;
    const linkToken = deps.sign({
      sub: `link:${ctx.sub}`,
      tenant_id: ctx.tenantId,
      doc_id: docId,
      layer_name: layerName,
      scope: ['doc.download'],
      jti: randomUUID(),
      ttlSeconds: expiresIn,
      extras: { download },
    });
    const path = wirePaths.layerDownloadVersioned(docId, layerName, download);
    setNoStore(reply);
    return {
      url: `${req.protocol}://${req.host}${path}?link=${encodeURIComponent(linkToken)}`,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    };
  });

  app.get('/v1/docs/:docId/layers/:layerName/download', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'download-current', pdfBits);
    const mode = parseDownloadMode(req.query);
    const file = await layerDownload(ctx, docId, layerName, mode);
    return sendDownload(reply, file, docId, layerName, mode, 'no-store');
  });

  app.post(wirePaths.docWarm, async (req) => {
    const body = (req.body ?? {}) as { docId?: unknown };
    if (typeof body.docId !== 'string' || body.docId.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, `request body missing "docId"`);
    }
    const docId = body.docId;
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'head', pdfBits);
    const head = await service.warm(ctx, docId);
    return { warmed: true, head };
  });
}

function rejectQueryParamsOnTokenUrl(query: unknown, allowed: readonly string[] = []): void {
  if (
    query &&
    typeof query === 'object' &&
    Object.keys(query).some((key) => !allowed.includes(key))
  ) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'versioned download URLs must encode download options in the path token, not query params',
    );
  }
}

function sendDownload(
  reply: FastifyReply,
  file: PdfDownload,
  docId: string,
  layerName: string,
  mode: PdfSaveMode,
  cache: 'immutable' | 'no-store',
) {
  cache === 'immutable' ? setImmutableCache(reply) : setNoStore(reply);
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Length', String(file.size));
  reply.header(
    'Content-Disposition',
    `attachment; filename="${downloadFileName(docId, layerName, mode)}"`,
  );

  const stream = file.open();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    void file.cleanup();
  };
  stream.once('close', cleanup);
  stream.once('error', cleanup);
  reply.raw.once('close', cleanup);
  return reply.send(stream);
}

function parseDownloadMode(query: unknown): PdfSaveMode {
  const mode = query && typeof query === 'object' ? (query as { mode?: unknown }).mode : undefined;
  if (mode === undefined) return DEFAULT_PDF_SAVE_MODE;
  const parsed = PdfSaveModeSchema.safeParse(mode);
  if (!parsed.success) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'query.mode must be either "incremental" or "rewrite"',
    );
  }
  return parsed.data;
}

function downloadFileName(docId: string, layerName: string, mode: PdfSaveMode): string {
  return `${safeHeaderFilePart(docId)}-${safeHeaderFilePart(layerName)}-${mode}.pdf`;
}

function safeHeaderFilePart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'document';
}
