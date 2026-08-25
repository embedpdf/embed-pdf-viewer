import { randomBytes } from 'node:crypto';

import {
  EngineError,
  EngineErrorCode,
  checkSetGroup,
  sniffBinaryMetadata,
  wirePack,
  type AnnotationActor,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceManifest,
  type AnnotationAppearanceManifestEntry,
  type WireAnnotationDraft,
  type WireAnnotationPatch,
  type WireResourceMap,
  type AnnotationRef,
  type CollabTarget,
  type PageNetworkRenderFormat,
  type PdfBits,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import {
  AnnotationAppearancesQuerySchema,
  AnnotationDraftSchema,
  AnnotationPatchSchema,
  AnnotationRefSchema,
  annotationRenderOptionsFromImageOptions,
  decodeAnnotationAppearancesRenderToken,
  decodeAnnotationToken,
  PageNetworkRenderFormatSchema,
  WeakAnnotationSessionPagesRequestSchema,
  type ManifestPage,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  abortSignalFromRequest,
  parseOrInvalidArg,
  parsePageObjectNumber,
  parseTokenOrInvalidArg,
  setImmutableCache,
  setNoStore,
  toPageState,
  type SchemaLike,
} from './_helpers';
import { readMutationEnvelope } from './_mutationEnvelope';
import { requireSharedDocRead } from './_planeGuard';
import { assertRefMatchesPage, refFromKey } from './annotation-route-helpers';
import {
  requireLayerCapability,
  requireLayerCollabAction,
  requireLayerDocAccessOnly,
  requireLayerResource,
  type RequestJwtContext,
} from '../app/jwt-plugin';
import { SharpImageEncoder } from '../render/SharpImageEncoder';
import type { EnginePool } from '../runtime/EnginePool';
import type { CloudRevisionBridge } from '../services/CloudRevisionBridge';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService, OpenContext } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';
import type { WeakAnnotationSessionService } from '../services/WeakAnnotationSessionService';

interface AnnotationRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
  pool: EnginePool;
  revisionBridge: CloudRevisionBridge;
  imageEncoder: SharpImageEncoder;
  weakAnnotationSessions?: WeakAnnotationSessionService;
  /** Render-lattice policy plane (absent = legacy compute-only). */
  derivedRenders?: DerivedRenderService;
}

type ReadScope =
  | { kind: 'base'; ctx: OpenContext; docId: string }
  | { kind: 'layer'; ctx: OpenContext; docId: string; layerName: string };

