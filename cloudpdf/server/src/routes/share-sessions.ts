import { randomUUID } from 'node:crypto';

import { ShareExchangeRequestSchema, adminOperations } from '@cloudpdf/contract';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { setNoStore, tooManyRequests } from './_helpers';
import { AuthFailureLimiter } from '../app/auth-failure-limiter';
import { RequestRateLimiter } from '../app/request-rate-limiter';
import type { SignDevTokenInput } from '../auth/JwtVerifier';
import { matchesOrigin } from '../auth/origins';
import { verifySharePassword } from '../auth/share-password';
import type { SuspendedTenantsGuard } from '../auth/SuspendedTenantsGuard';
import {
  newVisitorId,
  visitorLayerName,
  visitorUserId,
  type VisitorHandles,
} from '../auth/visitor-handle';
import type { DocumentsRepo } from '../db/repos/documents.repo';
import type { LayersRepo } from '../db/repos/page_state.repo';
import type { ShareGrantsRepo } from '../db/repos/share_grants.repo';
import type { TenantUsageRepo } from '../db/repos/tenant_usage.repo';
import type { UsageMeters } from '../licensing/UsageMeters';

/** How long past a session's lifetime its renewal still continues the visit (a throttled timer, a slow network). */
const VISIT_GRACE_SECONDS = 5 * 60;

export interface ShareSessionRouteDeps {
  sign: (input: SignDevTokenInput) => string;
  grants: ShareGrantsRepo;
  documents: DocumentsRepo;
  /** Visitors' layers: their idle clock, and whether they were deleted. */
  layers: LayersRepo;
  visitors: VisitorHandles;
  /** Start over: a visitor's layer goes (`LayerService.deleteLayer` where the engine runs). */
  deleteLayer: (tenantId: string, input: { docId: string; layerName: string }) => Promise<void>;
  suspendedTenants: SuspendedTenantsGuard;
  usageMeters?: UsageMeters;
  tenantUsage: TenantUsageRepo;
  /** Test seams; production uses the defaults below. */
  ipAttemptLimit?: { maxAttempts: number; windowMs: number };
  tokenAttemptLimit?: { maxAttempts: number; windowMs: number };
  ipFailureLimit?: { maxFailures: number; windowMs: number };
}

/**
 * `POST /v1/share-sessions` — the public bottom rung of the ladder.
 *
 * Trades a share token (a stored-grant reference) for an ordinary
 * short-lived doc JWT carrying the grant's capabilities and origin
 * lock. Unauthenticated by design: the grant row is the authorization,
 * evaluated here on every exchange, which is exactly what makes grants
 * revocable and editable after the token is pasted into public HTML.
 *
 * The route lives on `publicPaths`, so the auth hook's failure limiter
 * never sees it — it carries its own three limiters, one per tier:
 *
 *   - attempts per IP (volume): every request consumes, before any
 *     parsing or I/O, so no request shape can demand unbounded work
 *     from one source. Generous — a real viewer exchanges once per
 *     page load, so the budget sits far above legitimate NAT traffic.
 *   - failures per IP (probe): token spray and passphrase guessing
 *     accrue count and lock the source out; legitimate outcomes never
 *     count, exactly like the auth hook's limiter.
 *   - attempts per token (volume): the share token is the grant row
 *     id, so its budget is consumed before the row is fetched — a
 *     blocked token performs no DB work, and one hot link cannot melt
 *     a replica.
 *
 * All three are in-process, per replica; cross-replica fairness
 * belongs at the edge, same doctrine as the auth-failure limiter.
 *
 * Unknown, revoked, disabled, and suspended-tenant tokens are all the
 * same 404: existence of a grant is itself information. Stale-but-
 * legitimate outcomes (disabled, expired, suspended) do not count as
 * probe failures — an old embed on a real site keeps polling and must
 * not 429 its visitors' shared NAT. They do consume the token's own
 * attempt budget, which is what bounds the DB work a dead link can
 * demand while still blocking per token, never per NAT.
 */
