import { randomUUID } from 'node:crypto';

import {
  AdminTokenIssueRequestSchema,
  AdminTokenRevokeRequestSchema,
  adminOperations,
} from '@cloudpdf/contract';
import { validateScopeArray } from '@embedpdf/engine-core/runtime';
import type { FastifyInstance } from 'fastify';

import {
  requireApiToken,
  requireTenantAccess,
  type TenantAccessContext,
} from '../../app/jwt-plugin';
import type { SignDevTokenInput } from '../../auth/JwtVerifier';
import type { RevokedJtisGuard } from '../../auth/RevokedJtisGuard';
import type { DocumentsRepo } from '../../db/repos/documents.repo';
import type { SecurityEventsRepo } from '../../db/repos/security-events.repo';

export interface AdminTokensRoutesDeps {
  /** Present only when revocation is enabled — gates the revoke route. */
  guard?: RevokedJtisGuard;
  /**
   * Present only when the deployment can sign (HS256 mode) — gates the
   * issue route. Asymmetric deployments mint with their own private
   * key; the engine stays verify-only there.
   */
  sign?: (input: SignDevTokenInput) => string;
  documents: DocumentsRepo;
  securityEvents: SecurityEventsRepo;
}

/**
 * Token routes under `/v1/tenants/:tenantId/tokens`. Both are mounted
 * from their registry entries, and both write `security_events` rows —
 * the auth control plane's append-only history.
 *
 * Issue rules (authority mints only downward):
 *   - kind "doc":    API token, or a tenant JWT holding
 *                    `tokens.issue-doc` for this tenant.
 *   - kind "tenant": API token only — a tenant JWT must not be able to
 *                    manufacture fresh tenant authority, not even for
 *                    its own tenant.
 */
export async function registerAdminTokensRoutes(
  app: FastifyInstance,
  deps: AdminTokensRoutesDeps,
): Promise<void> {
  if (deps.sign) {
    const sign = deps.sign;
    const op = adminOperations['tokens.issue'];
    app.route({
      method: op.method,
      url: op.path,
      handler: async (req, reply) => {
        const { tenantId } = req.params as { tenantId: string };
        const parsed = AdminTokenIssueRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply
            .code(400)
            .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
        }
        const body = parsed.data;

        let ctx: TenantAccessContext;
        if (body.kind === 'tenant') {
          requireApiToken(req);
          ctx = { tenantId, sub: 'api-token', via: 'api-token' };
        } else {
          ctx = requireTenantAccess(req, tenantId, op.scope);
        }

        if (body.kind === 'doc') {
          try {
            validateScopeArray(body.scope);
          } catch (err) {
            return reply.code(400).send({
              error: { code: 'InvalidArg', message: (err as Error).message },
            });
          }
          const doc = await deps.documents.findById(body.docId);
          if (!doc) {
            return reply.code(404).send({
              error: { code: 'NotFound', message: `document does not exist: ${body.docId}` },
            });
          }
          if (doc.tenantId !== tenantId) {
            return reply.code(403).send({
              error: { code: 'Forbidden', message: 'document does not belong to this tenant' },
            });
          }
        }

        const jti = randomUUID();
        const expiresAt = Math.floor(Date.now() / 1000) + body.expiresIn;

        const token =
          body.kind === 'doc'
            ? sign({
                sub: body.sub,
                tenant_id: tenantId,
                doc_id: body.docId,
                ...(body.layerName ? { layer_name: body.layerName } : {}),
                ...(body.origins ? { origins: body.origins } : {}),
                scope: body.scope,
                jti,
                ttlSeconds: body.expiresIn,
                extras: identityExtras(body),
              })
            : sign({
                sub: body.sub,
                tenant_id: tenantId,
                scope: body.scope,
                jti,
                ttlSeconds: body.expiresIn,
              });

        await deps.securityEvents.append({
          tenantId,
          kind: 'token.issued',
          jti,
          ...(body.kind === 'doc' ? { docId: body.docId } : {}),
          scope: body.scope,
          actor: ctx.sub,
          via: ctx.via,
          expiresAt: expiresAt * 1000,
        });

        return reply.send({ token, jti, expiresAt });
      },
    });
  }

  if (deps.guard) {
    const guard = deps.guard;
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

        await guard.revoke({
          jti,
          tenantId: ctx.tenantId,
          reason: parsed.data.reason,
          expiresAt: expiresAtSeconds * 1000,
        });
        await deps.securityEvents.append({
          tenantId,
          kind: 'token.revoked',
          jti,
          scope: [],
          actor: ctx.sub,
          via: ctx.via,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
          expiresAt: expiresAtSeconds * 1000,
        });
        return reply.code(204).send();
      },
    });
  }
}

function identityExtras(body: {
  userId?: string;
  displayName?: string;
  groupId?: string;
  groups?: string[];
}): Record<string, unknown> {
  return {
    ...(body.userId ? { user_id: body.userId } : {}),
    ...(body.displayName ? { display_name: body.displayName } : {}),
    ...(body.groupId ? { group_id: body.groupId } : {}),
    ...(body.groups ? { groups: body.groups } : {}),
  };
}

function formatIssues(issues: Array<{ path: Array<string | number>; message: string }>): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'request body';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
