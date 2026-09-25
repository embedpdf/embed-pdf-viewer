import { Buffer } from 'node:buffer';

import {
  EngineError,
  EngineErrorCode,
  ANNOTATION_RESOURCE_ROLE_NAMES,
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  checkSetGroup,
  wirePack,
  type AnnotationActor,
  type AnnotationAppearanceImageOptions,
  type AnnotationBundleLimits,
  type AnnotationAppearanceManifest,
  type AnnotationAppearanceManifestEntry,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationResourceRole,
  type WireAnnotationResources,
  type AnnotationRef,
  type CollabTarget,
  type PageNetworkRenderFormat,
  type PdfBits,
  type PageRef,
  type WorkerJobId,
  type AnnotationAppearanceExportInput,
  type AnnotationFlattenInput,
  toPageRef,
  type AnnotationSubtype,
} from '@embedpdf/engine-core/runtime';
import {
  AnnotationAppearancesQuerySchema,
  AnnotationDraftSchema,
  AnnotationPatchSchema,
  annotationPatchSchemaOf,
  AnnotationAppearanceExportInputSchema,
  AnnotationFlattenInputSchema,
  AnnotationRefSchema,
  annotationRenderOptionsFromImageOptions,
  decodeAnnotationAppearancesRenderToken,
  decodeAnnotationToken,
  decodeAnnotationsAllToken,
  decodeAnnotationsExportToken,
  type AnnotationsExportToken,
  PageNetworkRenderFormatSchema,
  WeakAnnotationSessionPagesRequestSchema,
  type ManifestPage,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  abortSignalFromRequest,
  parseOrInvalidArg,
  parseTokenOrInvalidArg,
  resolvePageKeyParam,
  resolvePageRefToNumber,
  setImmutableCache,
  setNoStore,
  toPageState,
  type SchemaLike,
} from './_helpers';
import { readAnnotationImportRequest } from './_annotationImportRequest';
import { buildMultipart, type MultipartPart } from './_multipart';
import { readMutationEnvelope, type MutationEnvelope } from './_mutationEnvelope';
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
import type { CloudRevisionBridge } from '../services/CloudRevisionBridge';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService, OpenContext } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';
import type { WeakAnnotationSessionService } from '../services/WeakAnnotationSessionService';