export async function registerAnnotationRoutes(
  app: FastifyInstance,
  deps: AnnotationRouteDeps,
): Promise<void> {
  const {
    documentService,
    layerService,
    pool,
    revisionBridge,
    imageEncoder,
    weakAnnotationSessions,
    derivedRenders,
  } = deps;

  // ── Plane-scoped doc-level reads: a base's own annotations —
  //    weak-identity ones included — are simply VISIBLE through every
  //    annotations-inheriting layer, so the list and appearance batches are
  //    ONE CDN object served from the BASE worker session. Guarded by the
  //    `annotations` plane (`requireSharedDocRead`); an annotation-writing
  //    layer 404s here into the SDK's manifest-refresh rail and reads its
  //    own layer-scoped view. ─────────────────────────────────────────────

  app.get('/v1/docs/:docId/annotations/pages/:pon/items@:token', async (req, reply) => {
    const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-annotations', [
      'annotations',
    ]);
    return readAnnotations({
      documentService,
      pool,
      revisionBridge,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: parsePageObjectNumber(pon),
      requestedVersion: parseTokenOrInvalidArg(
        decodeAnnotationToken,
        token,
        'annotationVersion token',
      ),
    });
  });

  app.get(
    '/v1/docs/:docId/annotations/pages/:pon/appearances@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, pon, token } = req.params as { docId: string; pon: string; token: string };
      const ctx = await requireSharedDocRead(req, documentService, docId, 'page-annotations', [
        'annotations',
      ]);
      return renderAnnotationAppearances({
        documentService,
        pool,
        imageEncoder,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'base', ctx, docId },
        pageObjectNumber: parsePageObjectNumber(pon),
        tokenQuery: parseTokenOrInvalidArg(
          decodeAnnotationAppearancesRenderToken,
          token,
          'appearance render token',
        ),
        query: req.query,
      });
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/items@:token',
    async (req, reply) => {
      const { docId, layerName, pon, token } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'annotations-read', pdfBits);
      return readAnnotations({
        documentService,
        pool,
        revisionBridge,
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: parsePageObjectNumber(pon),
        requestedVersion: parseTokenOrInvalidArg(
          decodeAnnotationToken,
          token,
          'annotationVersion token',
        ),
      });
    },
  );

  app.get('/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/items', async (req, reply) => {
    const { docId, layerName, pon } = req.params as {
      docId: string;
      layerName: string;
      pon: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'annotations-read', pdfBits);
    return readAnnotations({
      documentService,
      pool,
      revisionBridge,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
      pageObjectNumber: parsePageObjectNumber(pon),
    });
  });

  // Batch-rendered annotation appearance bitmaps for a page, returned as a
  // `multipart/form-data` body (one image part per annotation + a JSON
  // manifest). Sibling of `items` under the same `annotations-read` resource,
  // so it shares the `doc.annotate.read` gate and the CDN coverage — reading
  // an annotation lets you see its rendered appearance. `compress: false`
  // keeps the binary multipart body un-gzipped end to end.
  app.get(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/appearances@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName, pon, token } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'annotations-read', pdfBits);
      return renderAnnotationAppearances({
        documentService,
        pool,
        imageEncoder,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: parsePageObjectNumber(pon),
        tokenQuery: parseTokenOrInvalidArg(
          decodeAnnotationAppearancesRenderToken,
          token,
          'appearance render token',
        ),
        query: req.query,
      });
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/appearances',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName, pon } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'annotations-read', pdfBits);
      return renderAnnotationAppearances({
        documentService,
        pool,
        imageEncoder,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: parsePageObjectNumber(pon),
        query: req.query,
      });
    },
  );

  app.post('/v1/docs/:docId/layers/:layerName/weak-annotation-sessions', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
    setNoStore(reply);
    const body = parseOrInvalidArg(
      WeakAnnotationSessionPagesRequestSchema,
      req.body,
      'request body',
    );
    return requireWeakAnnotationSessions(weakAnnotationSessions).begin(
      { tenantId: ctx.tenantId, sub: ctx.sub },
      {
        docId,
        layerName,
        pageObjectNumbers: body.pageObjectNumbers,
      },
    );
  });

  app.post(
    '/v1/docs/:docId/layers/:layerName/weak-annotation-sessions/:sessionId/pages',
    async (req, reply) => {
      const { docId, layerName, sessionId } = req.params as {
        docId: string;
        layerName: string;
        sessionId: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
      setNoStore(reply);
      const body = parseOrInvalidArg(
        WeakAnnotationSessionPagesRequestSchema,
        req.body,
        'request body',
      );
      return requireWeakAnnotationSessions(weakAnnotationSessions).updatePages(
        { tenantId: ctx.tenantId, sub: ctx.sub },
        {
          docId,
          layerName,
          sessionId,
          pageObjectNumbers: body.pageObjectNumbers,
        },
      );
    },
  );

  app.post(
    '/v1/docs/:docId/layers/:layerName/weak-annotation-sessions/:sessionId/heartbeat',
    async (req, reply) => {
      const { docId, layerName, sessionId } = req.params as {
        docId: string;
        layerName: string;
        sessionId: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
      setNoStore(reply);
      return requireWeakAnnotationSessions(weakAnnotationSessions).heartbeat(
        { tenantId: ctx.tenantId, sub: ctx.sub },
        { docId, layerName, sessionId },
      );
    },
  );

  app.delete(
    '/v1/docs/:docId/layers/:layerName/weak-annotation-sessions/:sessionId',
    async (req, reply) => {
      const { docId, layerName, sessionId } = req.params as {
        docId: string;
        layerName: string;
        sessionId: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
      await requireWeakAnnotationSessions(weakAnnotationSessions).release(
        { tenantId: ctx.tenantId, sub: ctx.sub },
        { docId, layerName, sessionId },
      );
      setNoStore(reply);
      return reply.code(204).send();
    },
  );

  app.post('/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/items', async (req, reply) => {
    const { docId, layerName, pon } = req.params as {
      docId: string;
      layerName: string;
      pon: string;
    };
    const pageObjectNumber = parsePageObjectNumber(pon);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    // Creation is a collab check against the caller's own identity
    // (no impersonation). `:self`/`:all` trivially pass; `:group=X`
    // constrains creators to those whose default group is X. Under
    // the narrowing model, `doc.annotate.modify` covers create when
    // no create-collab filter is present.
    const target = targetForSelfCreate(accessCtx.jwt);
    const ctx = requireLayerCollabAction(req, docId, layerName, 'create', target, pdfBits);
    const { body, resources } = await readMutationEnvelope(req, annotationBinaryPolicy);
    const draft = parseOrInvalidArg<WireAnnotationDraft>(
      AnnotationDraftSchema as unknown as SchemaLike<WireAnnotationDraft>,
      body,
      'request body',
    );
    const actor = actorFromJwt(ctx.jwt);

    setNoStore(reply);
    return layerService.createAnnotation(
      ctx,
      {
        docId,
        layerName,
        pageObjectNumber,
        draft,
        actor,
        ...(resources ? { resources } : {}),
      },
      abortSignalFromRequest(req),
    );
  });

  app.post(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/items/move',
    async (req, reply) => {
      const { docId, layerName, pon } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
      };
      const pageObjectNumber = parsePageObjectNumber(pon);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
      const body = req.body as Record<string, unknown> | null | undefined;
      const rawRefs = body?.refs;
      const rawToIndex = body?.toIndex;
      if (!Array.isArray(rawRefs) || rawRefs.length === 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'body.refs: expected non-empty array of AnnotationRef',
        );
      }
      if (typeof rawToIndex !== 'number' || !Number.isInteger(rawToIndex) || rawToIndex < 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'body.toIndex: expected non-negative integer',
        );
      }
      const refs: AnnotationRef[] = rawRefs.map((raw, i) => {
        const ref = parseOrInvalidArg<AnnotationRef>(
          AnnotationRefSchema as unknown as SchemaLike<AnnotationRef>,
          raw,
          `body.refs[${i}]`,
        );
        assertRefMatchesPage(ref, pageObjectNumber);
        return ref;
      });

      setNoStore(reply);
      return layerService.moveAnnotations(
        ctx,
        { docId, layerName, pageObjectNumber, refs, toIndex: rawToIndex },
        abortSignalFromRequest(req),
      );
    },
  );

  app.patch(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/items/:annotKey',
    async (req, reply) => {
      const { docId, layerName, pon, annotKey } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
        annotKey: string;
      };
      const pageObjectNumber = parsePageObjectNumber(pon);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const envelope = await readMutationEnvelope(req);
      const body = envelope.body as Record<string, unknown> | null | undefined;
      const resources = envelope.resources;
      const signal = abortSignalFromRequest(req);

      if (annotKey === 'index') {
        const ref = parseOrInvalidArg<AnnotationRef>(
          AnnotationRefSchema as unknown as SchemaLike<AnnotationRef>,
          body?.ref,
          'body.ref',
        );
        assertRefMatchesPage(ref, pageObjectNumber);
        if (ref.kind !== 'index') {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `annotKey 'index' requires ref.kind === 'index', got '${ref.kind}'`,
          );
        }
        const action = body?.op === 'delete' ? 'delete' : 'update';
        // Use the outer accessCtx (already JWT-verified, no capability
        // check) for the layer open the target lookup needs to perform.
        const target = await layerService.getAnnotationCollabTarget(
          accessCtx,
          docId,
          layerName,
          pageObjectNumber,
          ref,
          signal,
        );
        const ctx = requireLayerCollabAction(req, docId, layerName, action, target, pdfBits);
        if (action === 'delete') {
          setNoStore(reply);
          return layerService.deleteAnnotation(ctx, { docId, layerName, ref }, signal);
        }

        const patch = parseOrInvalidArg<WireAnnotationPatch>(
          AnnotationPatchSchema as unknown as SchemaLike<WireAnnotationPatch>,
          body?.patch,
          'body.patch',
        );
        const actor = buildUpdateActor(ctx.jwt, target, patch, pdfBits);
        setNoStore(reply);
        return layerService.updateAnnotation(
          ctx,
          { docId, layerName, ref, patch, actor, ...(resources ? { resources } : {}) },
          signal,
        );
      }

      const ref = refFromKey(annotKey, pageObjectNumber);
      const target = await layerService.getAnnotationCollabTarget(
        accessCtx,
        docId,
        layerName,
        pageObjectNumber,
        ref,
        signal,
      );
      const ctx = requireLayerCollabAction(req, docId, layerName, 'update', target, pdfBits);
      const patch = parseOrInvalidArg<WireAnnotationPatch>(
        AnnotationPatchSchema as unknown as SchemaLike<WireAnnotationPatch>,
        body?.patch,
        'body.patch',
      );
      const actor = buildUpdateActor(ctx.jwt, target, patch, pdfBits);
      setNoStore(reply);
      return layerService.updateAnnotation(
        ctx,
        { docId, layerName, ref, patch, actor, ...(resources ? { resources } : {}) },
        signal,
      );
    },
  );

  app.delete(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/items/:annotKey',
    async (req, reply) => {
      const { docId, layerName, pon, annotKey } = req.params as {
        docId: string;
        layerName: string;
        pon: string;
        annotKey: string;
      };
      const pageObjectNumber = parsePageObjectNumber(pon);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);

      if (annotKey === 'index') {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          "cannot DELETE by index; use PATCH with { ref, op: 'delete' } so the revision token can be validated",
        );
      }

      const signal = abortSignalFromRequest(req);
      const ref = refFromKey(annotKey, pageObjectNumber);
      const target = await layerService.getAnnotationCollabTarget(
        accessCtx,
        docId,
        layerName,
        pageObjectNumber,
        ref,
        signal,
      );
      const ctx = requireLayerCollabAction(req, docId, layerName, 'delete', target, pdfBits);

      setNoStore(reply);
      return layerService.deleteAnnotation(
        ctx,
        { docId, layerName, ref: refFromKey(annotKey, pageObjectNumber) },
        abortSignalFromRequest(req),
      );
    },
  );
}

