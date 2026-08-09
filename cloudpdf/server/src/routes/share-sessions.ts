import { randomUUID } from 'node:crypto';

import { ShareExchangeRequestSchema, adminOperations } from '@cloudpdf/contract';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { setNoStore } from './_helpers';
import { AuthFailureLimiter } from '../app/auth-failure-limiter';
import type { SignDevTokenInput } from '../auth/JwtVerifier';
import { matchesOrigin } from '../auth/origins';
import { verifySharePassword } from '../auth/share-password';
import type { SuspendedTenantsGuard } from '../auth/SuspendedTenantsGuard';
import type { DocumentsRepo } from '../db/repos/documents.repo';
import type { ShareGrantsRepo } from '../db/repos/share_grants.repo';
import type { TenantUsageRepo } from '../db/repos/tenant_usage.repo';
import type { UsageMeters } from '../licensing/UsageMeters';

export interface ShareSessionRouteDeps {
  sign: (input: SignDevTokenInput) => string;
  grants: ShareGrantsRepo;
  documents: DocumentsRepo;
  suspendedTenants: SuspendedTenantsGuard;
  usageMeters?: UsageMeters;
  tenantUsage: TenantUsageRepo;
  /** Test seams; production uses the defaults below. */
  ipFailureLimit?: { maxFailures: number; windowMs: number };
  grantRateLimit?: { maxFailures: number; windowMs: number };
}

/**
 * `POST /v1/share-sessions` — the public bottom rung of the ladder.
 *
 * Trades a share token (a stored-grant REFERENCE) for an ordinary
 * short-lived doc JWT carrying the grant's capabilities and origin
 * lock. Unauthenticated by design: the grant row is the authorization,
 * evaluated here on every exchange, which is exactly what makes grants
 * revocable and editable after the token is pasted into public HTML.
 *
 * The route lives on `publicPaths`, so the auth hook's failure limiter
 * never sees it — it carries its own two limiters instead: failures
 * per IP (token probing), successes per grant (one hot link cannot
 * melt a replica; cross-replica fairness belongs at the edge, same
 * doctrine as the auth-failure limiter).
 *
 * Unknown, revoked, disabled, and suspended-tenant tokens are all the
 * same 404: existence of a grant is itself information. Stale-but-
 * legitimate outcomes (disabled, expired, suspended) do not count as
 * probe failures — an old embed on a real site keeps polling and must
 * not 429 its visitors' shared NAT.
 */
export async function registerShareSessionRoutes(
  app: FastifyInstance,
  deps: ShareSessionRouteDeps,
): Promise<void> {
  const { sign, grants, documents, suspendedTenants, usageMeters, tenantUsage } = deps;
  const ipFailures = new AuthFailureLimiter(
    deps.ipFailureLimit ?? { maxFailures: 30, windowMs: 60_000 },
  );
  const grantRate = new AuthFailureLimiter(
    deps.grantRateLimit ?? { maxFailures: 120, windowMs: 60_000 },
  );

  const op = adminOperations['shares.exchange'];
  app.route({
    method: op.method,
    url: op.path,
    handler: async (req, reply) => {
      const blockedMs = ipFailures.retryAfterMs(req.ip);
      if (blockedMs > 0) return tooMany(reply, blockedMs);

      const parsed = ShareExchangeRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        ipFailures.recordFailure(req.ip);
        return reply
          .code(400)
          .send({ error: { code: 'InvalidArg', message: 'invalid share exchange request' } });
      }
      const { shareToken, password } = parsed.data;

      // Browser-only endpoint: exchange exists to put a credential into
      // a page, and every cross-origin fetch carries Origin. A missing
      // header is a non-browser caller poking a browser door.
      const origin = req.headers['origin'];
      if (typeof origin !== 'string' || origin.length === 0) {
        ipFailures.recordFailure(req.ip);
        return reply.code(403).send({
          error: { code: 'OriginRequired', message: 'share exchange requires an Origin header' },
        });
      }

      const grant = await grants.findById(shareToken);
      if (!grant) {
        ipFailures.recordFailure(req.ip);
        return notFound(reply);
      }

      const grantBlockedMs = grantRate.retryAfterMs(grant.id);
      if (grantBlockedMs > 0) return tooMany(reply, grantBlockedMs);

      if (grant.disabled) return notFound(reply);
      if (await suspendedTenants.isSuspended(grant.tenantId)) return notFound(reply);
      const doc = await documents.findById(grant.docId);
      if (!doc || doc.tenantId !== grant.tenantId || doc.state !== 'ready') {
        return notFound(reply);
      }
      if (grant.expiresAt !== null && grant.expiresAt <= Date.now()) {
        return reply
          .code(410)
          .send({ error: { code: 'ShareExpired', message: 'share link expired' } });
      }
      if (grant.origins && !matchesOrigin(origin, grant.origins)) {
        ipFailures.recordFailure(req.ip);
        return reply
          .code(403)
          .send({ error: { code: 'OriginNotAllowed', message: 'origin not allowed' } });
      }
      if (grant.passwordHash !== null) {
        if (password === undefined) {
          // The normal first roundtrip for a protected link — the
          // viewer shows a prompt and exchanges again. Not a probe.
          return reply.code(422).send({
            error: { code: 'SharePasswordRequired', message: 'this share requires a password' },
          });
        }
        if (!verifySharePassword(password, grant.passwordHash)) {
          ipFailures.recordFailure(req.ip);
          return reply.code(422).send({
            error: { code: 'SharePasswordRequired', message: 'incorrect share password' },
          });
        }
      }

      const ttl = grant.sessionTtlSeconds;
      const token = sign({
        // The sub prefix is load-bearing: /v1/access skips view counting
        // for `share:` subjects (counted here), and the audit trail
        // honestly labels share-session actors.
        sub: `share:${grant.id}`,
        tenant_id: grant.tenantId,
        doc_id: grant.docId,
        layer_name: grant.layerName,
        scope: grant.scope,
        ...(grant.origins ? { origins: grant.origins } : {}),
        jti: randomUUID(),
        ttlSeconds: ttl,
      });

      grantRate.recordFailure(grant.id);
      await grants.touchExchanged(grant.id);
      // A view = a share exchange or an authorized /v1/access grant,
      // deduplicated via the sub prefix above. Both meters move here:
      // the deployment-wide license counter and the per-tenant fact.
      await usageMeters?.recordView();
      await tenantUsage.recordView(grant.tenantId);

      setNoStore(reply);
      return reply.send({
        token,
        docId: grant.docId,
        layerName: grant.layerName,
        expiresAt: Math.floor(Date.now() / 1000) + ttl,
      });
    },
  });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply
    .code(404)
    .send({ error: { code: 'NotFound', message: 'unknown or revoked share token' } });
}

function tooMany(reply: FastifyReply, retryAfterMs: number): FastifyReply {
  return reply
    .code(429)
    .header('retry-after', String(Math.ceil(retryAfterMs / 1000)))
    .send({ error: { code: 'TooManyRequests', message: 'rate limited; retry later' } });
}
