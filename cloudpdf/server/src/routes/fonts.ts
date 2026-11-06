import { BUILT_IN_PROGRAMS, builtInProgramInfo, loadBuiltInProgram } from '@embedpdf/core-fonts';
import {
  EngineError,
  EngineErrorCode,
  PermissionDenied,
  TEXT_WRITING_CAPABILITIES,
  checkAnyCapability,
  downloadableProgram,
  fontListOf,
  fontResolutionOf,
  listedProgram,
  protectedCapabilities,
  type DocumentManifest,
  type FontList,
  type FontProgramInfo,
} from '@embedpdf/engine-core/runtime';
import {
  FontResolveRequestSchema,
  decodeFontsToken,
  type FontsToken,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  abortSignalOf,
  parseOrInvalidArg,
  parseTokenOrInvalidArg,
  readAtPins,
  setImmutableCache,
  setNoStore,
} from './_helpers';
import { requireSharedDocRead } from './_planeGuard';
import { requireLayerDocAccessOnly, requireLayerResource } from '../app/jwt-plugin';
import { isDocUserClaims } from '../auth/JwtVerifier';
import type { DocumentService, OpenContext } from '../services/DocumentService';

interface FontRouteDeps {
  service: DocumentService;
}

/** A program's bytes: kept by the browser that asked, never on a shared CDN. */
const PRIVATE_IMMUTABLE_CACHE = 'private, max-age=31536000, immutable';

/**
 * The fonts that can be named in a document (`doc.fonts`): the list, pinned
 * by the document's `fontsVersion` and the fonts engine value, which the
 * server's fonts are an input of (`/fonts@{engine, fontsVersion, shape}`); a
 * resolve, a read with a body; a
 * program's facts and its bytes, content-addressed by its display hash; and a
 * served server font's bytes at one URL for every document. The list, the
 * resolve and a program's facts need `doc.open`; a program's bytes need a
 * token that may write text, and never go through a shared CDN.
 */
export async function registerFontRoutes(app: FastifyInstance, deps: FontRouteDeps): Promise<void> {
  const { service } = deps;

  // Plane-scoped doc-level read: served from the base worker session while
  // the caller's layer draws what the base does.
  app.get('/v1/docs/:docId/fonts@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const ctx = await requireSharedDocRead(req, service, docId, 'fonts', [
      'content',
      'annotations',
      'forms',
    ]);
    const requested = parseTokenOrInvalidArg(decodeFontsToken, token, 'fonts token');
    const list = await readAtPins({
      documentService: service,
      reply,
      docId,
      layerName: undefined,
      assertCurrent: async () => assertCurrent(requested, await service.getManifest(ctx, docId)),
      read: () => fontListIn(service, ctx, docId, undefined, abortSignalOf(reply)),
      token: { kind: 'fonts', pin: requested.pin },
    });
    setImmutableCache(reply);
    return list;
  });

  app.get('/v1/docs/:docId/layers/:layerName/fonts@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    const ctx = await layerRead(req, service, docId, layerName, 'layer-fonts');
    const requested = parseTokenOrInvalidArg(decodeFontsToken, token, 'fonts token');
    const list = await readAtPins({
      documentService: service,
      reply,
      docId,
      layerName,
      assertCurrent: async () =>
        assertCurrent(requested, await service.getLayerManifest(ctx, docId, layerName)),
      read: () => fontListIn(service, ctx, docId, layerName, abortSignalOf(reply)),
      token: { kind: 'fonts', pin: requested.pin },
    });
    setImmutableCache(reply);
    return list;
  });

  app.get('/v1/docs/:docId/layers/:layerName/fonts', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const ctx = await layerRead(req, service, docId, layerName, 'layer-fonts');
    const list = await fontListIn(service, ctx, docId, layerName, abortSignalOf(reply));
    setNoStore(reply);
    return list;
  });

  app.post('/v1/docs/:docId/layers/:layerName/fonts/resolve', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const ctx = await layerRead(req, service, docId, layerName, 'layer-fonts');
    const request = parseOrInvalidArg(FontResolveRequestSchema, req.body, 'request body');
    const resolved = await service.resolveLayerFonts(
      ctx,
      docId,
      layerName,
      request,
      abortSignalOf(reply),
    );
    setNoStore(reply);
    return fontResolutionOf(
      resolved.runs,
      resolved.missingCharacters,
      resolved.facts,
      BUILT_IN_PROGRAMS,
    );
  });

  app.get('/v1/docs/:docId/layers/:layerName/font-programs/:displaySha256', async (req, reply) => {
    const { docId, layerName, displaySha256 } = req.params as {
      docId: string;
      layerName: string;
      displaySha256: string;
    };
    const ctx = await layerRead(req, service, docId, layerName, 'layer-font-programs');
    const info = await programInfo(service, ctx, docId, layerName, displaySha256, reply);
    setImmutableCache(reply);
    return info;
  });

  app.get(
    '/v1/docs/:docId/layers/:layerName/font-program-files/:displaySha256',
    async (req, reply) => {
      const { docId, layerName, displaySha256 } = req.params as {
        docId: string;
        layerName: string;
        displaySha256: string;
      };
      const ctx = await mayWriteText(req, service, docId, layerName);
      const signal = abortSignalOf(reply);
      const builtIn = loadBuiltInProgram(displaySha256);
      const bytes = builtIn
        ? await builtIn
        : await documentProgramBytes(service, ctx, docId, layerName, displaySha256, signal, reply);
      return sendProgram(reply, bytes);
    },
  );

  // A served server font, at one URL whatever the document, so a browser
  // keeps one copy: for a document token that may write text in its own
  // document, and for a tenant token or the API token, which own every
  // document. A font not served is not found.
  app.get('/v1/font-program-files/:displaySha256', async (req, reply) => {
    const { displaySha256 } = req.params as { displaySha256: string };
    const claims = req.tenant?.claims;
    if (claims && isDocUserClaims(claims)) {
      await mayWriteText(req, service, claims.doc_id, claims.layer_name ?? 'default');
    }
    const bytes = await notFoundUncached(reply, () =>
      service.serverFonts.programData(displaySha256, abortSignalOf(reply)),
    );
    return sendProgram(reply, bytes);
  });
}