function requireWeakAnnotationSessions(
  service: WeakAnnotationSessionService | undefined,
): WeakAnnotationSessionService {
  if (!service) {
    throw new EngineError(
      EngineErrorCode.NotImplemented,
      'weak annotation sessions are not configured',
    );
  }
  return service;
}

// ----------------------------------------------------------------------
// Annotation identity helpers
//
// Three small pure helpers, one per mutation shape:
//   - targetForSelfCreate: build the CollabTarget for create checks
//                          from JWT identity (no impersonation).
//   - actorFromJwt:        build the worker actor for create from JWT
//                          identity. The worker stamps /T,
//                          /EMBD_Metadata/UserID,CreatedBy,UpdatedBy,
//                          and /EMBD_Metadata/GroupID.
//   - buildUpdateActor:    build the update actor (modification trail
//                          + optional group reassignment gated by
//                          :set-group).
// ----------------------------------------------------------------------

/**
 * Build the CollabTarget for a create check. Targets the caller's own
 * identity — no impersonation, no draft-side override. `:self`/`:all`
 * pass trivially; `:group=X` is the meaningful filter (matches only
 * when the caller's default group is X).
 */
function targetForSelfCreate(jwt: RequestJwtContext): CollabTarget {
  const id = jwt.identity;
  return {
    ...(id.user_id !== undefined ? { userId: id.user_id } : {}),
    ...(id.group_id !== undefined ? { groupId: id.group_id } : {}),
  };
}