export async function registerShareSessionRoutes(
  app: FastifyInstance,
  deps: ShareSessionRouteDeps,
): Promise<void> {
  const { sign, grants, documents, layers, visitors, deleteLayer } = deps;
  const { suspendedTenants, usageMeters, tenantUsage } = deps;
  const ipAttempts = new RequestRateLimiter(
    deps.ipAttemptLimit ?? { maxAttempts: 300, windowMs: 60_000 },
  );
  const tokenAttempts = new RequestRateLimiter(
    deps.tokenAttemptLimit ?? { maxAttempts: 120, windowMs: 60_000 },
  );
  const ipFailures = new AuthFailureLimiter(
    deps.ipFailureLimit ?? { maxFailures: 30, windowMs: 60_000 },
  );

  const op = adminOperations['shares.exchange'];
  app.route({
    method: op.method,
    url: op.path,
    handler: async (req, reply) => {
      // Volume tier first: consume() is synchronous, so the budget
      // check and its accounting cannot be separated by awaited work —
      // a concurrent burst cannot overshoot the budget.
      const ipBlockedMs = ipAttempts.consume(req.ip);
      if (ipBlockedMs > 0) return tooManyRequests(reply, ipBlockedMs);

      // Probe tier: sources over their failure budget stay locked out.
      // Read-only — a blocked probe does not extend its own block.
      const blockedMs = ipFailures.retryAfterMs(req.ip);
      if (blockedMs > 0) return tooManyRequests(reply, blockedMs);

      const parsed = ShareExchangeRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        ipFailures.recordFailure(req.ip);
        return reply
          .code(400)
          .send({ error: { code: 'InvalidArg', message: 'invalid share exchange request' } });
      }
      const { shareToken, password, visitorHandle, restart } = parsed.data;

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

      // Volume tier, per token — consumed before the row is fetched
      // (the token is the grant id, and the schema already bounded its
      // shape). A blocked token never reaches the database. Attempts,
      // not successes: stale-grant outcomes and passphrase roundtrips
      // consume too, so no single token can demand unbounded work.
      const tokenBlockedMs = tokenAttempts.consume(shareToken);
      if (tokenBlockedMs > 0) return tooManyRequests(reply, tokenBlockedMs);

      const grant = await grants.findById(shareToken);
      if (!grant) {
        ipFailures.recordFailure(req.ip);
        return notFound(reply);
      }

      // Paused and archived links refuse alike: stale, not a probe.
      if (grant.disabled || grant.archivedAt !== null) return notFound(reply);
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

      // Who this is: the visitor the handle names, when this link issued
      // it; anyone else is a new visitor. On a per-visitor link the visitor
      // keeps their layer, unless they start over or it was deleted.
      const now = Date.now();
      const returning = visitorHandle ? visitors.read(grant.id, visitorHandle) : null;
      // A visit goes on while its sessions renew: a handle issued within a
      // session lifetime and a little more is a renewal, not a new view. Its
      // time is signed, so a client can't pass an old visit off as this one.
      const sameVisit =
        returning !== null &&
        now - returning.issuedAt <= (grant.sessionTtlSeconds + VISIT_GRACE_SECONDS) * 1000;
      let visitorId = returning?.visitorId ?? null;
      if (visitorId && grant.layerMode === 'per-visitor') {
        const own = visitorLayerName(visitorId);
        if (restart) {
          await deleteLayer(grant.tenantId, { docId: grant.docId, layerName: own });
          visitorId = null;
        } else if (!(await layers.seeVisitorLayer(grant.docId, own, now))) {
          visitorId = null;
        }
      }
      visitorId ??= newVisitorId();
      const layerName =
        grant.layerMode === 'per-visitor' ? visitorLayerName(visitorId) : grant.layerName!;

      const ttl = grant.sessionTtlSeconds;
      const token = sign({
        // The sub prefix is load-bearing: /v1/access skips view counting
        // for `share:` subjects (counted here), the audit trail honestly
        // labels share-session actors, and a visitor's layer is stamped
        // with its link from it at the first write.
        sub: `share:${grant.id}`,
        tenant_id: grant.tenantId,
        doc_id: grant.docId,
        layer_name: layerName,
        scope: grant.scope,
        ...(grant.origins ? { origins: grant.origins } : {}),
        jti: randomUUID(),
        ttlSeconds: ttl,
        extras: { identity: { userId: visitorUserId(visitorId) } },
      });

      await grants.touchExchanged(grant.id);
      // A view = a visit through a share link (its first exchange, not its
      // renewals) or an authorized /v1/access grant, deduplicated via the
      // sub prefix above. Both meters move here: the deployment-wide
      // license counter and the per-tenant fact.
      if (!sameVisit) {
        await usageMeters?.recordView();
        await tenantUsage.recordView(grant.tenantId);
      }

      setNoStore(reply);
      return reply.send({
        token,
        docId: grant.docId,
        layerName,
        layerMode: grant.layerMode,
        visitor: {
          handle: visitors.issue(grant.id, visitorId, now),
          keep: grant.layerMode === 'per-visitor' && grant.keepVisitorLayers,
        },
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
