import { createReadStream } from 'node:fs';

import { EngineError, EngineErrorCode, type AttachmentRef } from '@embedpdf/engine-core/runtime';
import { decodeAttachmentsToken, decodeTokenText, wireTemplates } from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  abortSignalOf,
  parseTokenOrInvalidArg,
  resolvePageKeyParam,
  setImmutableCache,
  setNoStore,
} from './_helpers';
import { refFromKey } from './annotation-route-helpers';
import {
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerResource,
} from '../app/jwt-plugin';
import { requireSharedDocRead } from './_planeGuard';
import type { DocumentService, SavedAttachmentFile } from '../services/DocumentService';

export interface AttachmentRouteDeps {
  documentService: DocumentService;
}

/**
 * Document-level attachments (the catalog's `/EmbeddedFiles` name tree)
 * plus the decoded bytes of both attachment homes.
 *
 * Two permission tiers under distinct path prefixes (the
 * search-rects/search-full rule, encoded in `DOC_RESOURCES`):
 *
 *   /attachments@{v}                       — metadata listing (doc.open)
 *   /attachment-files/{key}/data@{v}       — doc-level bytes (doc.download)
 *   /attachment-files/pages/{pageKey}/items/{annotKey}/data@{v}
 *                                          — annotation bytes (doc.download)
 *
 * Every read the SDK makes is versioned by the manifest's `attachmentsVersion`
 * pin and immutable — a stale pin 404s into the client's manifest-refresh
 * retry. The contract's reads are the same without a pin, never cached:
 *
 *   /attachments                           — metadata listing (doc.open)
 *   /attachment-files/{key}/data           — doc-level bytes (doc.download)
 *   /annotations/pages/{pageKey}/items/{annotKey}/resources/file
 *                                          — annotation bytes (doc.download)
 *
 * Files are added and removed by changes (`attachments.create`,
 * `attachments.delete` through `POST …/changes`).
 *
 * `{fileKey}` path segments carry the tree key through `encodeTokenText`
 * (keys are arbitrary unicode; the token-text alphabet keeps them
 * URL-safe with no percent-encoding ambiguity).
 */
export async function registerAttachmentRoutes(
  app: FastifyInstance,
  deps: AttachmentRouteDeps,
): Promise<void> {
  const { documentService } = deps;

  // ── Plane-scoped doc-level reads: served from the base worker session —
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
      abortSignalOf(reply),
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
      abortSignalOf(reply),
    );
    return sendAttachmentFile(reply, file, 'immutable');
  });

  app.get(
    '/v1/docs/:docId/attachment-files/pages/:pageKey/items/:annotKey/data@:token',
    async (req, reply) => {
      const { docId, pageKey, annotKey, token } = req.params as {
        docId: string;
        pageKey: string;
        annotKey: string;
        token: string;
      };
      // A FileAttachment annotation's bytes depend on both planes: the
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
      const pageObjectNumber = resolvePageKeyParam(pageKey);
      // Durable keys only, mirroring the layer route: weak index refs need
      // a revision-validated body, which a cacheable GET does not have.
      const ref = refFromKey(annotKey, pageObjectNumber);
      const file = await documentService.readAnnotationFileToTemp(
        ctx,
        docId,
        undefined,
        pageObjectNumber,
        ref,
        abortSignalOf(reply),
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
      abortSignalOf(reply),
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
        abortSignalOf(reply),
      );
      return sendAttachmentFile(reply, file, 'immutable');
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/attachment-files/pages/:pageKey/items/:annotKey/data@:token',
    async (req, reply) => {
      const { docId, layerName, pageKey, annotKey, token } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
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
      const pageObjectNumber = resolvePageKeyParam(pageKey);
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
        abortSignalOf(reply),
      );
      return sendAttachmentFile(reply, file, 'immutable');
    },
  );

  // ── Current reads, the contract's (`doc.attachments.list`,
  //    `doc.attachments.download`, `doc.annotations.readFile`): no pin,
  //    never cached. The versioned leaves above are what the SDK reads. ──

  app.get(wireTemplates.layerAttachments, async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-attachments', pdfBits);
    const list = await documentService.listAttachments(ctx, docId, layerName, abortSignalOf(reply));
    setNoStore(reply);
    return list;
  });

  app.get(wireTemplates.layerAttachmentFile, async (req, reply) => {
    const { docId, layerName, fileKey } = req.params as {
      docId: string;
      layerName: string;
      fileKey: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-attachment-files', pdfBits);
    const file = await documentService.readAttachmentFileToTemp(
      ctx,
      docId,
      layerName,
      attachmentRefFromPath(fileKey),
      abortSignalOf(reply),
    );
    return sendAttachmentFile(reply, file, 'no-store');
  });

  // An annotation's `file` resource, the twin of its `appearance` resource
  // (routes/annotations.ts): gated by `doc.download` the same way.
  app.get(wireTemplates.layerAnnotationItemFileResource, async (req, reply) => {
    const { docId, layerName, pageKey, annotKey } = req.params as {
      docId: string;
      layerName: string;
      pageKey: string;
      annotKey: string;
    };
    const pageObjectNumber = resolvePageKeyParam(pageKey);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.download', pdfBits);
    const file = await documentService.readAnnotationFileToTemp(
      ctx,
      docId,
      layerName,
      pageObjectNumber,
      refFromKey(annotKey, pageObjectNumber),
      abortSignalOf(reply),
    );
    return sendAttachmentFile(reply, file, 'no-store');
  });
}

function attachmentRefFromPath(fileKey: string): AttachmentRef {
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
 * Stream a decoded attachment temp file: the bytes, typed as the file
 * declares (`application/octet-stream` when it declares none) and named for
 * a browser's save. Its name and type as the document has them are what the
 * listing says. A zero-byte attachment is a valid empty stream.
 */
function sendAttachmentFile(
  reply: FastifyReply,
  file: SavedAttachmentFile,
  cache: 'immutable' | 'no-store',
) {
  cache === 'immutable' ? setImmutableCache(reply) : setNoStore(reply);
  reply.header('Content-Type', file.mimeType ?? 'application/octet-stream');
  reply.header('Content-Length', String(file.size));
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