/**
 * Build the CREATE actor from the caller's JWT identity. The worker
 * writes:
 *
 *   /T                                         ← actor.displayName
 *   /EMBD_Metadata/UserID,CreatedBy,UpdatedBy  ← actor.userId
 *   /EMBD_Metadata/GroupID                     ← actor.groupId
 *
 * Returns `undefined` when the JWT carries no identity at all
 * (anonymous tenant tokens) — the worker still stamps /M but skips /T
 * and /EMBD_Metadata.
 */

/**
 * The per-kind binary policy the envelope doc long promised: a
 * file-attachment draft's `file` bytes are exempt from the PNG/JPEG/PDF
 * allowlist — attaching arbitrary formats is the point of the kind.
 * Every other resource (stamp `source`) stays strict. Patches carry no
 * binary fields, so update routes keep the strict default.
 */
function annotationBinaryPolicy(body: unknown, key: string): 'image-or-pdf' | 'any' {
  const draft = body as { subtype?: unknown; file?: { resource?: unknown } } | null;
  return draft?.subtype === 'file-attachment' && draft.file?.resource === key
    ? 'any'
    : 'image-or-pdf';
}

function actorFromJwt(jwt: RequestJwtContext): AnnotationActor | undefined {
  const id = jwt.identity;
  const actor: AnnotationActor = {
    ...(id.user_id !== undefined ? { userId: id.user_id } : {}),
    ...(id.group_id !== undefined ? { groupId: id.group_id } : {}),
    ...(id.display_name !== undefined ? { displayName: id.display_name } : {}),
  };
  return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
}

