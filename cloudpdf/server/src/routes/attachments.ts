import { createReadStream } from 'node:fs';

import { EngineError, EngineErrorCode, type EmbeddedFileRef } from '@embedpdf/engine-core/runtime';
import {
  WireAttachmentFileSchema,
  decodeAttachmentsToken,
  decodeTokenText,
  encodeTokenText,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  abortSignalFromRequest,
  parseOrInvalidArg,
  parsePageObjectNumber,
  parseTokenOrInvalidArg,
  setImmutableCache,
  setNoStore,
} from './_helpers';
import { readMutationEnvelope } from './_mutationEnvelope';
import { refFromKey } from './annotation-route-helpers';
import {
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerResource,
} from '../app/jwt-plugin';
import { requireSharedDocRead } from './_planeGuard';
import type { DocumentService, SavedAttachmentFile } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';

export interface AttachmentRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
}

/**
 * Document-level attachments (the catalog's `/EmbeddedFiles` name tree)
 * plus the decoded bytes of both attachment homes.
 *
 * Two permission tiers under DISTINCT path prefixes (the
 * search-rects/search-full rule, encoded in `DOC_RESOURCES`):
 *
 *   /attachments@{v}                       — metadata listing (doc.open)
 *   /attachment-files/{key}/data@{v}       — doc-level bytes (doc.download)
 *   /attachment-files/pages/{pon}/items/{annotKey}/data@{v}
 *                                          — annotation bytes (doc.download)
 *
 * Every read is versioned by the manifest's `attachmentsVersion` pin and
 * immutable — a stale pin 404s into the client's manifest-refresh retry.
 * Mutations are origin-only:
 *
 *   POST   /attachments                    — create (multipart envelope)
 *   DELETE /attachments/{fileKey}          — delete by name-tree key
 *
 * `{fileKey}` path segments carry the tree key through `encodeTokenText`
 * (keys are arbitrary unicode; the token-text alphabet keeps them
 * URL-safe with no percent-encoding ambiguity).
 */
