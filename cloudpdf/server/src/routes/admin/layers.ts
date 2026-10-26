import { adminOperations, type AdminOperation } from '@cloudpdf/contract';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { requireTenantAccess } from '../../app/jwt-plugin';
import type { ShareGrantsRepo } from '../../db/repos/share_grants.repo';

export interface AdminLayersRoutesDeps {
  /** `LayerService.deleteLayer` where the engine runs, else `deleteStoredLayer`. */
  deleteLayer: (tenantId: string, input: { docId: string; layerName: string }) => Promise<void>;
  grants: ShareGrantsRepo;
}

/**
 * A document's layers under `/v1/tenants/:tenantId/documents/:id/layers`,
 * for a backend with its API token: deleting a user's layer deletes their
 * data.
 */
export async function registerAdminLayersRoutes(
  app: FastifyInstance,
  deps: AdminLayersRoutesDeps,
): Promise<void> {
  const { deleteLayer, grants } = deps;

  const mount = (
    op: AdminOperation,
    handler: (req: FastifyRequest, reply: FastifyReply) => unknown,
  ): void => {
    app.route({ method: op.method, url: op.path, handler });
  };

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
