import type { FastifyInstance } from 'fastify';
import type { RedactionApplyScope } from '@embedpdf/engine-core/runtime';
import { RedactionApplyScopeSchema } from '@embedpdf/engine-core/wire';
import { requireLayerCapability, requireLayerDocAccessOnly } from '../app/jwt-plugin';
import type { DocumentService } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';
import { abortSignalFromRequest, parseOrInvalidArg, setNoStore, type SchemaLike } from './_helpers';

interface RedactionRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
}

/**
 * The destructive half of redaction (see `DocumentRedactionService` in
 * engine-core for the model). Marking rides the normal annotation routes;
 * this route is only the apply.
 *
 * Authorization is a strict NARROWING of flatten's dual gate: apply rewrites
 * page content and deletes annotations (so both broad authorities are
 * required), and information destruction is additionally its own granted
 * power — `doc.redact`. Wildcard/admin tokens and PDF-permission-bit-derived
 * scopes (bit 4) carry `doc.redact` already; narrowly-scoped tokens must
 * grant it explicitly, which is the separation-of-duties feature: annotate
 * authority marks, `doc.redact` authority applies.
 *
 * Trust boundary: applying rewrites THIS LAYER's artifact. The immutable
 * base document keeps the original bytes; redacted content is truly
 * destroyed only in exported artifacts (layer download).
 */
export async function registerRedactionRoutes(
  app: FastifyInstance,
  deps: RedactionRouteDeps,
): Promise<void> {
  const { documentService, layerService } = deps;

  app.post('/v1/docs/:docId/layers/:layerName/redactions/apply', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.pages.modify', pdfBits);
    requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
    requireLayerCapability(req, docId, layerName, 'doc.redact', pdfBits);

    const raw = (req.body ?? {}) as { scope?: unknown };
    const scope = parseOrInvalidArg<RedactionApplyScope>(
      RedactionApplyScopeSchema as unknown as SchemaLike<RedactionApplyScope>,
      raw.scope,
      'request body scope',
    );

    setNoStore(reply);
    return layerService.applyRedactions(
      ctx,
      { docId, layerName, scope },
      abortSignalFromRequest(req),
    );
  });
}
