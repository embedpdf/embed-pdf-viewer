import { AdminTokenRevokeRequestSchema, adminOperations } from '@cloudpdf/admin-api';
import type { FastifyInstance } from 'fastify';
import type { RevokedJtisGuard } from '../../auth/RevokedJtisGuard';
import { requireTenantAccess } from '../../app/jwt-plugin';

export interface AdminTokensRoutesDeps {
  guard: RevokedJtisGuard;
}

/**
 * Admin token routes — revocation only for Phase 2. Token *minting*
 * is intentionally NOT here: customer backends mint their own JWTs
 * with their own keys, we just verify. The exception is the dev
 * HS256 path; tests sign tokens directly via `signDevToken`.
 *
 * Mounted from the `tokens.revoke` registry entry; the registry also
 * carries the "only when revocation is enabled" caveat in its notes.
 */
export async function registerAdminTokensRoutes(
  app: FastifyInstance,
  deps: AdminTokensRoutesDeps,
): Promise<void> {
  const op = adminOperations['tokens.revoke'];
  app.route({
    method: op.method,
    url: op.path,
    handler: async (req, reply) => {
      const { tenantId, jti } = req.params as { tenantId: string; jti: string };
      const ctx = requireTenantAccess(req, tenantId, op.scope);
      if (!jti || jti.length > 256) {
        return reply.code(400).send({ error: { code: 'BadInput', message: 'invalid jti' } });
      }
      const parsed = AdminTokenRevokeRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: { code: 'BadInput', message: 'invalid revoke body' } });
      }
      const defaultExpiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const expiresAtSeconds = parsed.data.expiresAtSeconds ?? defaultExpiresAt;

      await deps.guard.revoke({
        jti,
        tenantId: ctx.tenantId,
        reason: parsed.data.reason,
        expiresAt: expiresAtSeconds * 1000,
      });
      return reply.code(204).send();
    },
  });
}
