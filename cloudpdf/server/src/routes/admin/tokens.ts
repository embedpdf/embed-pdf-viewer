import { randomUUID } from 'node:crypto';

import {
  AdminTokenIssueRequestSchema,
  AdminTokenRevokeRequestSchema,
  adminOperations,
} from '@cloudpdf/contract';
import { validateScopeArray, type Identity } from '@embedpdf/engine-core/runtime';
import type { FastifyInstance } from 'fastify';

import { formatIssues } from './_issues';
import { folderIdOfPlace, ROOT_PLACE } from './_place';
import {
  requireApiToken,
  requireTenantAccess,
  type TenantAccessContext,
} from '../../app/jwt-plugin';
import type { SignDevTokenInput } from '../../auth/JwtVerifier';
import type { RevokedJtisGuard } from '../../auth/RevokedJtisGuard';
import { validateTenantScope } from '../../auth/tenant-scope';
import { isVisitorLayerName, VISITOR_LAYER_PREFIX } from '../../auth/visitor-handle';
import type { DocumentsRepo } from '../../db/repos/documents.repo';
import type { FoldersRepo } from '../../db/repos/folders.repo';
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
  folders: FoldersRepo;
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
 *   - kind "upload": API token, or a tenant JWT holding `docs.create`:
 *                    the token uploads, which the minter can do itself.
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
        } else if (body.kind === 'upload') {
          ctx = requireTenantAccess(req, tenantId, ['docs.create']);
        } else {
          ctx = requireTenantAccess(req, tenantId, op.scope);
        }

        if (body.kind === 'tenant') {
          try {
            validateTenantScope(body.scope);
          } catch (err) {
            return reply.code(400).send({
              error: { code: 'InvalidArg', message: (err as Error).message },
            });
          }
        }

        if (body.kind === 'doc') {
          try {
            validateScopeArray(body.scope);
          } catch (err) {
            return reply.code(400).send({
              error: { code: 'InvalidArg', message: (err as Error).message },
            });
          }
          if (body.layerName !== undefined && isVisitorLayerName(body.layerName)) {
            return reply.code(400).send({
              error: {
                code: 'InvalidArg',
                message: `layerName: names starting with "${VISITOR_LAYER_PREFIX}" are for grant visitors' own layers`,
              },
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

        // The folder must exist now: a token for a missing folder would
        // only fail later, in the user's browser.
        const uploadFolderId =
          body.kind === 'upload' ? folderIdOfPlace(body.folderId ?? ROOT_PLACE) : null;
        if (uploadFolderId !== null) await deps.folders.requireOwned(uploadFolderId, tenantId);

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
            : body.kind === 'upload'
              ? sign({
                  sub: body.sub,
                  tenant_id: tenantId,
                  upload: {
                    folder_id: uploadFolderId,
                    ...(body.metadata ? { metadata: body.metadata } : {}),
                    max_files: body.maxFiles ?? 1,
                    ...(body.maxBytes !== undefined ? { max_bytes: body.maxBytes } : {}),
                  },
                  ...(body.origins ? { origins: body.origins } : {}),
                  jti,
                  ttlSeconds: body.expiresIn,
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
          scope: body.kind === 'upload' ? [] : body.scope,
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

function identityExtras(body: { identity?: Identity }): Record<string, unknown> {
  return body.identity ? { identity: body.identity } : {};
}