/**
 * Build the worker-side actor for UPDATE.
 *
 *   - `userId`      = caller's JWT user_id → stamped as
 *                     /EMBD_Metadata/UpdatedBy (modification trail).
 *   - `displayName` = caller's display_name → carried for the
 *                     modification trail. The worker does not touch /T
 *                     on update; /T is bound at creation.
 *   - `groupId`     = `patch.groupId` ONLY when it reassigns the row
 *                     (differs from current groupId) → stamped as the
 *                     new /EMBD_Metadata/GroupID. Absent means "don't
 *                     touch."
 *
 * Throws 403 if the patch is reassigning groupId and the caller lacks
 * `annotations:set-group` authority for the new group. UserID and
 * CreatedBy are bound at creation and cannot be patched.
 */
function buildUpdateActor(
  jwt: RequestJwtContext,
  currentTarget: CollabTarget,
  patch: WireAnnotationPatch,
  pdfBits: PdfBits,
): AnnotationActor | undefined {
  const patchedGroupId = (patch as { groupId?: string }).groupId;
  const isReassigningGroup =
    typeof patchedGroupId === 'string' && patchedGroupId !== currentTarget.groupId;

  if (isReassigningGroup) {
    if (!checkSetGroup(patchedGroupId, jwt.identity.group_id, jwt.scope, pdfBits)) {
      throw new EngineError(
        EngineErrorCode.Forbidden,
        `annotations:set-group denied for group=${patchedGroupId}`,
      );
    }
  }

  const actor: AnnotationActor = {
    ...(jwt.identity.user_id !== undefined ? { userId: jwt.identity.user_id } : {}),
    ...(jwt.identity.display_name !== undefined ? { displayName: jwt.identity.display_name } : {}),
    ...(isReassigningGroup ? { groupId: patchedGroupId } : {}),
  };
  return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
}

