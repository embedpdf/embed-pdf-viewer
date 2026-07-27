import type { FastifyInstance } from 'fastify';
import {
  EngineError,
  EngineErrorCode,
  decodePdfBits,
  expandRawScope,
  permissionInfoWithAdvisory,
  type DocumentAccessInfo,
  type PdfBits,
} from '@embedpdf/engine-core/runtime';
import {
  AccessRequestSchema,
  cdnCoverageForScope,
  wirePaths,
  type RenderPolicy,
} from '@embedpdf/engine-core/wire';
import { requireLayerDocAccessOnly, type RequestJwtContext } from '../app/jwt-plugin';
import type { CdnSigner } from '../cdn/CdnSigner';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService } from '../services/DocumentService';
import { setNoStore } from './_helpers';

export interface AccessRouteDeps {
  service: DocumentService;
  cdnSigner: CdnSigner;
  /** When present, /access advertises the deployment's render lattice. */
  derivedRenders?: DerivedRenderService;
}

export async function registerAccessRoutes(
  app: FastifyInstance,
  deps: AccessRouteDeps,
): Promise<void> {
  const { service, cdnSigner, derivedRenders } = deps;

  app.post(wirePaths.access, async (req, reply) => {
    const parsed = AccessRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `invalid access request: ${parsed.error.message}`,
      );
    }
    const body = parsed.data;
    const layerName = body.layerName ?? 'default';
    const ctx = requireLayerDocAccessOnly(req, body.docId, layerName);
    const unlocked = await service.unlockLayerAccess(ctx, body.docId, layerName, {
      password: body.password ?? null,
      passwordGrant: body.passwordGrant ?? null,
      mode: body.mode ?? 'any',
    });
    // Effective bits for this response come from the unlock probe — NOT
    // from the DB row. The row was populated by an anonymous probe at
    // ingest and is stale for encrypted documents; the just-completed
    // unlock is the authoritative source for "what bits does this
    // caller see right now." Driving both `pdfPermissions` and the
    // `effectiveScope` expansion from the same source keeps the
    // response internally consistent.
    const pdfBits = decodePdfBits(unlocked.probe.pdfPermissionsBits);
    const access = buildAccessResponse(
      unlocked,
      ctx.jwt,
      pdfBits,
      cdnSigner,
      ctx.tenantId,
      body.docId,
      layerName,
      `${req.protocol}://${req.hostname}`,
      derivedRenders?.policy(),
    );
    setNoStore(reply);
    return {
      security: unlocked.security,
      ...access,
    };
  });
}

function buildAccessResponse(
  unlocked: Awaited<ReturnType<DocumentService['unlockLayerAccess']>>,
  jwt: RequestJwtContext,
  pdfBits: PdfBits,
  cdnSigner: CdnSigner,
  tenantId: string,
  docId: string,
  layerName: string,
  originUrl: string,
  renderPolicy?: RenderPolicy,
): DocumentAccessInfo {
  if (!jwt.exp || jwt.exp <= 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'doc token exp is required for access');
  }
  const expiresAt = jwt.exp;

  // Expand the raw JWT scope into a concrete capability set. This is
  // what the client should drive UI off — `pdf.permissions` is opaque
  // until expanded against the document's PDF bits, and the resolver
  // also applies implication rules (e.g. annotations collab scopes
  // imply doc.annotate.read).
  const effectiveScope = [...expandRawScope(jwt.scope, pdfBits)].sort();

  const coverage = cdnCoverageForScope(jwt.scope, pdfBits, { docId, layerName });
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
    // Explicit identity construction (rather than spreading
    // jwt.identity) so the readonly `groups` array doesn't leak into a
    // mutable-typed slot. Each field is copied only when present.
    identity: identityForResponse(jwt),
    originPasswordPolicy: {
      mode: unlocked.probe.encryptionState === 'encrypted' ? 'server-session' : 'not-needed',
    },
    expiresAt,
    // The render lattice rides /access, NEVER the manifest: manifests are
    // version-pinned immutable objects; the lattice is mutable deployment
    // policy (SCALE-OUT.md §2.1b).
    ...(renderPolicy ? { renderPolicy } : {}),
  };
}

function identityForResponse(jwt: RequestJwtContext): DocumentAccessInfo['identity'] {
  const id = jwt.identity;
  return {
    ...(id.user_id !== undefined ? { user_id: id.user_id } : {}),
    ...(id.group_id !== undefined ? { group_id: id.group_id } : {}),
    ...(id.display_name !== undefined ? { display_name: id.display_name } : {}),
    ...(id.groups !== undefined ? { groups: [...id.groups] } : {}),
  };
}
