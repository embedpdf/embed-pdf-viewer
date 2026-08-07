import {
  AdminDocumentCommitRequestSchema,
  AdminDocumentInitRequestSchema,
  adminOperations,
  adminWirePaths,
  type AdminDocumentCommitRequest,
  type AdminDocumentInitRequest,
  type AdminOperation,
} from '@cloudpdf/admin-api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { requireTenantAccess } from '../../app/jwt-plugin';
import { decodeListCursor, encodeListCursor } from './_cursor';
import type { DocumentLifecycleService } from '../../services/DocumentLifecycleService';
import type { ObjectStore } from '../../storage/ObjectStore';

export interface AdminDocumentsRouteDeps {
  lifecycle: DocumentLifecycleService;
  /** Serves warmed thumbnail artifacts. Absent = 404 on the route. */
  storage?: ObjectStore;
}

/**
 * Admin routes for document upload + lifecycle, mounted under `/v1/admin/*`.
 *
 * The flow customers walk through:
 *   1. POST /v1/admin/documents/init
 *      body: { contentLength, contentSha256, metadata?, idempotencyKey?, dedupMode?, docId? }
 *      -> { id, state, tag: 'created'|'resumed'|'deduped', upload?: { ... } }
 *
 *   2. (If not deduped:) PUT the bytes to `upload.url` (presigned) OR
 *      POST them to `/v1/admin/documents/:id/upload-direct` (FS-mode
 *      fallback / customers behind strict egress).
 *
 *   3. POST /v1/admin/documents/:id/commit
 *      body: { sha256 }
 *      -> { id, state, baseSha, ... }
 *
 * Listing / deleting / downloading are flat REST against `/v1/admin/documents`.
 */
export async function registerAdminDocumentsRoutes(
  app: FastifyInstance,
  deps: AdminDocumentsRouteDeps,
): Promise<void> {
  const { lifecycle, storage } = deps;

  /**
   * Every route mounts from its registry entry: method, path, scope,
   * and accepted credentials come from `adminOperations`, so the
   * contract is executed rather than merely described. Handlers own
   * behavior only.
   */
  const mount = (
    op: AdminOperation,
    handler: (req: FastifyRequest, reply: FastifyReply) => unknown,
  ): void => {
    app.route({ method: op.method, url: op.path, handler });
  };

  const initOp = adminOperations['documents.init'];
  mount(initOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const ctx = requireTenantAccess(req, tenantId, initOp.scope);
    const body = parseInitBody(req);

    const result = await lifecycle.init({
      tenantId: ctx.tenantId,
      sub: ctx.sub,
      contentLength: body.contentLength,
      contentSha256: body.contentSha256,
      metadata: body.metadata ?? null,
      idempotencyKey: body.idempotencyKey ?? null,
      dedupMode: body.dedupMode,
      docId: body.docId,
      uploadTtlSec: body.uploadTtlSec,
    });

    if (result.tag === 'deduped') {
      return reply.send({
        tag: result.tag,
        document: docPublic(result.doc),
      });
    }

    // Stable direct-upload URL: the @cloudpdf/admin SDK uses it exactly
    // as returned (no string interpolation on its side).
    const upload = await lifecycle.issueUpload(
      result.doc.id,
      ctx.tenantId,
      body.contentLength,
      (docId) => adminWirePaths.documentUploadDirect(tenantId, docId),
      { ttlSec: body.uploadTtlSec },
    );
    return reply.send({
      tag: result.tag,
      document: docPublic(result.doc),
      upload,
    });
  });

  const commitOp = adminOperations['documents.commit'];
  mount(commitOp, async (req, reply) => {
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const ctx = requireTenantAccess(req, tenantId, commitOp.scope);
    const body = parseCommitBody(req);

    const result = await lifecycle.commit({
      tenantId: ctx.tenantId,
      docId: id,
      sha256: body.sha256,
    });
    return reply.send({ document: docPublic(result.doc) });
  });

  const uploadDirectOp = adminOperations['documents.uploadDirect'];
  mount(uploadDirectOp, async (req, reply) => {
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const ctx = requireTenantAccess(req, tenantId, uploadDirectOp.scope);

    const lenHeader = req.headers['content-length'];
    const len = typeof lenHeader === 'string' ? Number.parseInt(lenHeader, 10) : Number.NaN;
    if (!Number.isFinite(len) || len <= 0) {
      throw makeError('InvalidArg', 400, 'Content-Length header required for upload-direct');
    }

    // We accept either a raw application/pdf body or a multipart
    // upload with a single "file" field. The @cloudpdf/admin SDK uses
    // raw body; `curl -F file=@x.pdf` works via multipart for ops
    // convenience. Raw PDF uploads land in `req.body` as a Buffer
    // thanks to the content-type parser registered in `buildApp`.
    const contentType = (req.headers['content-type'] ?? '').toString();
    let bytes: Uint8Array;
    if (contentType.startsWith('multipart/')) {
      const data = await req.file();
      if (!data) throw makeError('InvalidArg', 400, 'expected multipart with file field');
      const buf = await data.toBuffer();
      bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } else if (Buffer.isBuffer(req.body)) {
      bytes = new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength);
    } else {
      throw makeError(
        'InvalidArg',
        400,
        `unsupported content-type for upload-direct: ${contentType || '(missing)'}`,
      );
    }

    if (bytes.byteLength !== len) {
      throw makeError(
        'InvalidArg',
        400,
        `Content-Length mismatch: header=${len}, body=${bytes.byteLength}`,
      );
    }

    const { sha256 } = await lifecycle.uploadDirect({
      tenantId: ctx.tenantId,
      docId: id,
      body: bytes,
      contentLength: len,
    });
    return reply.send({ sha256 });
  });

  const listOp = adminOperations['documents.list'];
  mount(listOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const ctx = requireTenantAccess(req, tenantId, listOp.scope);
    const parsed = listOp.query.safeParse(req.query ?? {});
    if (!parsed.success) {
      throw makeError('InvalidArg', 400, formatSchemaError(parsed.error.issues));
    }
    const { limit, cursor, state } = parsed.data;
    const before = cursor === undefined ? undefined : decodeListCursor(cursor);

    // limit+1 probes for a next page without a COUNT query.
    const rows = await lifecycle.list(ctx.tenantId, { limit: limit + 1, state, before });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? encodeListCursor(last) : null;
    return reply.send({ documents: page.map(docPublic), nextCursor });
  });

  const getOp = adminOperations['documents.get'];
  mount(getOp, async (req, reply) => {
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const ctx = requireTenantAccess(req, tenantId, getOp.scope);
    const doc = await lifecycle.get(ctx.tenantId, id);
    return reply.send({ document: docPublic(doc) });
  });

  const downloadOp = adminOperations['documents.download'];
  mount(downloadOp, async (req, reply) => {
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const ctx = requireTenantAccess(req, tenantId, downloadOp.scope);
    const bytes = await lifecycle.download(ctx.tenantId, id);
    return reply
      .type('application/pdf')
      .header('Content-Length', String(bytes.byteLength))
      .send(Buffer.from(bytes));
  });

  const deleteOp = adminOperations['documents.delete'];
  mount(deleteOp, async (req, reply) => {
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const ctx = requireTenantAccess(req, tenantId, deleteOp.scope);
    await lifecycle.delete(ctx.tenantId, id);
    return reply.code(204).send();
  });

  /**
   * The dashboard-tile artifact: serves the WARMED base-tier render
   * by its stored key — no token grammar, no page knowledge needed by the
   * dashboard. 404 with the state while `pending`/`locked`/`failed` (the
   * doc-plane render routes remain the read-through repair path).
   */
  const thumbnailOp = adminOperations['documents.thumbnail'];
  mount(thumbnailOp, async (req, reply) => {
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const ctx = requireTenantAccess(req, tenantId, thumbnailOp.scope);
    const doc = await lifecycle.get(ctx.tenantId, id);
    if (!storage || doc.thumbnailState !== 'ready' || !doc.thumbnailKey) {
      return reply.code(404).send({
        error: {
          code: 'ThumbnailNotReady',
          message: 'thumbnail is not ready to serve',
          state: doc.thumbnailState,
        },
      });
    }
    const bytes = await storage.get(doc.thumbnailKey);
    if (!bytes) {
      return reply.code(404).send({
        error: {
          code: 'ThumbnailNotReady',
          message: 'thumbnail is not ready to serve',
          state: 'pending',
        },
      });
    }
    return reply
      .type(doc.thumbnailKey.endsWith('.png') ? 'image/png' : 'image/webp')
      .header('Cache-Control', 'private, max-age=60')
      .send(Buffer.from(bytes));
  });
}

