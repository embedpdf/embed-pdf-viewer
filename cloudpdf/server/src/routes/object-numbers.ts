import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { ObjectNumberReservationRequestSchema } from '@embedpdf/engine-core/wire';
import type { FastifyInstance } from 'fastify';

import { setNoStore, tooManyRequests } from './_helpers';
import { editSessionOf, mayCreateObjects, requireLayerDocAccessOnly } from '../app/jwt-plugin';
import { RequestRateLimiter, type RequestRateLimiterOptions } from '../app/request-rate-limiter';
import type { DocumentService } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';

export interface ObjectNumberRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
  /** Reservations one token may make; 30 a minute when absent. */
  reservationLimit?: RequestRateLimiterOptions;
}

/**
 * `POST /v1/docs/:docId/layers/:layerName/object-numbers` `{ count }`: the
 * bulk reservation. The caller's editing session (`X-Engine-Session-Id`)
 * gets `count` more object numbers (at most 1,000) for a large paste, or a
 * few more when a reclaimed block covers them; `LayerFull` when the layer
 * has fewer to hand out. Only for a caller that may create objects.
 */
export async function registerObjectNumberRoutes(
  app: FastifyInstance,
  deps: ObjectNumberRouteDeps,
): Promise<void> {
  const { documentService, layerService } = deps;
  const reservations = new RequestRateLimiter(
    deps.reservationLimit ?? { maxAttempts: 30, windowMs: 60_000 },
  );

  // Literal pattern, not wirePaths.objectNumbers(':docId', ':layerName'):
  // the path builder percent-encodes the colons.
  app.post('/v1/docs/:docId/layers/:layerName/object-numbers', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    // Counted before the first await, so a burst can't pass the budget.
    const blockedMs = reservations.consume(
      accessCtx.jwt.jti ?? `${accessCtx.tenantId}:${accessCtx.sub}`,
    );
    if (blockedMs > 0) return tooManyRequests(reply, blockedMs);

    const parsed = ObjectNumberReservationRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `invalid object number reservation: ${parsed.error.message}`,
      );
    }
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    if (!mayCreateObjects(accessCtx, pdfBits, protection)) {
      throw new EngineError(
        EngineErrorCode.Forbidden,
        'object numbers are for callers that may create objects',
      );
    }
    setNoStore(reply);
    return layerService.reserveObjectNumbers(
      { ...accessCtx, ...editSessionOf(req) },
      { docId, layerName, count: parsed.data.count },
    );
  });
}
