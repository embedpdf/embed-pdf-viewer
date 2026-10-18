import type { FastifyInstance } from 'fastify';
import { EngineError, EngineErrorCode, type DocumentManifest } from '@embedpdf/engine-core/runtime';
import { decodeOutlineToken, type OutlineToken } from '@embedpdf/engine-core/wire';
import { requireLayerDocAccessOnly, requireLayerResource } from '../app/jwt-plugin';
import type { DocumentService } from '../services/DocumentService';
import { abortSignalOf, parseTokenOrInvalidArg, setImmutableCache, setNoStore } from './_helpers';
import { requireSharedDocRead } from './_planeGuard';

interface OutlineRouteDeps {
  service: DocumentService;
}

/**
 * The document's outline (`doc.outline.get()`): one read, gated by `doc.open`
 * like the metadata. It is read in page space, so its URL pins the outline
 * and the layout (`/outline@{layoutVersion, outlineVersion}`): a page delete
 * or a box change moves what it reads without an outline write. Writes go
 * through `POST …/changes` (the `outline.*` ops); there is no route of their
 * own.
 */
export async function registerOutlineRoutes(
  app: FastifyInstance,
  deps: OutlineRouteDeps,
): Promise<void> {
  const { service } = deps;

  // Plane-scoped doc-level read: served from the base worker session while
  // the caller's layer inherits both planes it depends on.
  app.get('/v1/docs/:docId/outline@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const ctx = await requireSharedDocRead(req, service, docId, 'outline', ['outline', 'layout']);
    const requested = parseTokenOrInvalidArg(decodeOutlineToken, token, 'outline token');
    assertCurrent(requested, await service.getManifest(ctx, docId), reply);
    const body = await service.readLayerOutline(ctx, docId, undefined, abortSignalOf(reply));
    setImmutableCache(reply);
    return body;
  });

  app.get('/v1/docs/:docId/layers/:layerName/outline@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await service.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-outline', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeOutlineToken, token, 'outline token');
    assertCurrent(requested, await service.getLayerManifest(ctx, docId, layerName), reply);
    const body = await service.readLayerOutline(ctx, docId, layerName, abortSignalOf(reply));
    setImmutableCache(reply);
    return body;
  });

  app.get('/v1/docs/:docId/layers/:layerName/outline', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await service.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-outline', pdfBits);
    const body = await service.readLayerOutline(ctx, docId, layerName, abortSignalOf(reply));
    setNoStore(reply);
    return body;
  });
}

/** A pinned read answers only at the manifest's current pins; a stale one is a 404. */
function assertCurrent(
  requested: OutlineToken,
  manifest: DocumentManifest,
  reply: Parameters<typeof setNoStore>[0],
): void {
  if (
    requested.outlineVersion === manifest.outlineVersion &&
    requested.layoutVersion === manifest.layoutVersion
  ) {
    return;
  }
  setNoStore(reply);
  throw new EngineError(
    EngineErrorCode.NotFound,
    `outline ${requested.outlineVersion}/${requested.layoutVersion} no longer current ` +
      `(current=${manifest.outlineVersion}/${manifest.layoutVersion})`,
  );
}