function parseInitBody(req: FastifyRequest): AdminDocumentInitRequest {
  const result = AdminDocumentInitRequestSchema.safeParse(req.body);
  if (!result.success) {
    throw makeError('InvalidArg', 400, formatSchemaError(result.error.issues));
  }
  return {
    ...result.data,
    contentSha256: result.data.contentSha256.toLowerCase(),
  };
}

function parseCommitBody(req: FastifyRequest): AdminDocumentCommitRequest {
  const result = AdminDocumentCommitRequestSchema.safeParse(req.body);
  if (!result.success) {
    throw makeError('InvalidArg', 400, formatSchemaError(result.error.issues));
  }
  return {
    ...result.data,
    sha256: result.data.sha256.toLowerCase(),
  };
}

function formatSchemaError(
  issues: Array<{ path: Array<string | number>; message: string }>,
): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'request body';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function docPublic(d: {
  id: string;
  tenantId: string;
  state: string;
  baseSha: string | null;
  storageSizeBytes: number | null;
  metadata: Record<string, unknown> | null;
  idempotencyKey: string | null;
  failureReason: string | null;
  thumbnailState: string;
  thumbnailKey: string | null;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
}): Record<string, unknown> {
  return {
    id: d.id,
    tenantId: d.tenantId,
    state: d.state,
    baseSha: d.baseSha,
    storageSizeBytes: d.storageSizeBytes,
    metadata: d.metadata,
    idempotencyKey: d.idempotencyKey,
    failureReason: d.failureReason,
    // Dashboard tile contract: the URL is valid the
    // whole time — `pending` just means a fetch pays the read-through.
    thumbnailState: d.thumbnailState,
    thumbnailUrl:
      d.thumbnailState === 'ready' ? adminWirePaths.documentThumbnail(d.tenantId, d.id) : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    createdBy: d.createdBy,
  };
}

function makeError(code: string, status: number, message: string): Error {
  const e = new Error(message) as Error & { code: string; status: number };
  e.code = code;
  e.status = status;
  return e;
}