async function renderAnnotationAppearances(input: {
  documentService: DocumentService;
  pool: EnginePool;
  imageEncoder: SharpImageEncoder;
  derivedRenders?: DerivedRenderService;
  reply: FastifyReply;
  signal: AbortSignal;
  scope: ReadScope;
  pageObjectNumber: number;
  tokenQuery?: Record<string, string>;
  query: unknown;
}) {
  const page = await resolvePageForRead(input);
  if (input.tokenQuery !== undefined) rejectQueryParamsOnTokenUrl(input.query);

  // Token (versioned) and query (unversioned) both arrive as flat string maps.
  // The appearance query schema has no nested keys, so no `unflatten` is needed
  // — z.coerce handles the string→number/enum coercions.
  const flatInput = (input.tokenQuery ?? input.query) as Record<string, unknown>;
  const parsedQuery = parseOrInvalidArg(
    AnnotationAppearancesQuerySchema,
    flatInput,
    input.tokenQuery === undefined ? 'appearance render query' : 'appearance render token',
  );
  const imageOptions: AnnotationAppearanceImageOptions = parsedQuery.options;
  const requestedAnnotationVersion = parsedQuery.annotationVersion;
  // Format lives in the token (versioned) or query (unversioned). The schema
  // requires it on versioned requests; the unversioned alias defaults to webp.
  const format: PageNetworkRenderFormat = parseOrInvalidArg(
    PageNetworkRenderFormatSchema,
    imageOptions.format ?? 'webp',
    'render format',
  );

  if (
    requestedAnnotationVersion !== undefined &&
    requestedAnnotationVersion !== page.cache.annotationVersion
  ) {
    setNoStore(input.reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `appearance annotationVersion ${requestedAnnotationVersion} no longer current (current=${page.cache.annotationVersion}) for page ${input.pageObjectNumber}`,
    );
  }

  // Appearance-scale enforcement: the appearance lattice
  // bounds SCALE — appearances are sized by `rect × scale`, so a page-sized
  // stamp at a high scale is a full-page memory bomb wearing a different
  // token. Same scoping as pages: only VERSIONED (token) requests are
  // enforced; the unversioned alias stays compute-only (no-store), which is
  // the escape hatch for off-canonical needs (rollover/down modes, quality).
  const derived = input.derivedRenders;
  if (
    derived !== undefined &&
    derived.enforced &&
    input.tokenQuery !== undefined &&
    !derived.classifyAppearance({ imageOptions, format }).onLattice
  ) {
    setNoStore(input.reply);
    derived.rejectOffLattice('use snapAppearanceScale(policy, scale)');
  }

  if (input.scope.kind === 'layer') {
    await input.documentService.ensureLayerOnPool(
      input.scope.ctx,
      input.scope.docId,
      input.scope.layerName,
    );
  }

  // Every server render carries the deployment's output-pixel budget —
  // the worker rejects before allocating (degenerate-geometry guard).
  const renderOptions = {
    ...annotationRenderOptionsFromImageOptions(imageOptions),
    ...(derived !== undefined ? { maxOutputPixels: derived.maxRenderPixels } : {}),
  };
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'annotations.renderAppearances' as const,
      jobId,
      docId: input.scope.docId,
      ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
      pageObjectNumber: input.pageObjectNumber,
      options: renderOptions,
    });
  const payload = await input.pool.run(input.scope.docId, build, input.signal);
  if (payload.tag !== 'annotations.renderAppearances') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected annotations.renderAppearances payload: ${payload.tag}`,
    );
  }
  // The worker payload nests the render result under `.result`
  // (`{ tag, result: { pageState, appearances } }`), unlike the flat
  // `pages.render` payload — unwrap it before consuming.
  const result = payload.result;

  // Encode each appearance to the requested format. Every annotation with an
  // appearance stream is emitted — including weak (index-only) ones: the client
  // addresses the image by `part` name and identifies the annotation by `ref`.
  const entries: AnnotationAppearanceManifestEntry[] = [];
  const parts: MultipartPart[] = [];
  let i = 0;
  for (const appearance of result.appearances) {
    const encoded = input.imageEncoder.encode(appearance.raster, {
      format,
      ...(imageOptions.quality !== undefined ? { quality: imageOptions.quality } : {}),
    });
    const body = await encoded.stream.toBuffer();
    const partName = `appearance-${i++}`;
    const ext = format === 'webp' ? 'webp' : 'png';
    entries.push({
      part: partName,
      ref: appearance.ref,
      mode: appearance.mode,
      rect: appearance.rect,
      width: appearance.raster.width,
      height: appearance.raster.height,
      format,
      contentType: encoded.contentType,
    });
    parts.push({
      name: partName,
      filename: `${partName}.${ext}`,
      contentType: encoded.contentType,
      body,
    });
  }

  const manifest: AnnotationAppearanceManifest = {
    pageState: result.pageState,
    appearances: entries,
  };

  requestedAnnotationVersion === undefined
    ? setNoStore(input.reply)
    : setImmutableCache(input.reply);

  const { contentType, body } = buildMultipart(manifest, parts);
  input.reply.type(contentType);
  input.reply.header('X-EmbedPDF-Appearance-Count', String(entries.length));
  return input.reply.send(body);
}

interface MultipartPart {
  name: string;
  filename: string;
  contentType: string;
  body: Buffer;
}

/**
 * Assemble a `multipart/form-data` body by hand. The first part is the JSON
 * manifest (`name="manifest"`); the rest are the encoded appearance images.
 * Fetch's `Response.formData()` parses this on the client — text parts (no
 * filename) come back as strings, image parts (with filename) as `Blob`s.
 */
function buildMultipart(
  manifest: AnnotationAppearanceManifest,
  parts: MultipartPart[],
): { contentType: string; body: Buffer } {
  const boundary = `cloudpdf-${randomBytes(16).toString('hex')}`;
  const CRLF = '\r\n';
  const chunks: Buffer[] = [];

  const manifestJson = Buffer.from(JSON.stringify(manifest), 'utf8');
  chunks.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="manifest"${CRLF}` +
        `Content-Type: application/json${CRLF}${CRLF}`,
      'utf8',
    ),
  );
  chunks.push(manifestJson);
  chunks.push(Buffer.from(CRLF, 'utf8'));

  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}` +
          `Content-Type: ${part.contentType}${CRLF}${CRLF}`,
        'utf8',
      ),
    );
    chunks.push(part.body);
    chunks.push(Buffer.from(CRLF, 'utf8'));
  }

  chunks.push(Buffer.from(`--${boundary}--${CRLF}`, 'utf8'));
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  };
}

function rejectQueryParamsOnTokenUrl(query: unknown): void {
  if (query && typeof query === 'object' && Object.keys(query).length > 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'versioned appearance URLs must encode options in the path token, not query params',
    );
  }
}

async function readAnnotations(input: {
  documentService: DocumentService;
  pool: EnginePool;
  revisionBridge: CloudRevisionBridge;
  reply: { header(name: 'Cache-Control', value: string): unknown };
  signal: AbortSignal;
  scope: ReadScope;
  pageObjectNumber: number;
  requestedVersion?: number;
}) {
  const page = await resolvePageForRead(input);
  if (
    input.requestedVersion !== undefined &&
    input.requestedVersion !== page.cache.annotationVersion
  ) {
    setNoStore(input.reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `${input.scope.kind === 'layer' ? 'layer ' : ''}annotation version ${
        input.requestedVersion
      } no longer current (current=${page.cache.annotationVersion}) for page ${
        input.pageObjectNumber
      }`,
    );
  }

  if (input.scope.kind === 'layer') {
    await input.documentService.ensureLayerOnPool(
      input.scope.ctx,
      input.scope.docId,
      input.scope.layerName,
    );
  }
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'annotations.listFullPage' as const,
      jobId,
      docId: input.scope.docId,
      ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
      pageObjectNumber: input.pageObjectNumber,
    });
  const result = await input.pool.run(input.scope.docId, build, input.signal);
  if (result.tag !== 'annotations.listFullPage') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected ${
        input.scope.kind === 'layer' ? 'layer ' : ''
      }annotations.listFullPage payload: ${result.tag}`,
    );
  }

  if (input.requestedVersion !== undefined) {
    // RE-validate the pin AFTER the worker read. The pre-check ran before
    // parking behind any in-flight write; if that write (or any remote
    // commit) landed while we read, the snapshot in hand belongs to a
    // NEWER version and must not go out under this pin — the response
    // carries `immutable`, so one slip poisons the CDN for every future
    // reader. Refusing costs the client one manifest refetch.
    const fresh = await resolvePageForRead(input);
    if (input.requestedVersion !== fresh.cache.annotationVersion) {
      setNoStore(input.reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `${input.scope.kind === 'layer' ? 'layer ' : ''}annotation version ${
          input.requestedVersion
        } no longer current (current=${fresh.cache.annotationVersion}) for page ${
          input.pageObjectNumber
        }`,
      );
    }
  }

  input.requestedVersion === undefined ? setNoStore(input.reply) : setImmutableCache(input.reply);
  return input.revisionBridge.decorateAnnotationSnapshot(toPageState(page), result.snapshot);
}

async function resolvePageForRead(input: {
  documentService: DocumentService;
  scope: ReadScope;
  pageObjectNumber: number;
}): Promise<ManifestPage> {
  const manifest =
    input.scope.kind === 'layer'
      ? await input.documentService.getLayerManifest(
          input.scope.ctx,
          input.scope.docId,
          input.scope.layerName,
        )
      : await input.documentService.getManifest(input.scope.ctx, input.scope.docId);
  const page = manifest.pages.find((p) => p.state.pageObjectNumber === input.pageObjectNumber);
  if (page) {
    return page;
  }
  throw new EngineError(
    EngineErrorCode.NotFound,
    input.scope.kind === 'layer'
      ? `no page with object number ${input.pageObjectNumber} in layer ${input.scope.layerName} for document ${input.scope.docId}`
      : `no page with object number ${input.pageObjectNumber} in document ${input.scope.docId}`,
  );
}