export async function registerAttachmentRoutes(
  app: FastifyInstance,
  deps: AttachmentRouteDeps,
): Promise<void> {
  const { documentService, layerService } = deps;

  // ── Plane-scoped doc-level reads: served from the BASE worker session —
  //    no layer session is created for plane-inheriting visitors. The plane
  //    guard + auth chain live in `requireSharedDocRead` (one door). ──────

  app.get('/v1/docs/:docId/attachments@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'attachments', [
      'attachments',
    ]);
    const requested = parseTokenOrInvalidArg(decodeAttachmentsToken, token, 'attachments token');
    const manifest = await documentService.getManifest(ctx, docId);
    if (requested !== manifest.attachmentsVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `attachments version ${requested} no longer current (current=${manifest.attachmentsVersion})`,
      );
    }
    const items = await documentService.listAttachments(
      ctx,
      docId,
      undefined,
      abortSignalFromRequest(req),
    );
    setImmutableCache(reply);
    return items;
  });

  app.get('/v1/docs/:docId/attachment-files/:fileKey/data@:token', async (req, reply) => {
    const { docId, fileKey, token } = req.params as {
      docId: string;
      fileKey: string;
      token: string;
    };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'attachment-files', [
      'attachments',
    ]);
    const requested = parseTokenOrInvalidArg(decodeAttachmentsToken, token, 'attachments token');
    const manifest = await documentService.getManifest(ctx, docId);
    if (requested !== manifest.attachmentsVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `attachments version ${requested} no longer current (current=${manifest.attachmentsVersion})`,
      );
    }
    const ref = attachmentRefFromPath(fileKey);
    const file = await documentService.readAttachmentFileToTemp(
      ctx,
      docId,
      undefined,
      ref,
      abortSignalFromRequest(req),
    );
    return sendAttachmentFile(reply, file, 'immutable');
  });

  app.get(
    '/v1/docs/:docId/attachment-files/pages/:pon/items/:annotKey/data@:token',
    async (req, reply) => {
      const { docId, pon, annotKey, token } = req.params as {
        docId: string;
        pon: string;
        annotKey: string;
        token: string;
      };
      // A FileAttachment annotation's bytes depend on BOTH planes: the
      // annotation must exist in this view (`annotations`) and the byte pin
      // is `attachmentsVersion` (`attachments`). The edge grant only gates
      // the `attachments` plane (see RESOURCE_PLANES) — this origin check
      // is the stricter truth.
      const ctx = await requireSharedDocRead(req, documentService, docId, 'attachment-files', [
        'annotations',
        'attachments',
      ]);
      const requested = parseTokenOrInvalidArg(decodeAttachmentsToken, token, 'attachments token');
      const manifest = await documentService.getManifest(ctx, docId);
      if (requested !== manifest.attachmentsVersion) {
        setNoStore(reply);
        throw new EngineError(
          EngineErrorCode.NotFound,
          `attachments version ${requested} no longer current (current=${manifest.attachmentsVersion})`,
        );
      }
      const pageObjectNumber = parsePageObjectNumber(pon);
      // Durable keys only, mirroring the layer route: weak index refs need
      // a revision-validated body, which a cacheable GET does not have.
      const ref = refFromKey(annotKey, pageObjectNumber);
      const file = await documentService.readAnnotationFileToTemp(
        ctx,
        docId,
        undefined,
        pageObjectNumber,
        ref,
        abortSignalFromRequest(req),
      );
      return sendAttachmentFile(reply, file, 'immutable');
    },
  );

  app.get('/v1/docs/:docId/layers/:layerName/attachments@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-attachments', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeAttachmentsToken, token, 'attachments token');
    const manifest = await documentService.getLayerManifest(ctx, docId, layerName);
    if (requested !== manifest.attachmentsVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `attachments version ${requested} no longer current (current=${manifest.attachmentsVersion})`,
      );
    }
    const items = await documentService.listAttachments(
      ctx,
      docId,
      layerName,
      abortSignalFromRequest(req),
    );
    setImmutableCache(reply);
    return items;
  });

  app.get(
    '/v1/docs/:docId/layers/:layerName/attachment-files/:fileKey/data@:token',
    async (req, reply) => {
      const { docId, layerName, fileKey, token } = req.params as {
        docId: string;
        layerName: string;
        fileKey: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-attachment-files', pdfBits);
      const requested = parseTokenOrInvalidArg(decodeAttachmentsToken, token, 'attachments token');
      const manifest = await documentService.getLayerManifest(ctx, docId, layerName);
      if (requested !== manifest.attachmentsVersion) {
        setNoStore(reply);
        throw new EngineError(
          EngineErrorCode.NotFound,
          `attachments version ${requested} no longer current (current=${manifest.attachmentsVersion})`,
        );
      }
      const ref = attachmentRefFromPath(fileKey);
      const file = await documentService.readAttachmentFileToTemp(
        ctx,
        docId,
        layerName,
        ref,
        abortSignalFromRequest(req),
      );
      return sendAttachmentFile(reply, file, 'immutable');
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/attachment-files/pages/:pon/items/:annotKey/data@:token',
    async (req, reply) => {
      const { docId, layerName, pon, annotKey, token } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
        annotKey: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-attachment-files', pdfBits);
      const requested = parseTokenOrInvalidArg(decodeAttachmentsToken, token, 'attachments token');
      const manifest = await documentService.getLayerManifest(ctx, docId, layerName);
      if (requested !== manifest.attachmentsVersion) {
        setNoStore(reply);
        throw new EngineError(
          EngineErrorCode.NotFound,
          `attachments version ${requested} no longer current (current=${manifest.attachmentsVersion})`,
        );
      }
      const pageObjectNumber = parsePageObjectNumber(pon);
      // Only durable keys are addressable on this content-addressed leaf:
      // weak index refs need a revision-validated request body, which a
      // cacheable GET deliberately does not have.
      const ref = refFromKey(annotKey, pageObjectNumber);
      const file = await documentService.readAnnotationFileToTemp(
        ctx,
        docId,
        layerName,
        pageObjectNumber,
        ref,
        abortSignalFromRequest(req),
      );
      return sendAttachmentFile(reply, file, 'immutable');
    },
  );

  app.post('/v1/docs/:docId/layers/:layerName/attachments', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.attachments.modify', pdfBits);
    // Attachments accept ANY binary format — that is the point of the
    // kind — so every resource part rides the 'any' policy.
    const { body, resources } = await readMutationEnvelope(req, () => 'any');
    const file = parseOrInvalidArg(WireAttachmentFileSchema, body, 'request body');
    if (!resources?.[file.resource]) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `body references resource '${file.resource}' but no such multipart part arrived`,
      );
    }
    setNoStore(reply);
    return layerService.createAttachment(
      ctx,
      { docId, layerName, file, resources },
      abortSignalFromRequest(req),
    );
  });

  app.delete('/v1/docs/:docId/layers/:layerName/attachments/:fileKey', async (req, reply) => {
    const { docId, layerName, fileKey } = req.params as {
      docId: string;
      layerName: string;
      fileKey: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.attachments.modify', pdfBits);
    const ref = attachmentRefFromPath(fileKey);
    setNoStore(reply);
    return layerService.deleteAttachment(
      ctx,
      { docId, layerName, ref },
      abortSignalFromRequest(req),
    );
  });
}

function attachmentRefFromPath(fileKey: string): EmbeddedFileRef {
  let key: string;
  try {
    key = decodeTokenText(fileKey);
  } catch {
    throw new EngineError(EngineErrorCode.InvalidArg, `malformed attachment key '${fileKey}'`);
  }
  if (key.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'attachment key must not be empty');
  }
  return { kind: 'key', key };
}

/**
 * Stream a decoded attachment temp file. Metadata rides headers the SDK
 * decodes: `Content-Type` for the mime and `X-EmbedPDF-File-Name` for the
 * file name (token-text encoded — names are arbitrary unicode and HTTP
 * header values are not). A zero-byte attachment is a valid empty stream.
 */
function sendAttachmentFile(
  reply: FastifyReply,
  file: SavedAttachmentFile,
  cache: 'immutable' | 'no-store',
) {
  cache === 'immutable' ? setImmutableCache(reply) : setNoStore(reply);
  reply.header('Content-Type', file.mimeType ?? 'application/octet-stream');
  reply.header('Content-Length', String(file.size));
  reply.header('X-EmbedPDF-File-Name', encodeTokenText(file.name));
  reply.header('Content-Disposition', `attachment; filename="${safeHeaderFilePart(file.name)}"`);

  const stream = createReadStream(file.path);
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

function safeHeaderFilePart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'attachment';
}
