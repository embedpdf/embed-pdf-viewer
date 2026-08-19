import {
  AdminDocumentCommitRequestSchema,
  AdminDocumentImportRequestSchema,
  AdminDocumentInitRequestSchema,
  adminOperations,
  adminWirePaths,
  type AdminDocumentCommitRequest,
  type AdminDocumentImportRequest,
  type AdminDocumentInitRequest,
  type AdminOperation,
} from '@cloudpdf/contract';
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
 * Tenant document routes, mounted under `/v1/tenants/:tenantId/documents`.
 *
 * The flow customers walk through:
 *   1. POST /v1/tenants/:tenantId/documents/init
 *      body: { contentLength, contentSha256, metadata?, idempotencyKey?, dedupMode?, docId? }
 *      -> { id, state, tag: 'created'|'resumed'|'deduped', upload?: { ... } }
 *
 *   2. (If not deduped:) PUT the bytes to `upload.url` (presigned) OR
 *      POST multipart to `.../documents/:id/upload-proxy` when the
 *      deployment selected the bounded origin fallback.
 *
 *   3. POST .../documents/:id/commit
 *      body: { sha256 }
 *      -> { id, state, baseSha, ... }
 *
 * Or, replacing all three when the bytes already live in the
 * customer's own storage — the server-side pull:
 *      POST /v1/tenants/:tenantId/documents/import
 *      body: { source: { kind: 'url', url }, expected?, ... }
 *      -> { tag: 'imported'|'deduped', document }
 *
 * Listing / deleting / downloading are flat REST against the tenant documents collection.
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
      uploadPreference: body.uploadPreference,
    });

    if (result.tag === 'deduped') {
      return reply.send({
        tag: result.tag,
        document: docPublic(result.doc),
      });
    }

    // Stable proxy-upload URL: SDKs use it exactly
    // as returned (no string interpolation on its side).
    const upload = await lifecycle.issueUpload(
      result.doc.id,
      ctx.tenantId,
      body.contentLength,
      (docId) => adminWirePaths.documentUploadProxy(tenantId, docId),
      { ttlSec: body.uploadTtlSec, preference: body.uploadPreference },
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

  const uploadProxyOp = adminOperations['documents.uploadProxy'];
  mount(uploadProxyOp, async (req, reply) => {
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const ctx = requireTenantAccess(req, tenantId, uploadProxyOp.scope);

    // Proxy uploads are deliberately multipart-only. That shape is portable
    // across Fern's generators and, unlike the previous implementation, we
    // compare the PDF part's length rather than the multipart envelope's
    // Content-Length.
    if (!req.isMultipart()) {
      throw makeError('InvalidArg', 400, 'expected multipart with a file field');
    }
    const data = await req.file();
    if (!data || data.fieldname !== 'file') {
      throw makeError('InvalidArg', 400, 'expected multipart with a file field');
    }
    const buf = await data.toBuffer();
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

    const { sha256 } = await lifecycle.uploadProxy({
      tenantId: ctx.tenantId,
      docId: id,
      body: bytes,
      contentLength: bytes.byteLength,
    });
    return reply.send({ sha256 });
  });

  const importOp = adminOperations['documents.import'];
  mount(importOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const ctx = requireTenantAccess(req, tenantId, importOp.scope);
    const body = parseImportBody(req);

    const result = await lifecycle.importFromSource({
      tenantId: ctx.tenantId,
      sub: ctx.sub,
      via: ctx.via,
      source: body.source,
      expected: body.expected ?? null,
      metadata: body.metadata ?? null,
      idempotencyKey: body.idempotencyKey ?? null,
      dedupMode: body.dedupMode,
      docId: body.docId,
    });
    return reply.send({ tag: result.tag, document: docPublic(result.doc) });
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

function parseImportBody(req: FastifyRequest): AdminDocumentImportRequest {
  const result = AdminDocumentImportRequestSchema.safeParse(req.body);
  if (!result.success) {
    throw makeError('InvalidArg', 400, formatSchemaError(result.error.issues));
  }
  const expected = result.data.expected;
  return {
    ...result.data,
    ...(expected?.sha256
      ? { expected: { ...expected, sha256: expected.sha256.toLowerCase() } }
      : {}),
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
