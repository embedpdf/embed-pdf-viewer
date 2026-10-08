import { Buffer } from 'node:buffer';

import {
  EngineError,
  EngineErrorCode,
  ANNOTATION_RESOURCE_ROLE_NAMES,
  DEFAULT_BUNDLE_LIMITS,
  checkSetGroup,
  wirePack,
  type AnnotationActor,
  type BundleLimits,
  type AnnotationDeleteResult,
  type AnnotationUpdateResult,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationResourceRole,
  type WireAnnotationResources,
  type AnnotationPosition,
  type AnnotationRef,
  type CollabTarget,
  type DocumentProtection,
  type PdfBits,
  type WorkerJobId,
  type AnnotationAppearanceExportInput,
  type AnnotationFlattenInput,
  type AnnotationImportManifest,
  toPageRef,
  PermissionDenied,
} from '@embedpdf/engine-core/runtime';
import {
  AnnotationDraftSchema,
  AnnotationPatchSchema,
  AnnotationAppearanceExportInputSchema,
  AnnotationFlattenInputSchema,
  AnnotationReorderBodySchema,
  decodeAnnotationAppearancesRenderToken,
  decodeAnnotationToken,
  decodeAnnotationsAllToken,
  AnnotationImportManifestSchema,
  AnnotationsExportRequestSchema,
  decodeAnnotationsExportToken,
  type AnnotationsExportToken,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  abortSignalOf,
  parseOrInvalidArg,
  parseTokenOrInvalidArg,
  resolvePageKeyParam,
  setImmutableCache,
  setNoStore,
  type SchemaLike,
  objectNumberQuery,
} from './_helpers';
import { readBundleImportRequest } from './_bundleImportRequest';
import { renderAppearanceBatch, resolvePageForRead, type ReadScope } from './_appearanceBatch';
import { buildMultipart, type MultipartPart } from './_multipart';
import { readMutationEnvelope, type MutationEnvelope } from './_mutationEnvelope';
import { requireSharedDocRead } from './_planeGuard';
import { assertRefMatchesPage, refFromKey } from './annotation-route-helpers';
import {
  requireLayerCapability,
  requireLayerAnnotationWrite,
  requireLayerCollabAction,
  requireLayerDocAccessOnly,
  requireLayerResource,
  type RequestJwtContext,
} from '../app/jwt-plugin';
import { SharpImageEncoder } from '../render/SharpImageEncoder';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';

interface AnnotationRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
  imageEncoder: SharpImageEncoder;
  /** Encode appearance renders in the engine worker by default.
   *  `false` = the `CLOUDPDF_ENCODE_IN_ENGINE=0` escape hatch. */
  encodeInEngine?: boolean;
  /** Render-lattice policy plane (absent = legacy compute-only). */
  derivedRenders?: DerivedRenderService;
  /** How large an exported or imported annotation bundle may be; the defaults otherwise. */
  bundleLimits?: BundleLimits;
}

