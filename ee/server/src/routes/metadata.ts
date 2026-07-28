import type { FastifyInstance } from 'fastify';
import { EngineError, EngineErrorCode, type MetadataPatch } from '@embedpdf/engine-core/runtime';
import { decodeMetadataToken, MetadataPatchSchema } from '@embedpdf/engine-core/wire';
import {
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerResource,
} from '../app/jwt-plugin';
import type { DocumentService } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';
import {
  abortSignalFromRequest,
  parseOrInvalidArg,
  parseTokenOrInvalidArg,
  setImmutableCache,
  setNoStore,
  type SchemaLike,
} from './_helpers';
import { requireSharedDocRead } from './_planeGuard';

interface MetadataRouteDeps {
  service: DocumentService;
  layerService: LayerService;
}

export async function registerMetadataRoutes(
  app: FastifyInstance,
  deps: MetadataRouteDeps,
): Promise<void> {
  const { service, layerService } = deps;

  // WS2b doc-level (shared) read: served from the BASE worker session while
  // the caller's layer inherits the metadata plane.
  app.get('/v1/docs/:docId/metadata@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const ctx = await requireSharedDocRead(req, service, docId, 'metadata', ['metadata']);
    const requested = parseTokenOrInvalidArg(decodeMetadataToken, token, 'metadataVersion token');
    const manifest = await service.getManifest(ctx, docId);
    if (requested !== manifest.metadataVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `metadata version ${requested} no longer current (current=${manifest.metadataVersion})`,
      );
    }
    const metadata = await service.readLayerMetadata(
      ctx,
      docId,
      undefined,
      abortSignalFromRequest(req),
    );
    setImmutableCache(reply);
    return metadata;
  });

  app.get('/v1/docs/:docId/layers/:layerName/metadata@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await service.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-metadata', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeMetadataToken, token, 'metadataVersion token');
    const manifest = await service.getLayerManifest(ctx, docId, layerName);
    if (requested !== manifest.metadataVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `metadata version ${requested} no longer current (current=${manifest.metadataVersion})`,
      );
    }
    const metadata = await service.readLayerMetadata(
      ctx,
      docId,
      layerName,
      abortSignalFromRequest(req),
    );
    setImmutableCache(reply);
    return metadata;
  });

  app.get('/v1/docs/:docId/layers/:layerName/metadata', async (req, reply) => {
    const { docId, layerName } = req.params as {
      docId: string;
      layerName: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await service.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-metadata', pdfBits);
    const metadata = await service.readLayerMetadata(
      ctx,
      docId,
      layerName,
      abortSignalFromRequest(req),
    );
    setNoStore(reply);
    return metadata;
  });

  app.post('/v1/docs/:docId/layers/:layerName/metadata', async (req, reply) => {
    const { docId, layerName } = req.params as {
      docId: string;
      layerName: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await service.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.metadata.modify', pdfBits);
    const patch = parseOrInvalidArg<MetadataPatch>(
      MetadataPatchSchema as unknown as SchemaLike<MetadataPatch>,
      req.body,
      'request body',
    );

    setNoStore(reply);
    return layerService.updateMetadata(
      ctx,
      { docId, layerName, patch },
      abortSignalFromRequest(req),
    );
  });
}
