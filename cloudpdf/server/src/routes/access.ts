import {
  EngineError,
  EngineErrorCode,
  decodePdfBits,
  expandRawScope,
  permissionInfoWithAdvisory,
  type BundleLimits,
  type DocumentAccessInfo,
  type DocumentProtection,
  type PdfBits,
} from '@embedpdf/engine-core/runtime';
import {
  AccessRequestSchema,
  cdnCoverageForScope,
  wirePaths,
  type LayerScopes,
  type RenderPolicy,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { setNoStore } from './_helpers';
import {
  editSessionOf,
  mayCreateObjects,
  requireLayerDocAccessOnly,
  type RequestJwtContext,
} from '../app/jwt-plugin';
import type { CdnSigner } from '../cdn/CdnSigner';
import type { TenantUsageRepo } from '../db/repos/tenant_usage.repo';
import type { UsageMeters } from '../licensing/UsageMeters';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';

export interface AccessRouteDeps {
  service: DocumentService;
  /** Opens the editing sessions of callers that may create. */
  layers: LayerService;
  cdnSigner: CdnSigner;
  /** When present, /access advertises the deployment's render lattice. */
  derivedRenders?: DerivedRenderService;
  /** The deployment's annotation import limits, advertised so a client checks them first. */
  bundleLimits: BundleLimits;
  usageMeters?: UsageMeters;
  tenantUsage?: TenantUsageRepo;
}

export async function registerAccessRoutes(
  app: FastifyInstance,
  deps: AccessRouteDeps,
): Promise<void> {
  const { service, layers, cdnSigner, derivedRenders, usageMeters, tenantUsage, bundleLimits } =
    deps;

  const handleAccess = async (
    req: FastifyRequest,
    reply: FastifyReply,
    pathDocId: string | undefined,
    pathLayerName: string | undefined,
  ) => {
    const parsed = AccessRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `invalid access request: ${parsed.error.message}`,
      );
    }
    const body = parsed.data;
    // Identity rides the path — doc and layer, like every layer route
    // (the affinity tier routes on the doc segment); the legacy alias
    // still takes both from the body. When path and body are both
    // present they must agree — a mismatch is malformed, never a
    // silent preference.
    const docId = pathDocId ?? body.docId;
    if (docId === undefined) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'access request needs a document id');
    }
    if (pathDocId !== undefined && body.docId !== undefined && body.docId !== pathDocId) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `access request docId mismatch: path=${pathDocId} body=${body.docId}`,
      );
    }
    if (
      pathLayerName !== undefined &&
      body.layerName !== undefined &&
      body.layerName !== pathLayerName
    ) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `access request layer mismatch: path=${pathLayerName} body=${body.layerName}`,
      );
    }
    const layerName = pathLayerName ?? body.layerName ?? 'default';
    const ctx = requireLayerDocAccessOnly(req, docId, layerName);
    const unlocked = await service.unlockLayerAccess(ctx, docId, layerName, {
      password: body.password ?? null,
      passwordGrant: body.passwordGrant ?? null,
      mode: body.mode ?? 'any',
    });
    // Effective bits for this response come from the unlock probe — not
    // from the DB row. The row was populated by an anonymous probe at
    // ingest and is stale for encrypted documents; the just-completed
    // unlock is the authoritative source for "what bits does this
    // caller see right now." Driving both `pdfPermissions` and the
    // `effectiveScope` expansion from the same source keeps the
    // response internally consistent.
    const pdfBits = decodePdfBits(unlocked.probe.pdfPermissionsBits);
    // Plane-scoped edge grant: each doc-level shared prefix rides this caller's CDN
    // credential only while every plane it depends on is inherited by the
    // pinned layer — the same scopes the manifest advertises and the origin
    // guards enforce (the origin is the truth; this grant is the
    // optimization, TTL-bounded by `expiresAt` after a divergence flip).
    const layerScopes = await service.getLayerScopes(docId, layerName);
    // What the document's signatures forbid: subtracted from the scope for
    // every caller, as every route guard subtracts it.
    const protection = await service.getProtection(ctx, docId, layerName);
    const access = buildAccessResponse(
      unlocked,
      ctx.jwt,
      pdfBits,
      protection,
      cdnSigner,
      ctx.tenantId,
      docId,
      layerName,
      `${req.protocol}://${req.hostname}`,
      bundleLimits,
      derivedRenders?.policy(),
      layerScopes,
    );
    // A caller that may create gets its editing session: made, revived or
    // kept alive, and handed the object numbers it asks for.
    const session = editSessionOf(req);
    const edit =
      session.originSessionId && mayCreateObjects(ctx, pdfBits, protection)
        ? await layers.openEditSession(
            { ...ctx, ...session },
            {
              docId,
              layerName,
              ...(body.objectNumbers !== undefined ? { wanted: body.objectNumbers } : {}),
            },
          )
        : undefined;
    // A view is a successfully authorized viewer access grant. Counting at
    // this choke point avoids charging internal render/cache operations.
    // Share sessions (`sub: share:<id>`) were already counted at exchange —
    // skipping them here is the two-choke-point dedupe, applied to both the
    // deployment-wide license meter and the per-tenant fact.
    if (!ctx.jwt.claims.sub.startsWith('share:')) {
      await usageMeters?.recordView();
      await tenantUsage?.recordView(ctx.tenantId);
    }
    setNoStore(reply);
    return {
      security: unlocked.security,
      ...access,
      ...(edit ? { edit } : {}),
    };
  };

  // Fastify pattern literal (the same shape wirePaths.access(docId)
  // builds — the builder percent-encodes, so it cannot express ':docId').
  // Literal pattern, not wirePaths.access(':docId', ':layerName') — the
  // path builder percent-encodes the colons.
  app.post('/v1/docs/:docId/layers/:layerName/access', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    return handleAccess(req, reply, docId, layerName);
  });
  // Deprecated alias #1 (one prerelease cycle): the original body-addressed
  // form — both ids from the body.
  app.post(wirePaths.accessLegacy, async (req, reply) =>
    handleAccess(req, reply, undefined, undefined),
  );
  // Deprecated alias #2 (same removal window): the short-lived doc-tier
  // form (`/v1/docs/:docId/access`, layer from body/default) that
  // prerelease builds from 2026-08-26 called before access moved to the
  // layer tier. Remove both aliases together before GA.
  app.post('/v1/docs/:docId/access', async (req, reply) => {
    const { docId } = req.params as { docId: string };
    return handleAccess(req, reply, docId, undefined);
  });
}

