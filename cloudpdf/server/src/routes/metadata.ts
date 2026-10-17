import type { FastifyInstance } from 'fastify';
import {
  EngineError,
  EngineErrorCode,
  type CustomMetadataPatch,
  type MetadataPatch,
} from '@embedpdf/engine-core/runtime';
import {
  CustomMetadataPatchSchema,
  decodeMetadataToken,
  MetadataPatchSchema,
  type DocResourceId,
} from '@embedpdf/engine-core/wire';
import {
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerResource,
} from '../app/jwt-plugin';
import type { DocumentService, OpenContext } from '../services/DocumentService';
import type { LayerService, LayerWriteContext } from '../services/LayerService';
import {
  abortSignalOf,
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

/**
 * One half of the Info dict. The standard fields live at `/metadata`, the
 * custom keys at `/metadata/custom`; both share the `metadataVersion` pointer
 * and the same gates (`doc.open` to read, `doc.metadata.modify` to write).
 */
interface InfoDictHalf {
  segment: 'metadata' | 'metadata/custom';
  docResource: DocResourceId;
  layerResource: DocResourceId;
  read: (
    ctx: OpenContext,
    docId: string,
    layerName: string | undefined,
    signal: AbortSignal,
  ) => Promise<unknown>;
  write: (
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; body: unknown },
    signal: AbortSignal,
  ) => Promise<unknown>;
}

export async function registerMetadataRoutes(
  app: FastifyInstance,
  deps: MetadataRouteDeps,
): Promise<void> {
  const { service, layerService } = deps;

  const halves: InfoDictHalf[] = [
    {
      segment: 'metadata',
      docResource: 'metadata',
      layerResource: 'layer-metadata',
      read: (ctx, docId, layerName, signal) =>
        service.readLayerMetadata(ctx, docId, layerName, signal),
      write: (ctx, { docId, layerName, body }, signal) => {
        const patch = parseOrInvalidArg<MetadataPatch>(
          MetadataPatchSchema as unknown as SchemaLike<MetadataPatch>,
          body,
          'request body',
        );
        return layerService.updateMetadata(ctx, { docId, layerName, patch }, signal);
      },
    },
    {
      segment: 'metadata/custom',
      docResource: 'metadata-custom',
      layerResource: 'layer-metadata-custom',
      read: (ctx, docId, layerName, signal) =>
        service.readLayerCustomMetadata(ctx, docId, layerName, signal),
      write: (ctx, { docId, layerName, body }, signal) => {
        const patch = parseOrInvalidArg<CustomMetadataPatch>(
          CustomMetadataPatchSchema as unknown as SchemaLike<CustomMetadataPatch>,
          body,
          'request body',
        );
        return layerService.updateCustomMetadata(ctx, { docId, layerName, patch }, signal);
      },
    },
  ];

  for (const half of halves) {
    // Plane-scoped doc-level read: served from the base worker session while
    // the caller's layer inherits the metadata plane.
    app.get(`/v1/docs/:docId/${half.segment}@:token`, async (req, reply) => {
      const { docId, token } = req.params as { docId: string; token: string };
      const ctx = await requireSharedDocRead(req, service, docId, half.docResource, ['metadata']);
      const requested = parseTokenOrInvalidArg(decodeMetadataToken, token, 'metadataVersion token');
      const manifest = await service.getManifest(ctx, docId);
      if (requested !== manifest.metadataVersion) {
        setNoStore(reply);
        throw new EngineError(
          EngineErrorCode.NotFound,
          `metadata version ${requested} no longer current (current=${manifest.metadataVersion})`,
        );
      }
      const body = await half.read(ctx, docId, undefined, abortSignalOf(reply));
      setImmutableCache(reply);
      return body;
    });

    app.get(`/v1/docs/:docId/layers/:layerName/${half.segment}@:token`, async (req, reply) => {
      const { docId, layerName, token } = req.params as {
        docId: string;
        layerName: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await service.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, half.layerResource, pdfBits);
      const requested = parseTokenOrInvalidArg(decodeMetadataToken, token, 'metadataVersion token');
      const manifest = await service.getLayerManifest(ctx, docId, layerName);
      if (requested !== manifest.metadataVersion) {
        setNoStore(reply);
        throw new EngineError(
          EngineErrorCode.NotFound,
          `metadata version ${requested} no longer current (current=${manifest.metadataVersion})`,
        );
      }
      const body = await half.read(ctx, docId, layerName, abortSignalOf(reply));
      setImmutableCache(reply);
      return body;
    });

    app.get(`/v1/docs/:docId/layers/:layerName/${half.segment}`, async (req, reply) => {
      const { docId, layerName } = req.params as {
        docId: string;
        layerName: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await service.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, half.layerResource, pdfBits);
      const body = await half.read(ctx, docId, layerName, abortSignalOf(reply));
      setNoStore(reply);
      return body;
    });

    app.post(`/v1/docs/:docId/layers/:layerName/${half.segment}`, async (req, reply) => {
      const { docId, layerName } = req.params as {
        docId: string;
        layerName: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await service.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.metadata.modify', pdfBits);
      setNoStore(reply);
      return half.write(ctx, { docId, layerName, body: req.body }, abortSignalOf(reply));
    });
  }
}