export async function registerAnnotationRoutes(
  app: FastifyInstance,
  deps: AnnotationRouteDeps,
): Promise<void> {
  const { documentService, layerService, imageEncoder, derivedRenders } = deps;
  const encodeInEngine = deps.encodeInEngine ?? true;
  const bundleLimits = deps.bundleLimits ?? DEFAULT_BUNDLE_LIMITS;

  // ── Plane-scoped doc-level reads: a base's own annotations —
  //    inline ones included — are simply visible through every
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
      reply,
      signal: abortSignalOf(reply),
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
      return renderAppearanceBatch({
        family: 'annotations',
        documentService,
        imageEncoder,
        encodeInEngine,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalOf(reply),
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
        reply,
        signal: abortSignalOf(reply),
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
        reply,
        signal: abortSignalOf(reply),
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
      reply,
      signal: abortSignalOf(reply),
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
      reply,
      signal: abortSignalOf(reply),
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
        signal: abortSignalOf(reply),
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
        signal: abortSignalOf(reply),
        scope: { kind: 'layer', ctx, docId, layerName },
        token: parseTokenOrInvalidArg(
          decodeAnnotationsExportToken,
          token,
          'annotation export token',
        ),
      });
    },
  );

  // An export whose selection a URL can't carry (a long ref list): the same
  // pins and the selection in the body, answered uncached.
  app.post(
    '/v1/docs/:docId/layers/:layerName/annotations/export',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName } = req.params as { docId: string; layerName: string };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-annotations-export', pdfBits);
      const request = parseOrInvalidArg<AnnotationsExportToken>(
        AnnotationsExportRequestSchema as unknown as SchemaLike<AnnotationsExportToken>,
        req.body,
        'request body',
      );
      return exportAnnotations({
        documentService,
        limits: bundleLimits,
        reply,
        signal: abortSignalOf(reply),
        scope: { kind: 'layer', ctx, docId, layerName },
        token: request,
        cache: 'no-store',
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
      reply,
      signal: abortSignalOf(reply),
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
      return renderAppearanceBatch({
        family: 'annotations',
        documentService,
        imageEncoder,
        encodeInEngine,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalOf(reply),
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
      return renderAppearanceBatch({
        family: 'annotations',
        documentService,
        imageEncoder,
        encodeInEngine,
        ...(derivedRenders ? { derivedRenders } : {}),
        reply,
        signal: abortSignalOf(reply),
        scope: { kind: 'layer', ctx, docId, layerName },
        pageObjectNumber: resolvePageKeyParam(pageKey),
        query: req.query,
      });
    },
  );

  // A bundle's annotations, created as one change. The parts stream in
  // under the bundle limits; the `Idempotency-Key` header names the import,
  // so a retry returns what the first request committed.
  app.post('/v1/docs/:docId/layers/:layerName/annotations/import', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const limits = bundleLimits;
    const { manifest, resources } = await readBundleImportRequest(req, limits, {
      kind: 'annotation',
      manifestSchema:
        AnnotationImportManifestSchema as unknown as SchemaLike<AnnotationImportManifest>,
    });
    const attribution = manifest.options.attribution ?? 'restore';

    let ctx: ReturnType<typeof requireLayerCollabAction>;
    if (attribution === 'restore') {
      // Restoring writes attribution that isn't the caller's, groups
      // included, so it takes the capabilities instead of per-group checks.
      requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits, protection);
      ctx = requireLayerCapability(
        req,
        docId,
        layerName,
        'doc.annotate.import',
        pdfBits,
        protection,
      );
    } else {
      // Each annotation is made as a create makes it, so each group the
      // items name takes the authority a create in it would, and nothing
      // more: a user who may create their own annotations may paste them.
      const groups = new Set<string | undefined>();
      for (const item of manifest.bundle.items as unknown as Array<{
        data?: { groupId?: unknown };
      }>) {
        const groupId = item?.data?.groupId;
        groups.add(typeof groupId === 'string' ? groupId : undefined);
      }
      // An empty bundle still takes the authority to create.
      if (groups.size === 0) groups.add(undefined);
      let checked: ReturnType<typeof requireLayerCollabAction> | undefined;
      for (const groupId of groups) {
        const group = createGroupOf(accessCtx.jwt, { groupId } as AnnotationDraft, pdfBits);
        const target = targetForSelfCreate(accessCtx.jwt, group);
        checked = requireLayerCollabAction(
          req,
          docId,
          layerName,
          'create',
          target,
          pdfBits,
          protection,
        );
      }
      ctx = checked!;
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
      },
      abortSignalOf(reply),
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
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
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
      const ctx = requireLayerCollabAction(
        req,
        docId,
        layerName,
        'create',
        target,
        pdfBits,
        protection,
      );
      const actor = actorFromJwt(ctx.jwt, groupId);
      const objectNumber = objectNumberQuery(req.query, 'objectNumber');

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
          ...(objectNumber !== undefined ? { objectNumber } : {}),
        },
        abortSignalOf(reply),
      );
    },
  );

  app.post(
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/reorder',
    async (req, reply) => {
      const { docId, layerName, pageKey } = req.params as {
        docId: string;
        layerName: string;
        pageKey: string;
      };
      const pageObjectNumber = resolvePageKeyParam(pageKey);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      // The worker checks each annotation it moves inside the write: a
      // reorder takes `doc.annotate.modify`. Widgets have their own order.
      const ctx = requireLayerAnnotationWrite(req, docId, layerName, pdfBits, protection);
      const { refs, position } = parseOrInvalidArg<{
        refs: AnnotationRef[];
        position: AnnotationPosition;
      }>(
        AnnotationReorderBodySchema as unknown as SchemaLike<{
          refs: AnnotationRef[];
          position: AnnotationPosition;
        }>,
        req.body ?? {},
        'body',
      );
      for (const ref of refs) assertRefMatchesPage(ref, pageObjectNumber);

      setNoStore(reply);
      return layerService.reorderAnnotations(
        ctx,
        { docId, layerName, pageObjectNumber, refs, position, authority: ctx.authority },
        abortSignalOf(reply),
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
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(
        req,
        docId,
        layerName,
        'doc.pages.modify',
        pdfBits,
        protection,
      );
      requireLayerCapability(req, docId, layerName, 'doc.annotate.modify', pdfBits, protection);
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
        abortSignalOf(reply),
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
        abortSignalOf(reply),
      );
      setNoStore(reply);
      reply.type('application/pdf');
      return reply.send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    },
  );

  // An annotation's `appearance` resource: its drawing, as a one-page PDF. A
  // read that egresses content, gated by `doc.download` like the export above.
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
        abortSignalOf(reply),
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
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      const envelope = await readMutationEnvelope(req, annotationBinaryPolicy);
      const body = envelope.body as Record<string, unknown> | null | undefined;
      const resources = annotationResourcesOf(envelope);
      const signal = abortSignalOf(reply);

      setNoStore(reply);
      return updateAnnotation(
        req,
        pdfBits,
        protection,
        {
          docId,
          layerName,
          ref: refFromKey(annotKey, pageObjectNumber),
          patch: body?.patch,
          resources,
        },
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
      const protection = await documentService.getProtection(accessCtx, docId, layerName);

      setNoStore(reply);
      return deleteAnnotation(
        req,
        pdfBits,
        protection,
        { docId, layerName, ref: refFromKey(annotKey, pageObjectNumber) },
        abortSignalOf(reply),
      );
    },
  );

  /**
   * Update an annotation. The patch has to fit some kind here; the worker
   * checks it against its target's kind, and the caller's authority against
   * the target's owner, inside the write.
   */
  async function updateAnnotation(
    req: FastifyRequest,
    pdfBits: PdfBits,
    protection: DocumentProtection | null,
    input: {
      docId: string;
      layerName: string;
      ref: AnnotationRef;
      patch: unknown;
      resources: WireAnnotationResources | undefined;
    },
    signal: AbortSignal,
  ): Promise<AnnotationUpdateResult> {
    const { docId, layerName, ref, resources } = input;
    const ctx = requireLayerAnnotationWrite(req, docId, layerName, pdfBits, protection);
    const patch = parseOrInvalidArg<AnnotationPatch>(
      AnnotationPatchSchema as unknown as SchemaLike<AnnotationPatch>,
      input.patch,
      'body.patch',
    );
    return layerService.updateAnnotation(
      ctx,
      {
        docId,
        layerName,
        ref,
        patch,
        authority: ctx.authority,
        ...(resources ? { resources } : {}),
      },
      signal,
    );
  }

  /**
   * Delete an annotation with its thread and popups. The worker checks the
   * caller's authority against each of them inside the write: all or
   * nothing.
   */
  async function deleteAnnotation(
    req: FastifyRequest,
    pdfBits: PdfBits,
    protection: DocumentProtection | null,
    input: { docId: string; layerName: string; ref: AnnotationRef },
    signal: AbortSignal,
  ): Promise<AnnotationDeleteResult> {
    const ctx = requireLayerAnnotationWrite(req, input.docId, input.layerName, pdfBits, protection);
    return layerService.deleteAnnotation(ctx, { ...input, authority: ctx.authority }, signal);
  }
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
      throw new PermissionDenied('annotations:set-group', `group=${groupId}`);
    }
  }
  return groupId;
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