function buildAccessResponse(
  unlocked: Awaited<ReturnType<DocumentService['unlockLayerAccess']>>,
  jwt: RequestJwtContext,
  pdfBits: PdfBits,
  protection: DocumentProtection | null,
  cdnSigner: CdnSigner,
  tenantId: string,
  docId: string,
  layerName: string,
  originUrl: string,
  bundleLimits: BundleLimits,
  renderPolicy?: RenderPolicy,
  layerScopes?: LayerScopes,
): DocumentAccessInfo {
  if (!jwt.exp || jwt.exp <= 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'doc token exp is required for access');
  }
  const expiresAt = jwt.exp;

  // Expand the raw JWT scope into a concrete capability set. This is
  // what the client should drive UI off — `pdf.permissions` is opaque
  // until expanded against the document's PDF bits, and the resolver
  // also applies implication rules (e.g. annotations collab scopes
  // imply doc.annotate.read) and takes away what the document's
  // signatures forbid.
  const effectiveScope = [...expandRawScope(jwt.scope, pdfBits, protection)].sort();

  const coverage = cdnCoverageForScope(jwt.scope, pdfBits, {
    docId,
    layerName,
    ...(layerScopes ? { scopes: layerScopes } : {}),
  });
  const cdn = cdnSigner.buildAccess({
    tenantId,
    docId,
    layerName,
    coverage,
    expiresAt,
    originUrl,
  });

  return {
    cdn,
    passwordGrant: unlocked.passwordGrant,
    // Enriched permission info: includes flags (typed bit view) and
    // advisory (capability-shaped booleans for UI badges) on top of
    // the raw bits/openedAs already in PdfPermissionInfo.
    pdfPermissions: permissionInfoWithAdvisory(unlocked.probe, pdfBits),
    scope: [...jwt.scope],
    effectiveScope,
    protection,
    // Explicit identity construction (rather than spreading
    // jwt.identity) so the readonly `groups` array doesn't leak into a
    // mutable-typed slot. Each field is copied only when present.
    identity: identityForResponse(jwt),
    originPasswordPolicy: {
      mode: unlocked.probe.encryptionState === 'encrypted' ? 'server-session' : 'not-needed',
    },
    expiresAt,
    // The render lattice rides /access, never the manifest: manifests are
    // version-pinned immutable objects; the lattice is mutable deployment
    // policy.
    ...(renderPolicy ? { renderPolicy } : {}),
    bundleLimits,
  };
}

function identityForResponse(jwt: RequestJwtContext): DocumentAccessInfo['identity'] {
  return { ...jwt.identity };
}