/** The layer's read guard for a fonts resource that needs only `doc.open`. */
async function layerRead(
  req: FastifyRequest,
  service: DocumentService,
  docId: string,
  layerName: string,
  resource: 'layer-fonts' | 'layer-font-programs',
): Promise<OpenContext> {
  const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
  const permissionFlags = await service.getEffectivePermissionFlags(accessCtx, docId, layerName);
  return requireLayerResource(req, docId, layerName, resource, permissionFlags);
}

/**
 * The guard of a program's bytes: a token that may write text in the
 * document, what its signatures forbid taken first, for every caller.
 * `Forbidden` with `details.anyOf` otherwise, as the local engine says it.
 */
async function mayWriteText(
  req: FastifyRequest,
  service: DocumentService,
  docId: string,
  layerName: string,
): Promise<OpenContext> {
  const ctx = requireLayerDocAccessOnly(req, docId, layerName);
  const permissionFlags = await service.getEffectivePermissionFlags(ctx, docId, layerName);
  const protection = await service.getProtection(ctx, docId, layerName);
  const allowed =
    ctx.mode === 'tenant'
      ? TEXT_WRITING_CAPABILITIES.some(
          (capability) => !protectedCapabilities(protection).has(capability),
        )
      : checkAnyCapability(TEXT_WRITING_CAPABILITIES, ctx.jwt.scope, permissionFlags, protection);
  if (!allowed) {
    throw new PermissionDenied(TEXT_WRITING_CAPABILITIES[0], undefined, TEXT_WRITING_CAPABILITIES);
  }
  return ctx;
}

async function fontListIn(
  service: DocumentService,
  ctx: OpenContext,
  docId: string,
  layerName: string | undefined,
  signal: AbortSignal,
): Promise<FontList> {
  const facts = await service.readLayerFontFacts(ctx, docId, layerName, signal);
  return fontListOf(facts, BUILT_IN_PROGRAMS);
}

/** A program's facts: a built-in one's from the client's own copy, any other's from the document. */
async function programInfo(
  service: DocumentService,
  ctx: OpenContext,
  docId: string,
  layerName: string,
  displaySha256: string,
  reply: FastifyReply,
): Promise<FontProgramInfo> {
  const builtIn = builtInProgramInfo(displaySha256);
  if (builtIn) return builtIn;
  const signal = abortSignalOf(reply);
  const program = await notFoundUncached(reply, async () =>
    listedProgram(await fontListIn(service, ctx, docId, layerName, signal), displaySha256),
  );
  const info = await service.readLayerFontProgram(
    ctx,
    docId,
    layerName,
    displaySha256,
    'info',
    signal,
  );
  return { ...program, covers: info.covers, ascent: info.ascent, descent: info.descent };
}

async function documentProgramBytes(
  service: DocumentService,
  ctx: OpenContext,
  docId: string,
  layerName: string,
  displaySha256: string,
  signal: AbortSignal,
  reply: FastifyReply,
): Promise<Uint8Array> {
  await notFoundUncached(reply, async () =>
    downloadableProgram(await fontListIn(service, ctx, docId, layerName, signal), displaySha256),
  );
  const program = await service.readLayerFontProgram(
    ctx,
    docId,
    layerName,
    displaySha256,
    'data',
    signal,
  );
  if (!program.bytes) {
    throw new EngineError(EngineErrorCode.WireFormat, 'the program came back without bytes');
  }
  return new Uint8Array(program.bytes);
}

/** `body`'s answer; a hash the list doesn't name is a 404 nothing keeps. */
async function notFoundUncached<T>(reply: FastifyReply, body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof EngineError && error.code === EngineErrorCode.NotFound) setNoStore(reply);
    throw error;
  }
}

function sendProgram(reply: FastifyReply, bytes: Uint8Array): FastifyReply {
  reply.header('Cache-Control', PRIVATE_IMMUTABLE_CACHE);
  reply.header('Content-Type', 'font/sfnt');
  return reply.send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

/** A pinned list answers only at the manifest's `fontsVersion`; any other is a 404. */
function assertCurrent(requested: FontsToken, manifest: DocumentManifest): void {
  if (requested.fontsVersion === manifest.fontsVersion) return;
  throw new EngineError(
    EngineErrorCode.NotFound,
    `fonts ${requested.fontsVersion} no longer current (current=${manifest.fontsVersion})`,
  );
}