interface AnnotationRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
  revisionBridge: CloudRevisionBridge;
  imageEncoder: SharpImageEncoder;
  /** Encode appearance renders in the engine worker by default.
   *  `false` = the `CLOUDPDF_ENCODE_IN_ENGINE=0` escape hatch. */
  encodeInEngine?: boolean;
  weakAnnotationSessions?: WeakAnnotationSessionService;
  /** Render-lattice policy plane (absent = legacy compute-only). */
  derivedRenders?: DerivedRenderService;
  /** How large an exported or imported annotation bundle may be; the defaults otherwise. */
  bundleLimits?: AnnotationBundleLimits;
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
    revisionBridge,
    imageEncoder,
    weakAnnotationSessions,
    derivedRenders,
  } = deps;
  const encodeInEngine = deps.encodeInEngine ?? true;
  const bundleLimits = deps.bundleLimits ?? DEFAULT_ANNOTATION_BUNDLE_LIMITS;

  // ── Plane-scoped doc-level reads: a base's own annotations —
  //    weak-identity ones included — are simply visible through every
  //    annotations-inheriting layer, so the list and appearance batches are
  //    one CDN object served from the base worker session. Guarded by the
  //    `annotations` plane (`requireSharedDocRead`); an annotation-writing
  //    layer 404s here into the SDK's manifest-refresh rail and reads its
  //    own layer-scoped view. ─────────────────────────────────────────────

  app.get('/v1/docs/:docId/annotations/pages/:pageKey/items@:token', async (req, reply) => {
    const { docId, pageKey, token } = req.params as {
      docId: string;
      pageKey: string;
      token: string;
    };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'page-annotations', [
      'annotations',
    ]);
    return readAnnotations({
      documentService,
      revisionBridge,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      pageObjectNumber: resolvePageKeyParam(pageKey),
      requestedVersion: parseTokenOrInvalidArg(
        decodeAnnotationToken,
        token,
        'annotationVersion token',
      ),
    });
  });

  app.get(
    '/v1/docs/:docId/annotations/pages/:pageKey/appearances@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, pageKey, token } = req.params as {
        docId: string;
        pageKey: string;
        token: string;
      };
      const ctx = await requireSharedDocRead(req, documentService, docId, 'page-annotations', [
        'annotations',
      ]);
      return renderAnnotationAppearances({
        documentService,
        imageEncoder,
        encodeInEngine,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'base', ctx, docId },
        pageObjectNumber: resolvePageKeyParam(pageKey),
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
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items@:token',
    async (req, reply) => {
      const { docId, layerName, pageKey, token } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'annotations-read', pdfBits);
      return readAnnotations({
        documentService,
        revisionBridge,
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: resolvePageKeyParam(pageKey),
        requestedVersion: parseTokenOrInvalidArg(
          decodeAnnotationToken,
          token,
          'annotationVersion token',
        ),
      });
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items',
    async (req, reply) => {
      const { docId, layerName, pageKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'annotations-read', pdfBits);
      return readAnnotations({
        documentService,
        revisionBridge,
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: resolvePageKeyParam(pageKey),
      });
    },
  );

  // ── Whole-document bulk listing: one CDN-immutable object per
  //    `annotationsVersion` pin, materialized by a single raw (no
  //    page-load) sweep. The doc-level twin serves annotations-inheriting
  //    layers from the base session; a diverged layer reads its own view.
  //    The plain layer route is the public backend operation; the viewer
  //    protocol continues to use the immutable version-addressed routes. ─

  app.get('/v1/docs/:docId/annotations/items@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'annotations-all', [
      'annotations',
    ]);
    return readAnnotationsAll({
      documentService,
      revisionBridge,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'base', ctx, docId },
      requestedVersion: parseTokenOrInvalidArg(
        decodeAnnotationsAllToken,
        token,
        'annotationsVersion token',
      ),
    });
  });

  app.get('/v1/docs/:docId/layers/:layerName/annotations/items@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-annotations-all', pdfBits);
    return readAnnotationsAll({
      documentService,
      revisionBridge,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
      requestedVersion: parseTokenOrInvalidArg(
        decodeAnnotationsAllToken,
        token,
        'annotationsVersion token',
      ),
    });
  });

  // ── Annotation export: a bundle as multipart at an annotation and a layout
  //    pin (the bundle carries its pages' positions and boxes). It egresses
  //    content, so it needs `doc.download` beside the annotation read.
  //    Immutable per token, so the CDN can cache it; the doc-level twin
  //    serves layers that inherit both planes. ─

  app.get(
    '/v1/docs/:docId/annotations/export@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, token } = req.params as { docId: string; token: string };
      const ctx = await requireSharedDocRead(req, documentService, docId, 'annotations-export', [
        'annotations',
        'layout',
      ]);
      return exportAnnotations({
        documentService,
        limits: bundleLimits,
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'base', ctx, docId },
        token: parseTokenOrInvalidArg(
          decodeAnnotationsExportToken,
          token,
          'annotation export token',
        ),
      });
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/annotations/export@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName, token } = req.params as {
        docId: string;
        layerName: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-annotations-export', pdfBits);
      return exportAnnotations({
        documentService,
        limits: bundleLimits,
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        token: parseTokenOrInvalidArg(
          decodeAnnotationsExportToken,
          token,
          'annotation export token',
        ),
      });
    },
  );

  app.get('/v1/docs/:docId/layers/:layerName/annotations/items', async (req, reply) => {
    const { docId, layerName } = req.params as {
      docId: string;
      layerName: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-annotations-all', pdfBits);
    return readAnnotationsAll({
      documentService,
      revisionBridge,
      reply,
      signal: abortSignalFromRequest(req),
      scope: { kind: 'layer', ctx, docId, layerName },
    });
  });

  // Batch-rendered annotation appearance bitmaps for a page, returned as a
  // `multipart/form-data` body (one image part per annotation + a JSON
  // manifest). Sibling of `items` under the same `annotations-read` resource,
  // so it shares the `doc.annotate.read` gate and the CDN coverage — reading
  // an annotation lets you see its rendered appearance. `compress: false`
  // keeps the binary multipart body un-gzipped end to end.
  app.get(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/appearances@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName, pageKey, token } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
        token: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'annotations-read', pdfBits);
      return renderAnnotationAppearances({
        documentService,
        imageEncoder,
        encodeInEngine,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: resolvePageKeyParam(pageKey),
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
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/appearances',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName, pageKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'annotations-read', pdfBits);
      return renderAnnotationAppearances({
        documentService,
        imageEncoder,
        encodeInEngine,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalFromRequest(req),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: resolvePageKeyParam(pageKey),
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
        pageObjectNumbers: weakSessionPages(body.pages),
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
          pageObjectNumbers: weakSessionPages(body.pages),
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

  // A bundle's annotations, created as one change. The parts stream in
  // under the bundle limits; the `Idempotency-Key` header names the import,
  // so a retry returns what the first request committed.
  app.post('/v1/docs/:docId/layers/:layerName/annotations/import', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const idempotencyKey = idempotencyKeyOf(req.headers['idempotency-key']);
    const limits = bundleLimits;
    const { manifest, resources } = await readAnnotationImportRequest(req, limits);
    const attribution = manifest.options.attribution ?? 'restore';

    let ctx = requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
    if (attribution === 'restore') {
      // Restoring writes attribution that isn't the caller's, groups
      // included, so it takes the capability instead of per-group checks.
      ctx = requireLayerCapability(req, docId, layerName, 'doc.annotate.import', pdfBits);
    } else {
      // Each annotation is made as a create makes it, so each group the
      // items name takes the authority a create in it would.
      const groups = new Set<string | undefined>();
      for (const item of manifest.bundle.items as unknown as Array<{
        data?: { groupId?: unknown };
      }>) {
        const groupId = item?.data?.groupId;
        groups.add(typeof groupId === 'string' ? groupId : undefined);
      }
      for (const groupId of groups) {
        const group = createGroupOf(accessCtx.jwt, { groupId } as AnnotationDraft, pdfBits);
        const target = targetForSelfCreate(accessCtx.jwt, group);
        ctx = requireLayerCollabAction(req, docId, layerName, 'create', target, pdfBits);
      }
    }
    // The caller: whom `stamp` attributes to, whom `restore` records as `importedBy`.
    const actor = actorFromJwt(ctx.jwt, accessCtx.jwt.identity.groupId);

    setNoStore(reply);
    return layerService.importAnnotations(
      ctx,
      {
        docId,
        layerName,
        bundle: { ...manifest.bundle, resources },
        ...(manifest.options.pages !== undefined ? { pages: manifest.options.pages } : {}),
        attribution,
        ...(actor ? { actor } : {}),
        limits,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      abortSignalFromRequest(req),
    );
  });

  app.post(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items',
    async (req, reply) => {
      const { docId, layerName, pageKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
      };
      const pageObjectNumber = resolvePageKeyParam(pageKey);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const envelope = await readMutationEnvelope(req, annotationBinaryPolicy);
      const draft = parseOrInvalidArg<AnnotationDraft>(
        AnnotationDraftSchema as unknown as SchemaLike<AnnotationDraft>,
        envelope.body,
        'request body',
      );
      const resources = annotationResourcesOf(envelope);
      // Creation is a collab check against the caller's own identity
      // (no impersonation), in the group the annotation is created in:
      // the draft's, when it names one the caller may set, else the
      // caller's default. `:self`/`:all` trivially pass; `:group=X`
      // constrains that group to X. Under the narrowing model,
      // `doc.annotate.modify` covers create when no create-collab filter
      // is present.
      const groupId = createGroupOf(accessCtx.jwt, draft, pdfBits);
      const target = targetForSelfCreate(accessCtx.jwt, groupId);
      const ctx = requireLayerCollabAction(req, docId, layerName, 'create', target, pdfBits);
      const actor = actorFromJwt(ctx.jwt, groupId);

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
    },
  );

  app.post(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/move',
    async (req, reply) => {
      const { docId, layerName, pageKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
      };
      const pageObjectNumber = resolvePageKeyParam(pageKey);
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

  // Selective flatten: `pages.flatten` for a chosen set of this page's
  // annotations — the whole-page verb's gates, one page's content and
  // annotation pins bumped, persisted like a page flatten.
  app.post(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/flatten',
    async (req, reply) => {
      const { docId, layerName, pageKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
      };
      const pageObjectNumber = resolvePageKeyParam(pageKey);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.pages.modify', pdfBits);
      requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits);
      const raw = (req.body ?? {}) as { refs?: unknown; usage?: unknown };
      const body = parseOrInvalidArg<AnnotationFlattenInput>(
        AnnotationFlattenInputSchema as unknown as SchemaLike<AnnotationFlattenInput>,
        { refs: raw.refs, usage: raw.usage ?? 'display' },
        'request body',
      );
      for (const ref of body.refs) assertRefMatchesPage(ref, pageObjectNumber);

      setNoStore(reply);
      return layerService.flattenAnnotations(
        ctx,
        { docId, layerName, pageObjectNumber, refs: body.refs, usage: body.usage },
        abortSignalFromRequest(req),
      );
    },
  );

  // The chosen annotations' appearances as one single-page PDF: a derived
  // read that egresses content, gated by `doc.download` like pages/extract.
  app.post(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/appearance',
    async (req, reply) => {
      const { docId, layerName, pageKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
      };
      const pageObjectNumber = resolvePageKeyParam(pageKey);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.download', pdfBits);
      const body = parseOrInvalidArg<AnnotationAppearanceExportInput>(
        AnnotationAppearanceExportInputSchema as unknown as SchemaLike<AnnotationAppearanceExportInput>,
        req.body,
        'request body',
      );
      for (const ref of body.refs) assertRefMatchesPage(ref, pageObjectNumber);

      const bytes = await documentService.exportAnnotationAppearance(
        ctx,
        docId,
        layerName,
        pageObjectNumber,
        body.refs,
        abortSignalFromRequest(req),
      );
      setNoStore(reply);
      reply.type('application/pdf');
      return reply.send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    },
  );

  // An annotation's `appearance` resource: its drawing, as a one-page PDF. A
  // read that egresses content, gated by `doc.download` like the export above.
  // Durable keys only: a weak index ref needs a revision-validated body.
  app.get(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/:annotKey/resources/appearance',
    async (req, reply) => {
      const { docId, layerName, pageKey, annotKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
        annotKey: string;
      };
      const pageObjectNumber = resolvePageKeyParam(pageKey);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.download', pdfBits);
      const bytes = await documentService.readAnnotationAppearance(
        ctx,
        docId,
        layerName,
        pageObjectNumber,
        refFromKey(annotKey, pageObjectNumber),
        abortSignalFromRequest(req),
      );
      setNoStore(reply);
      reply.type('application/pdf');
      return reply.send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    },
  );

  app.patch(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/:annotKey',
    async (req, reply) => {
      const { docId, layerName, pageKey, annotKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
        annotKey: string;
      };
      const pageObjectNumber = resolvePageKeyParam(pageKey);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const envelope = await readMutationEnvelope(req, annotationBinaryPolicy);
      const body = envelope.body as Record<string, unknown> | null | undefined;
      const resources = annotationResourcesOf(envelope);
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

        const patch = parseOrInvalidArg<AnnotationPatch>(
          patchSchemaFor(target.subtype),
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
      const patch = parseOrInvalidArg<AnnotationPatch>(
        patchSchemaFor(target.subtype),
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
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/:annotKey',
    async (req, reply) => {
      const { docId, layerName, pageKey, annotKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
        annotKey: string;
      };
      const pageObjectNumber = resolvePageKeyParam(pageKey);
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

/**
 * Weak sessions are keyed by page object number (DB rows, SSE events); the
 * wire carries `PageRef`s. Unwrap at the route, then dedupe — the schema no
 * longer collapses duplicates itself.
 */
function weakSessionPages(pages: readonly PageRef[]): number[] {
  return [...new Set(pages.map(resolvePageRefToNumber))];
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
// Small pure helpers for the identity a mutation carries:
//   - createGroupOf:       the group a create lands in (set-group checked)
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
 * The group a new annotation is created in: the draft's `groupId` when it
 * names one, else the caller's default group. A group other than the
 * caller's own needs `annotations:set-group` authority for it, as a
 * reassignment on update does.
 */
function createGroupOf(
  jwt: RequestJwtContext,
  draft: AnnotationDraft,
  pdfBits: PdfBits,
): string | undefined {
  const groupId = (draft as { groupId?: string | null }).groupId ?? jwt.identity.groupId;
  if (groupId !== undefined && groupId !== jwt.identity.groupId) {
    if (!checkSetGroup(groupId, jwt.identity.groupId, jwt.scope, pdfBits)) {
      throw new EngineError(
        EngineErrorCode.Forbidden,
        `annotations:set-group denied for group=${groupId}`,
      );
    }
  }
  return groupId;
}

/** The `Idempotency-Key` header: printable ASCII, 1 to 255 characters. */
function idempotencyKeyOf(header: string | string[] | undefined): string | undefined {
  if (header === undefined) return undefined;
  if (typeof header !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(header)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'Idempotency-Key must be 1 to 255 printable ASCII characters',
    );
  }
  return header;
}

/**
 * Build the CollabTarget for a create check. Targets the caller's own
 * identity — no impersonation — in the group the annotation is created
 * in. `:self`/`:all` pass trivially; `:group=X` is the meaningful filter.
 */
function targetForSelfCreate(jwt: RequestJwtContext, groupId: string | undefined): CollabTarget {
  const { userId } = jwt.identity;
  return {
    ...(userId !== undefined ? { userId } : {}),
    ...(groupId !== undefined ? { groupId } : {}),
  };
}

/**
 * How an annotation's resource parts are checked: an `appearance` must be
 * PNG, JPEG or PDF, and a `file` may be any bytes (attaching any format is
 * the point). The parts are named by role: `resource:appearance`,
 * `resource:file`.
 */
function annotationBinaryPolicy(_body: unknown, key: string): 'image-or-pdf' | 'any' {
  return key === 'file' ? 'any' : 'image-or-pdf';
}

/**
 * The resources of an annotation write, by role, from its multipart parts.
 * Whether the kind takes them is the engine's check.
 */
function annotationResourcesOf(envelope: MutationEnvelope): WireAnnotationResources | undefined {
  if (!envelope.resources) return undefined;
  const resources: WireAnnotationResources = {};
  for (const [role, { bytes }] of Object.entries(envelope.resources)) {
    if ((ANNOTATION_RESOURCE_ROLE_NAMES as readonly string[]).includes(role)) {
      resources[role as AnnotationResourceRole] = bytes;
    } else {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `unknown annotation resource part 'resource:${role}'; expected 'resource:appearance' or 'resource:file'`,
      );
    }
  }
  return resources;
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
function actorFromJwt(
  jwt: RequestJwtContext,
  groupId: string | undefined,
): AnnotationActor | undefined {
  const { userId, displayName } = jwt.identity;
  const actor: AnnotationActor = {
    ...(userId !== undefined ? { userId } : {}),
    ...(groupId !== undefined ? { groupId } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
  };
  return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
}

/**
 * Build the worker-side actor for UPDATE.
 *
 *   - `userId`      = the caller's `identity.userId` → stamped as
 *                     /EMBD_Metadata/UpdatedBy (modification trail).
 *   - `displayName` = the caller's `identity.displayName` → carried for the
 *                     modification trail. The worker does not touch /T
 *                     on update; /T is bound at creation.
 *   - `groupId`     = `patch.groupId` only when it reassigns the row
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
  patch: AnnotationPatch,
  pdfBits: PdfBits,
): AnnotationActor | undefined {
  const patchedGroupId = (patch as { groupId?: string | null }).groupId;
  // `null` sent back for an annotation without a group changes nothing;
  // an existing group can only be reassigned, never removed.
  if (patchedGroupId === null && currentTarget.groupId !== undefined) {
    throw new EngineError(EngineErrorCode.InvalidArg, "an annotation's group can't be removed");
  }
  const isReassigningGroup =
    typeof patchedGroupId === 'string' && patchedGroupId !== currentTarget.groupId;

  if (isReassigningGroup) {
    if (!checkSetGroup(patchedGroupId, jwt.identity.groupId, jwt.scope, pdfBits)) {
      throw new EngineError(
        EngineErrorCode.Forbidden,
        `annotations:set-group denied for group=${patchedGroupId}`,
      );
    }
  }

  const actor: AnnotationActor = {
    ...(jwt.identity.userId !== undefined ? { userId: jwt.identity.userId } : {}),
    ...(jwt.identity.displayName !== undefined ? { displayName: jwt.identity.displayName } : {}),
    ...(isReassigningGroup ? { groupId: patchedGroupId } : {}),
  };
  return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
}

async function renderAnnotationAppearances(input: {
  documentService: DocumentService;
  imageEncoder: SharpImageEncoder;
  encodeInEngine: boolean;
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
  // bounds scale — appearances are sized by `rect × scale`, so a page-sized
  // stamp at a high scale is a full-page memory bomb wearing a different
  // token. Same scoping as pages: only versioned (token) requests are
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
  // Both branches produce the same manifest ingredients. In-engine encode
  // With in-engine encoding (the default), the appearance raster batch never leaves
  // the worker — it crosses the engine boundary as compressed images.
  // The legacy branch (CLOUDPDF_ENCODE_IN_ENGINE=0) keeps API-side sharp
  // on the raw raster payload for one release.
  const collect = async (): Promise<{
    pageState: AnnotationAppearanceManifest['pageState'];
    entries: AnnotationAppearanceManifestEntry[];
    parts: MultipartPart[];
  }> => {
    const entries: AnnotationAppearanceManifestEntry[] = [];
    const parts: MultipartPart[] = [];
    const ext = format === 'webp' ? 'webp' : 'png';
    let i = 0;
    if (input.encodeInEngine) {
      const build = (jobId: WorkerJobId) =>
        wirePack({
          kind: 'annotations.renderAppearancesEncoded' as const,
          jobId,
          docId: input.scope.docId,
          ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
          page: toPageRef(input.pageObjectNumber),
          options: renderOptions,
          encode: {
            format,
            ...(imageOptions.quality !== undefined ? { quality: imageOptions.quality } : {}),
          },
        });
      const scope = input.scope;
      const payload = await input.documentService.readOnPool(
        scope.ctx,
        scope.docId,
        scope.kind === 'layer' ? scope.layerName : undefined,
        build,
        input.signal,
      );
      if (payload.tag !== 'annotations.renderAppearancesEncoded') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `unexpected annotations.renderAppearancesEncoded payload: ${payload.tag}`,
        );
      }
      // Every annotation with an appearance stream is emitted — including
      // weak (index-only) ones: the client addresses the image by `part`
      // name and identifies the annotation by `ref`.
      for (const appearance of payload.result.appearances) {
        const partName = `appearance-${i++}`;
        entries.push({
          part: partName,
          ref: appearance.ref,
          mode: appearance.mode,
          rect: appearance.rect,
          width: appearance.image.width,
          height: appearance.image.height,
          format,
          contentType: appearance.image.contentType,
        });
        parts.push({
          name: partName,
          filename: `${partName}.${ext}`,
          contentType: appearance.image.contentType,
          body: Buffer.from(appearance.image.bytes),
        });
      }
      return { pageState: payload.result.pageState, entries, parts };
    }
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.renderAppearances' as const,
        jobId,
        docId: input.scope.docId,
        ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
        page: toPageRef(input.pageObjectNumber),
        options: renderOptions,
      });
    const scope = input.scope;
    const payload = await input.documentService.readOnPool(
      scope.ctx,
      scope.docId,
      scope.kind === 'layer' ? scope.layerName : undefined,
      build,
      input.signal,
    );
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
    for (const appearance of result.appearances) {
      const encoded = input.imageEncoder.encode(appearance.raster, {
        format,
        ...(imageOptions.quality !== undefined ? { quality: imageOptions.quality } : {}),
      });
      const body = await encoded.stream.toBuffer();
      const partName = `appearance-${i++}`;
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
    return { pageState: result.pageState, entries, parts };
  };
  const { pageState, entries, parts } = await collect();

  const manifest: AnnotationAppearanceManifest = {
    pageState,
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
  // Raw read (docPtr dictionary walk, no FPDF_LoadPage): wire-identical to
  // the full path today — no dispatched subtype reader uses the pagePtr —
  // and ~1000x cheaper per cold leaf materialization. If a pagePtr-dependent
  // reader ever lands, the local-vs-cloud conformance parity diff fails and
  // forces this choice back onto the table (safe-by-conformance).
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'annotations.listRawPage' as const,
      jobId,
      docId: input.scope.docId,
      ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
      page: toPageRef(input.pageObjectNumber),
    });
  const scope = input.scope;
  const result = await input.documentService.readOnPool(
    scope.ctx,
    scope.docId,
    scope.kind === 'layer' ? scope.layerName : undefined,
    build,
    input.signal,
  );
  if (result.tag !== 'annotations.listRawPage') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected ${
        input.scope.kind === 'layer' ? 'layer ' : ''
      }annotations.listRawPage payload: ${result.tag}`,
    );
  }

  if (input.requestedVersion !== undefined) {
    // Re-validate the pin after the worker read. The pre-check ran before
    // parking behind any in-flight write; if that write (or any remote
    // commit) landed while we read, the snapshot in hand belongs to a
    // newer version and must not go out under this pin — the response
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

/**
 * Whole-document bulk read: One `annotations.listRawAll` worker job per
 * attempt (the raw docPtr sweep — no per-page loads). Version-addressed
 * reads double-check the manifest pin before serving a CDN-immutable body.
 * The public current-version read retries once if a mutation races the
 * sweep, then returns a retryable conflict rather than mixing a snapshot
 * with the wrong audit cursor. The response stamps the pre-check
 * manifest's `auditHead`, so replaying events with `serverId > auditHead`
 * over this body is exact.
 */
/**
 * One export job at the token's pins, checked before and after the job so an
 * immutable body never belongs to another version: a stale pin is a 404 the
 * client answers by refreshing its manifest. The response is the bundle
 * without its bytes as `manifest`, then one part per resource, named by id.
 */
async function exportAnnotations(input: {
  documentService: DocumentService;
  limits: AnnotationBundleLimits;
  reply: FastifyReply;
  signal: AbortSignal;
  scope: ReadScope;
  token: AnnotationsExportToken;
}) {
  const { scope, token } = input;
  const layerName = scope.kind === 'layer' ? scope.layerName : undefined;
  const assertCurrent = async () => {
    const manifest =
      layerName !== undefined
        ? await input.documentService.getLayerManifest(scope.ctx, scope.docId, layerName)
        : await input.documentService.getManifest(scope.ctx, scope.docId);
    const annotationsVersion = manifest.annotationsVersion ?? 1;
    const layoutVersion = manifest.layoutVersion ?? 1;
    if (token.annotationsVersion !== annotationsVersion || token.layoutVersion !== layoutVersion) {
      setNoStore(input.reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `annotation export at annotationsVersion ${token.annotationsVersion}, layoutVersion ${token.layoutVersion} no longer current (current: ${annotationsVersion}, ${layoutVersion})`,
      );
    }
  };

  await assertCurrent();
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'annotations.export' as const,
      jobId,
      docId: scope.docId,
      ...(layerName !== undefined ? { layerName } : {}),
      selection: token.selection,
      limits: input.limits,
    });
  const result = await input.documentService.readOnPool(
    scope.ctx,
    scope.docId,
    layerName,
    build,
    input.signal,
  );
  if (result.tag !== 'annotations.export') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected annotations.export payload: ${result.tag}`,
    );
  }
  await assertCurrent();

  const { resources, ...manifest } = result.bundle;
  const parts: MultipartPart[] = Object.entries(resources).map(([id, bytes]) => ({
    name: `resource:${id}`,
    filename: id,
    contentType: 'application/octet-stream',
    body: Buffer.from(bytes),
  }));
  setImmutableCache(input.reply);
  const { contentType, body } = buildMultipart(manifest, parts);
  input.reply.type(contentType);
  return input.reply.send(body);
}

async function readAnnotationsAll(input: {
  documentService: DocumentService;
  revisionBridge: CloudRevisionBridge;
  reply: { header(name: 'Cache-Control', value: string): unknown };
  signal: AbortSignal;
  scope: ReadScope;
  requestedVersion?: number;
}) {
  const scope = input.scope;
  const getManifest = () =>
    scope.kind === 'layer'
      ? input.documentService.getLayerManifest(scope.ctx, scope.docId, scope.layerName)
      : input.documentService.getManifest(scope.ctx, scope.docId);

  const maxAttempts = input.requestedVersion === undefined ? 2 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const manifest = await getManifest();
    const current = manifest.annotationsVersion ?? 1;
    if (input.requestedVersion !== undefined && input.requestedVersion !== current) {
      setNoStore(input.reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `${scope.kind === 'layer' ? 'layer ' : ''}annotations version ${
          input.requestedVersion
        } no longer current (current=${current})`,
      );
    }
    const pinnedVersion = input.requestedVersion ?? current;

    if (scope.kind === 'layer') {
      await input.documentService.ensureLayerOnPool(scope.ctx, scope.docId, scope.layerName);
    }
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.listRawAll' as const,
        jobId,
        docId: scope.docId,
        ...(scope.kind === 'layer' ? { layerName: scope.layerName } : {}),
      });
    const result = await input.documentService.readOnPool(
      scope.ctx,
      scope.docId,
      scope.kind === 'layer' ? scope.layerName : undefined,
      build,
      input.signal,
    );
    if (result.tag !== 'annotations.listRawAll') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected ${scope.kind === 'layer' ? 'layer ' : ''}annotations.listRawAll payload: ${
          result.tag
        }`,
      );
    }

    // Re-validate the pin after the worker read (see readAnnotations).
    const fresh = await getManifest();
    const freshCurrent = fresh.annotationsVersion ?? 1;
    if (pinnedVersion !== freshCurrent) {
      setNoStore(input.reply);
      if (input.requestedVersion !== undefined) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `${scope.kind === 'layer' ? 'layer ' : ''}annotations version ${
            input.requestedVersion
          } no longer current (current=${freshCurrent})`,
        );
      }
      if (attempt + 1 < maxAttempts) continue;
      throw new EngineError(
        EngineErrorCode.LayerVersionConflict,
        `${scope.kind === 'layer' ? 'layer ' : ''}annotations changed while reading; retry the request`,
      );
    }

    // Decorate every page with its cloud-stable PageState from the same
    // manifest that certified the pin (toManifestPage already scope-stamped
    // the revision tokens).
    const stateByPageObjectNumber = new Map(
      manifest.pages.map((page) => [page.state.page.pageObjectNumber, page.state]),
    );
    const pages = result.snapshot.pages.map((page) => {
      const state = stateByPageObjectNumber.get(page.pageState.page.pageObjectNumber);
      return state ? input.revisionBridge.decorateAnnotationSnapshot(state, page) : page;
    });

    input.requestedVersion === undefined ? setNoStore(input.reply) : setImmutableCache(input.reply);
    return { pages, auditHead: manifest.auditHead };
  }

  throw new EngineError(
    EngineErrorCode.LayerVersionConflict,
    `${scope.kind === 'layer' ? 'layer ' : ''}annotations changed while reading; retry the request`,
  );
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
  const page = manifest.pages.find((p) => p.state.page.pageObjectNumber === input.pageObjectNumber);
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

/**
 * How a patch is checked: against its target's kind when the target was
 * found, so a field that kind doesn't declare is refused here, otherwise
 * against every kind. The engine refuses a subtype that doesn't match.
 */
function patchSchemaFor(subtype: AnnotationSubtype | undefined): SchemaLike<AnnotationPatch> {
  return (subtype === undefined || subtype === 'unsupported'
    ? AnnotationPatchSchema
    : annotationPatchSchemaOf(subtype)) as unknown as SchemaLike<AnnotationPatch>;
}