async function readAnnotations(input: {
  documentService: DocumentService;
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
      kind: 'annotations.list' as const,
      effect: 'read' as const,
      jobId,
      docId: input.scope.docId,
      ...(input.scope.kind === 'layer' ? { layerName: input.scope.layerName } : {}),
      pages: [toPageRef(input.pageObjectNumber)],
    });
  const scope = input.scope;
  const result = await input.documentService.readOnPool(
    scope.ctx,
    scope.docId,
    scope.kind === 'layer' ? scope.layerName : undefined,
    build,
    input.signal,
  );
  if (result.tag !== 'annotations.list') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected ${
        input.scope.kind === 'layer' ? 'layer ' : ''
      }annotations.list payload: ${result.tag}`,
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
  return result.list;
}

/**
 * Whole-document bulk read: One `annotations.list` worker job per
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
  limits: BundleLimits;
  reply: FastifyReply;
  signal: AbortSignal;
  scope: ReadScope;
  token: AnnotationsExportToken;
  /** A GET at its token is immutable; a POST is answered uncached. */
  cache?: 'immutable' | 'no-store';
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
      effect: 'snapshot' as const,
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
  if (input.cache === 'no-store') setNoStore(input.reply);
  else setImmutableCache(input.reply);
  const { contentType, body } = buildMultipart(manifest, parts);
  input.reply.type(contentType);
  return input.reply.send(body);
}

async function readAnnotationsAll(input: {
  documentService: DocumentService;
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
        kind: 'annotations.list' as const,
        effect: 'read' as const,
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
    if (result.tag !== 'annotations.list') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected ${scope.kind === 'layer' ? 'layer ' : ''}annotations.list payload: ${
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

    input.requestedVersion === undefined ? setNoStore(input.reply) : setImmutableCache(input.reply);
    return { ...result.list, auditHead: manifest.auditHead };
  }

  throw new EngineError(
    EngineErrorCode.LayerVersionConflict,
    `${scope.kind === 'layer' ? 'layer ' : ''}annotations changed while reading; retry the request`,
  );
}
