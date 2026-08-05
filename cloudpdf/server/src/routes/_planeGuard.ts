import type { FastifyRequest } from 'fastify';
import type { DocResourceId, LayerScopePlane } from '@embedpdf/engine-core/wire';
import {
  pinnedLayerName,
  requireDocAccessOnly,
  requireResource,
  type DocAccessMode,
  type RequestJwtContext,
} from '../app/jwt-plugin';
import type { DocumentService } from '../services/DocumentService';

type SharedReadCtx = {
  tenantId: string;
  sub: string;
  mode: DocAccessMode;
  jwt: RequestJwtContext;
};

/**
 * Plane guard at the ORIGIN (the truth; the `/v1/access` edge grant is
 * only the TTL-bounded optimization). Every doc-user token is layer-pinned
 * (`layer_name`, default 'default'), and a doc-level shared resource is
 * visible through it only while EVERY plane the resource depends on is
 * inherited (`'base'`) by that layer — a view that diverged on a plane must
 * never read base artifacts that plane produced. Tenant/admin tokens are not
 * layer-pinned and pass.
 *
 * Refuses with **404, not 403** — deliberately: (1) it feeds the SDK's
 * stale-pin rail (a client whose cached manifest predates its own divergence
 * 404s here, refreshes the manifest, and retries on the layer path —
 * self-healing); (2) "not visible through your token" shouldn't confirm what
 * exists at paths the view can't see.
 */
export async function assertPlanesVisible(
  ctx: SharedReadCtx,
  documentService: DocumentService,
  docId: string,
  planes: readonly LayerScopePlane[],
): Promise<void> {
  if (ctx.mode === 'tenant') return;
  const scopes = await documentService.getLayerScopes(docId, pinnedLayerName(ctx));
  if (planes.every((plane) => scopes[plane] === 'base')) return;
  const err = new Error(
    'base resource is not visible through a layer token whose view diverged on it (refresh the manifest and use the layer-scoped paths)',
  ) as Error & { code: string; status: number };
  err.code = 'NotFound';
  err.status = 404;
  throw err;
}

/**
 * The full auth chain for a doc-level SHARED read: doc access → effective
 * PDF bits for the CLAIMED layer (password sessions bind to the pin while
 * execution dispatches to the base session) → capability/resource check →
 * plane guard. One door for every doc-level route, so the chain can't drift
 * between resource families.
 */
export async function requireSharedDocRead(
  req: FastifyRequest,
  documentService: DocumentService,
  docId: string,
  resource: DocResourceId,
  planes: readonly LayerScopePlane[],
): Promise<SharedReadCtx> {
  const accessCtx = requireDocAccessOnly(req, docId);
  const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId);
  const ctx = requireResource(req, docId, resource, pdfBits);
  await assertPlanesVisible(ctx, documentService, docId, planes);
  return ctx;
}
