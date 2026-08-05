import type { FastifyInstance } from 'fastify';
import type { RevokedJtisGuard } from '../../auth/RevokedJtisGuard';
import { requireScope } from '../../app/jwt-plugin';

export interface AdminTokensRoutesDeps {
  guard: RevokedJtisGuard;
}

interface RevokeBody {
  /** Optional human reason, written to the audit row. */
  reason?: string;
  /**
   * Token's `exp` (unix seconds). The server uses this to GC the
   * revocation row once the token would have expired anyway.
   * Defaults to "now + 30 days" if omitted (a safe upper bound for
   * most JWT lifetimes — adjust per deployment).
   */
  expiresAtSeconds?: number;
}

/**
 * Admin token routes — revocation only for Phase 2. Token *minting*
 * is intentionally NOT here: customer backends mint their own JWTs
 * with their own keys, we just verify. The exception is the dev
 * HS256 path; tests sign tokens directly via `signDevToken`.
 *
 * `POST /v1/admin/tokens/:jti/revoke` requires `tokens.mint` or `*`
 * scope (revocation is a write to the auth control plane).
 */
export async function registerAdminTokensRoutes(
  app: FastifyInstance,
  deps: AdminTokensRoutesDeps,
): Promise<void> {
  app.post<{ Params: { jti: string }; Body: RevokeBody | undefined }>(
    '/v1/admin/tokens/:jti/revoke',
    async (req, reply) => {
      const ctx = requireScope(req, ['tokens.mint']);
      const jti = req.params.jti;
      if (!jti || jti.length > 256) {
        return reply.code(400).send({ error: { code: 'BadInput', message: 'invalid jti' } });
      }
      const body = (req.body ?? {}) as RevokeBody;
      const defaultExpiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const expiresAtSeconds = body.expiresAtSeconds ?? defaultExpiresAt;

      await deps.guard.revoke({
        jti,
        tenantId: ctx.tenantId,
        reason: body.reason,
        expiresAt: expiresAtSeconds * 1000,
      });
      return reply.code(204).send();
    },
  );
}
