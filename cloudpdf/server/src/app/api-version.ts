import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { API_VERSION, parseApiVersion } from '@embedpdf/engine-core/wire';
import type { FastifyInstance } from 'fastify';

/** The version a client speaks, on its request. */
export const VERSION_HEADER = 'EmbedPDF-Version';
/** The version this server is, on every response. */
export const SERVER_VERSION_HEADER = 'EmbedPDF-Server-Version';

/**
 * Every response says which version this server is, and a request that says
 * which version its client speaks is answered as that version
 * (`docs/conventions/api-evolution.md`). A request without one is answered
 * as this server's. Registered before every other hook, so a refusal says
 * the version too.
 */
export function registerApiVersion(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    reply.header(SERVER_VERSION_HEADER, API_VERSION);
    const sent = request.headers[VERSION_HEADER.toLowerCase()];
    if (sent !== undefined) assertAnswerable(sent);
  });
}

/**
 * Every version of this server's major can be answered: an older one through
 * the version changes (none yet), a newer one as this server's own, since the
 * client checks what it needs against `/head`. Another major can't.
 */
function assertAnswerable(sent: string | string[]): void {
  const client = typeof sent === 'string' ? parseApiVersion(sent) : null;
  if (!client) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `this server is version ${API_VERSION}, and ${VERSION_HEADER} must be ` +
        `<major>.<minor>, not "${[sent].flat().join(', ')}"`,
    );
  }
  const server = parseApiVersion(API_VERSION)!;
  if (client.major !== server.major) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `this server is version ${API_VERSION} and answers clients of ${server.major}.x, ` +
        `not ${VERSION_HEADER} ${sent}`,
    );
  }
}
