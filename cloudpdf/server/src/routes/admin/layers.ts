import { adminOperations, type AdminOperation } from '@cloudpdf/contract';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { decodeListCursor, encodeListCursor } from './_cursor';
import { formatIssues } from './_issues';
import { requireTenantAccess } from '../../app/jwt-plugin';
import type { DocumentsRepo } from '../../db/repos/documents.repo';
import type { LayersRepo, ListedLayer } from '../../db/repos/page_state.repo';
import type { ShareGrantsRepo } from '../../db/repos/share_grants.repo';

export interface AdminLayersRoutesDeps {
  /** `LayerService.deleteLayer` where the engine runs, else `deleteStoredLayer`. */
  deleteLayer: (tenantId: string, input: { docId: string; layerName: string }) => Promise<void>;
  layers: LayersRepo;
  documents: DocumentsRepo;
  grants: ShareGrantsRepo;
}

/**
 * A document's layers under `/v1/tenants/:tenantId/documents/:id/layers`,
 * for a backend with its API token: listing them finds what share-link
 * visitors filled in, and deleting a user's layer deletes their data.
 */
export async function registerAdminLayersRoutes(
  app: FastifyInstance,
  deps: AdminLayersRoutesDeps,
): Promise<void> {
  const { deleteLayer, layers, documents, grants } = deps;

  const mount = (
    op: AdminOperation,
    handler: (req: FastifyRequest, reply: FastifyReply) => unknown,
  ): void => {
    app.route({ method: op.method, url: op.path, handler });
  };

  const listOp = adminOperations['documents.layers.list'];
  mount(listOp, async (req, reply) => {
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const ctx = requireTenantAccess(req, tenantId, listOp.scope);
    const parsed = listOp.query.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const { limit, cursor, shareId } = parsed.data;
    const before = cursor === undefined ? undefined : decodeListCursor(cursor);
    await documents.requireOwned(id, ctx.tenantId);
    // limit+1 probes for a next page without a count query.
    const rows = await layers.listForDocument(id, {
      limit: limit + 1,
      ...(shareId !== undefined ? { grantId: shareId } : {}),
      ...(before ? { before } : {}),
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? encodeListCursor(last) : null;
    return reply.send({ layers: page.map(layerPublic), nextCursor });
  });

  const deleteOp = adminOperations['documents.layers.delete'];
  mount(deleteOp, async (req, reply) => {
    const { tenantId, id, layerName } = req.params as {
      tenantId: string;
      id: string;
      layerName: string;
    };
    const ctx = requireTenantAccess(req, tenantId, deleteOp.scope);
    // A link's visitors land in its layer: deleting the layer would leave
    // them a link that refuses every request.
    const linked = await grants.listByLayer(ctx.tenantId, id, layerName);
    if (linked.length > 0) {
      return reply.code(409).send({
        error: {
          code: 'Conflict',
          message: `share link ${linked[0]!.id} uses this layer: delete the link first`,
          details: { shareIds: linked.map((grant) => grant.id) },
        },
      });
    }
    await deleteLayer(ctx.tenantId, { docId: id, layerName });
    return reply.code(204).send();
  });
}

function layerPublic(layer: ListedLayer): Record<string, unknown> {
  return {
    docId: layer.docId,
    layerName: layer.name,
    shareId: layer.grantId,
    visitorId: layer.visitorId,
    storageSizeBytes: layer.storageSizeBytes,
    createdAt: layer.createdAt,
    updatedAt: layer.updatedAt,
    lastSeenAt: layer.lastSeenAt,
  };
}
