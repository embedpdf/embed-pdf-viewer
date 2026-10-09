import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  allowsFieldWrite,
  DEFAULT_BUNDLE_LIMITS,
  EngineError,
  EngineErrorCode,
  decodeAnnotKey,
  decodeFieldRefKey,
  toPageRef,
  draftWritesScripts,
  PermissionDenied,
  wirePack,
  writesScripts,
  type BundleLimits,
  type FieldPosition,
  type FormEffect,
  type FormFieldDraft,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldValue,
  type FormImportBody,
  type FormValuesImportBody,
  type AnnotationPosition,
  type AnnotationRef,
  type FormSnapshot,
  type WidgetPatch,
  type WidgetPlacement,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import {
  FormEffectSchema,
  FormExportRequestSchema,
  FormFieldDraftSchema,
  FormFieldPatchSchema,
  FormFieldValueSchema,
  FormImportBodySchema,
  FormResetBodySchema,
  FormValuesImportBodySchema,
  AnnotationRefSchema,
  SignatureAppearanceBodySchema,
  FormWidgetUpdateBodySchema,
  FormWidgetsReorderBodySchema,
  FormCalculationsReorderBodySchema,
  WidgetPlacementSchema,
  decodeFormExportToken,
  decodeFormToken,
  decodeWidgetAppearancesRenderToken,
  type FormExportToken,
} from '@embedpdf/engine-core/wire';
import {
  changeAuthorityOf,
  holdsCapability,
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerFieldWrite,
  requireLayerResource,
} from '../app/jwt-plugin';
import type { SharpImageEncoder } from '../render/SharpImageEncoder';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';
import { renderAppearanceBatch, type ReadScope } from './_appearanceBatch';
import { sendBundle } from './_bundleExportResponse';
import { readBundleImportRequest } from './_bundleImportRequest';
import {
  abortSignalOf,
  objectNumberQuery,
  objectNumbersQuery,
  parseOrInvalidArg,
  parseTokenOrInvalidArg,
  resolvePageKeyParam,
  setImmutableCache,
  setNoStore,
  type SchemaLike,
} from './_helpers';
import { readMutationEnvelope, resourcesByRole } from './_mutationEnvelope';
import { requireSharedDocRead } from './_planeGuard';

interface FormRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
  imageEncoder: SharpImageEncoder;
  /** Encode appearance renders in the engine worker by default. */
  encodeInEngine?: boolean;
  /** Render-lattice policy plane (absent = legacy compute-only). */
  derivedRenders?: DerivedRenderService;
  /** How large an exported or imported form bundle may be; the defaults otherwise. */
  bundleLimits?: BundleLimits;
}

/**
 * Form routes.
 *
 * The form is its own read family, apart from the annotations: who may read
 * the form isn't who may read the annotations, and a cached object is never
 * filtered per row. `form@{formsVersion}` holds the fields and every widget
 * row (`doc.forms.list()`), and `form/pages/{p}/appearances@{widgetVersion}`
 * a page's widget images; each has a base twin, served from the base
 * session while a layer inherits the `forms` plane. The unversioned layer
 * routes stay for API callers, `no-store`. Mutation results carry a real
 * `cacheDelta` for every page whose widgets changed, produced by the form
 * commit's version bumps.
 *
 * Scope model (narrowing, resolver-enforced):
 *   - `doc.forms.read`   — snapshot, single field; export with `doc.download`
 *   - `doc.forms.fill`   — value writes, reset, values import
 *   - `doc.forms.modify` — field lifecycle (create/update/delete),
 *                          widget adoption (attach/detach), design import,
 *                          repair
 *   - `doc.forms.import` — beside either import, to restore who made and
 *                          filled the fields
 */
export async function registerFormRoutes(app: FastifyInstance, deps: FormRouteDeps): Promise<void> {
  const { documentService, layerService, imageEncoder, derivedRenders } = deps;
  const encodeInEngine = deps.encodeInEngine ?? true;
  const bundleLimits = deps.bundleLimits ?? DEFAULT_BUNDLE_LIMITS;

  app.get('/v1/docs/:docId/form@:token', async (req, reply) => {
    const { docId, token } = req.params as { docId: string; token: string };
    const ctx = await requireSharedDocRead(req, documentService, docId, 'form', ['forms']);
    return readForm({
      documentService,
      reply,
      signal: abortSignalOf(reply),
      scope: { kind: 'base', ctx, docId },
      requestedVersion: parseTokenOrInvalidArg(decodeFormToken, token, 'formsVersion token'),
    });
  });

  app.get('/v1/docs/:docId/layers/:layerName/form@:token', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const { token } = req.params as { token: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-form', pdfBits);
    return readForm({
      documentService,
      reply,
      signal: abortSignalOf(reply),
      scope: { kind: 'layer', ctx, docId, layerName },
      requestedVersion: parseTokenOrInvalidArg(decodeFormToken, token, 'formsVersion token'),
    });
  });

  // A page's widget images, every mode and state: the form's twin of the
  // annotation appearance batch, keyed by the page's `widgetVersion`.
  // `compress: false` keeps the binary multipart body un-gzipped end to end.
  const renderWidgets = (
    reply: FastifyReply,
    scope: ReadScope,
    pageKey: string,
    query: unknown,
    token?: string,
  ) =>
    renderAppearanceBatch({
      family: 'widgets',
      documentService,
      imageEncoder,
      encodeInEngine,
      ...(derivedRenders ? { derivedRenders } : {}),
      reply,
      signal: abortSignalOf(reply),
      scope,
      pageObjectNumber: resolvePageKeyParam(pageKey),
      ...(token !== undefined
        ? {
            tokenQuery: parseTokenOrInvalidArg(
              decodeWidgetAppearancesRenderToken,
              token,
              'appearance render token',
            ),
          }
        : {}),
      query,
    });

  app.get(
    '/v1/docs/:docId/form/pages/:pageKey/appearances@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, pageKey, token } = req.params as {
        docId: string;
        pageKey: string;
        token: string;
      };
      const ctx = await requireSharedDocRead(req, documentService, docId, 'page-form', ['forms']);
      return renderWidgets(reply, { kind: 'base', ctx, docId }, pageKey, req.query, token);
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/form/pages/:pageKey/appearances@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const { pageKey, token } = req.params as { pageKey: string; token: string };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-page-form', pdfBits);
      return renderWidgets(
        reply,
        { kind: 'layer', ctx, docId, layerName },
        pageKey,
        req.query,
        token,
      );
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/form/pages/:pageKey/appearances',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const { pageKey } = req.params as { pageKey: string };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-page-form', pdfBits);
      return renderWidgets(reply, { kind: 'layer', ctx, docId, layerName }, pageKey, req.query);
    },
  );

  // A widget's place and look: a form write (`doc.forms.updateWidget`).
  app.patch(
    '/v1/docs/:docId/layers/:layerName/form/widgets/:pageKey/:annotKey',
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const { pageKey, annotKey } = req.params as { pageKey: string; annotKey: string };
      const widget = decodeAnnotKey(
        { kind: 'objectNumber', objectNumber: resolvePageKeyParam(pageKey) },
        annotKey,
      );
      if (!widget) {
        throw new EngineError(EngineErrorCode.InvalidArg, `malformed widget key: ${annotKey}`);
      }
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(
        req,
        docId,
        layerName,
        'doc.forms.modify',
        pdfBits,
        protection,
      );
      const { patch } = parseOrInvalidArg<{ patch: WidgetPatch }>(
        FormWidgetUpdateBodySchema as unknown as SchemaLike<{ patch: WidgetPatch }>,
        req.body ?? {},
        'body',
      );
      // An action that runs a script, submits or links takes doc.forms.script too.
      if (writesScripts(patch.actions)) {
        requireLayerCapability(req, docId, layerName, 'doc.forms.script', pdfBits, protection);
      }
      setNoStore(reply);
      return layerService.updateFormWidget(
        ctx,
        { docId, layerName, widget, patch },
        abortSignalOf(reply),
      );
    },
  );

  // The form's calculation order: a form write (`doc.forms.reorderCalculations`).
  app.post('/v1/docs/:docId/layers/:layerName/form/calculations/reorder', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(
      req,
      docId,
      layerName,
      'doc.forms.modify',
      pdfBits,
      protection,
    );
    const { fields, position } = parseOrInvalidArg<{
      fields: FormFieldRef[];
      position: FieldPosition;
    }>(
      FormCalculationsReorderBodySchema as unknown as SchemaLike<{
        fields: FormFieldRef[];
        position: FieldPosition;
      }>,
      req.body ?? {},
      'body',
    );
    setNoStore(reply);
    return layerService.reorderFormCalculations(
      ctx,
      { docId, layerName, fields, position },
      abortSignalOf(reply),
    );
  });

  // The widgets' stacking order on a page: a form write (`doc.forms.reorderWidgets`).
  app.post(
    '/v1/docs/:docId/layers/:layerName/form/widgets/:pageKey/reorder',
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const { pageKey } = req.params as { pageKey: string };
      const page = toPageRef(resolvePageKeyParam(pageKey));
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(
        req,
        docId,
        layerName,
        'doc.forms.modify',
        pdfBits,
        protection,
      );
      const { widgets, position } = parseOrInvalidArg<{
        widgets: AnnotationRef[];
        position: AnnotationPosition;
      }>(
        FormWidgetsReorderBodySchema as unknown as SchemaLike<{
          widgets: AnnotationRef[];
          position: AnnotationPosition;
        }>,
        req.body ?? {},
        'body',
      );
      setNoStore(reply);
      return layerService.reorderFormWidgets(
        ctx,
        { docId, layerName, page, widgets, position },
        abortSignalOf(reply),
      );
    },
  );

  // A widget leaves its page and its field: a form write (`doc.forms.deleteWidget`).
  app.delete(
    '/v1/docs/:docId/layers/:layerName/form/widgets/:pageKey/:annotKey',
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const { pageKey, annotKey } = req.params as { pageKey: string; annotKey: string };
      const widget = decodeAnnotKey(
        { kind: 'objectNumber', objectNumber: resolvePageKeyParam(pageKey) },
        annotKey,
      );
      if (!widget) {
        throw new EngineError(EngineErrorCode.InvalidArg, `malformed widget key: ${annotKey}`);
      }
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(
        req,
        docId,
        layerName,
        'doc.forms.modify',
        pdfBits,
        protection,
      );
      setNoStore(reply);
      return layerService.deleteFormWidget(ctx, { docId, layerName, widget }, abortSignalOf(reply));
    },
  );

  app.get('/v1/docs/:docId/layers/:layerName/form', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.read', pdfBits);
    setNoStore(reply);
    return layerService.getFormSnapshot(ctx, { docId, layerName }, abortSignalOf(reply));
  });

  app.get('/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const ref = fieldRefFromParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.read', pdfBits);
    const snapshot = await layerService.getFormSnapshot(
      ctx,
      { docId, layerName },
      abortSignalOf(reply),
    );
    const field = snapshot.fields.find((f) =>
      ref.kind === 'objectNumber'
        ? f.ref.kind === 'objectNumber' && f.ref.objectNumber === ref.objectNumber
        : f.name === ref.name,
    );
    if (!field) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        ref.kind === 'objectNumber'
          ? `form field not found: object ${ref.objectNumber}`
          : `form field not found: "${ref.name}"`,
      );
    }
    setNoStore(reply);
    return field;
  });

  // ── Form export: whole fields with their widgets as a bundle, multipart,
  //    at a form and a layout pin (the bundle carries its pages' positions
  //    and boxes). It egresses content, so it needs `doc.download` beside
  //    the form read. Immutable per token, so the CDN can cache it; the
  //    doc-level twin serves layers that inherit both planes. ─

  app.get(
    '/v1/docs/:docId/form/export@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, token } = req.params as { docId: string; token: string };
      const ctx = await requireSharedDocRead(req, documentService, docId, 'form-export', [
        'forms',
        'layout',
      ]);
      return exportForm({
        documentService,
        limits: bundleLimits,
        reply,
        signal: abortSignalOf(reply),
        scope: { kind: 'base', ctx, docId },
        token: parseTokenOrInvalidArg(decodeFormExportToken, token, 'form export token'),
      });
    },
  );

  app.get(
    '/v1/docs/:docId/layers/:layerName/form/export@:token',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const { token } = req.params as { token: string };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-form-export', pdfBits);
      return exportForm({
        documentService,
        limits: bundleLimits,
        reply,
        signal: abortSignalOf(reply),
        scope: { kind: 'layer', ctx, docId, layerName },
        token: parseTokenOrInvalidArg(decodeFormExportToken, token, 'form export token'),
      });
    },
  );

  // An export whose selection a URL can't carry (a long field list): the
  // same pins and the selection in the body, answered uncached.
  app.post(
    '/v1/docs/:docId/layers/:layerName/form/export',
    { config: { compress: false } },
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerResource(req, docId, layerName, 'layer-form-export', pdfBits);
      const request = parseOrInvalidArg<FormExportToken>(
        FormExportRequestSchema as unknown as SchemaLike<FormExportToken>,
        req.body,
        'request body',
      );
      return exportForm({
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

  // A bundle's fields, copied in as one change. The parts stream in under
  // the bundle limits; the `Idempotency-Key` header names the import, so a
  // retry returns what the first request committed.
  app.post('/v1/docs/:docId/layers/:layerName/form/import', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const { body, resources } = await readBundleImportRequest(req, bundleLimits, {
      kind: 'form',
      bodySchema: FormImportBodySchema as unknown as SchemaLike<FormImportBody>,
    });
    const attribution = body.options.attribution ?? 'restore';
    const ctx = requireLayerCapability(
      req,
      docId,
      layerName,
      'doc.forms.modify',
      pdfBits,
      protection,
    );
    // Restoring writes attribution that isn't the caller's.
    if (attribution === 'restore') {
      requireLayerCapability(req, docId, layerName, 'doc.forms.import', pdfBits, protection);
    }
    setNoStore(reply);
    return layerService.importForm(
      ctx,
      {
        docId,
        layerName,
        bundle: { ...body.bundle, resources },
        ...(body.options.pages !== undefined ? { pages: body.options.pages } : {}),
        attribution,
        values: body.options.values ?? true,
        // Without it, scripts, submits and links are left out, not refused.
        mayScript: holdsCapability(ctx, 'doc.forms.script', pdfBits, protection),
        limits: bundleLimits,
        authority: changeAuthorityOf(ctx, pdfBits, protection),
      },
      abortSignalOf(reply),
    );
  });

  // A bundle's values, filled into the fields of the same name as one
  // change, named by its `Idempotency-Key` as the design import is.
  app.post('/v1/docs/:docId/layers/:layerName/form/import-values', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const { body, resources } = await readBundleImportRequest(req, bundleLimits, {
      kind: 'form',
      bodySchema: FormValuesImportBodySchema as unknown as SchemaLike<FormValuesImportBody>,
    });
    const attribution = body.options.attribution ?? 'restore';
    // A field the token may not fill is left out (`fill-not-allowed`), checked in the write.
    const ctx = requireLayerFieldWrite(req, docId, layerName, 'fill', pdfBits, protection);
    // Restoring writes attribution that isn't the caller's.
    if (attribution === 'restore') {
      requireLayerCapability(req, docId, layerName, 'doc.forms.import', pdfBits, protection);
    }
    setNoStore(reply);
    return layerService.importFormValues(
      ctx,
      {
        docId,
        layerName,
        bundle: { ...body.bundle, resources },
        attribution,
        limits: bundleLimits,
        authority: ctx.authority,
      },
      abortSignalOf(reply),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/repair', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(
      req,
      docId,
      layerName,
      'doc.forms.modify',
      pdfBits,
      protection,
    );
    const body = (req.body ?? {}) as { bakeAppearances?: unknown };
    if (body.bakeAppearances !== undefined && typeof body.bakeAppearances !== 'boolean') {
      throw new EngineError(EngineErrorCode.InvalidArg, 'body.bakeAppearances: expected boolean');
    }
    setNoStore(reply);
    return layerService.repairForm(
      ctx,
      { docId, layerName, bakeAppearances: body.bakeAppearances ?? false },
      abortSignalOf(reply),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/fields', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(
      req,
      docId,
      layerName,
      'doc.forms.modify',
      pdfBits,
      protection,
    );
    const draft = parseOrInvalidArg<FormFieldDraft>(
      FormFieldDraftSchema as unknown as SchemaLike<FormFieldDraft>,
      req.body,
      'request body',
    );
    // Writing a script, the field's or a widget's, takes doc.forms.script too.
    if (draftWritesScripts(draft)) {
      requireLayerCapability(req, docId, layerName, 'doc.forms.script', pdfBits, protection);
    }
    const objectNumber = objectNumberQuery(req.query, 'objectNumber');
    const widgetObjectNumbers = objectNumbersQuery(req.query, 'widgetObjectNumbers');
    setNoStore(reply);
    return layerService.createFormField(
      ctx,
      {
        docId,
        layerName,
        draft,
        ...(objectNumber !== undefined ? { objectNumber } : {}),
        ...(widgetObjectNumbers ? { widgetObjectNumbers } : {}),
        // Which group the field may go in is checked in the write.
        authority: changeAuthorityOf(ctx, pdfBits, protection),
      },
      abortSignalOf(reply),
    );
  });

  app.patch('/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const ref = fieldRefFromParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(
      req,
      docId,
      layerName,
      'doc.forms.modify',
      pdfBits,
      protection,
    );
    const patch = parseOrInvalidArg<FormFieldPatch>(
      FormFieldPatchSchema as unknown as SchemaLike<FormFieldPatch>,
      req.body,
      'request body',
    );
    // Writing a script takes doc.forms.script too; removing one doesn't.
    if (writesScripts(patch.actions)) {
      requireLayerCapability(req, docId, layerName, 'doc.forms.script', pdfBits, protection);
    }
    setNoStore(reply);
    return layerService.updateFormField(
      ctx,
      { docId, layerName, ref, patch, authority: changeAuthorityOf(ctx, pdfBits, protection) },
      abortSignalOf(reply),
    );
  });

  app.delete('/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const ref = fieldRefFromParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(
      req,
      docId,
      layerName,
      'doc.forms.modify',
      pdfBits,
      protection,
    );
    setNoStore(reply);
    return layerService.deleteFormField(ctx, { docId, layerName, ref }, abortSignalOf(reply));
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/value', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const ref = fieldRefFromParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    // Whether this field is the token's to fill (its group) is checked in the write.
    const ctx = requireLayerFieldWrite(req, docId, layerName, 'fill', pdfBits, protection);
    const body = (req.body ?? {}) as { value?: unknown };
    const value = parseOrInvalidArg<FormFieldValue>(
      FormFieldValueSchema as unknown as SchemaLike<FormFieldValue>,
      body.value,
      'body.value',
    );
    setNoStore(reply);
    return layerService.setFormValue(
      ctx,
      { docId, layerName, ref, value, authority: ctx.authority },
      abortSignalOf(reply),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/reset', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    // Each field it resets must be the token's to fill, checked in the write.
    const ctx = requireLayerFieldWrite(req, docId, layerName, 'fill', pdfBits, protection);
    const body = parseOrInvalidArg<{ refs?: FormFieldRef[] }>(
      FormResetBodySchema as unknown as SchemaLike<{ refs?: FormFieldRef[] }>,
      req.body ?? {},
      'body',
    );
    setNoStore(reply);
    return layerService.resetForm(
      ctx,
      { docId, layerName, ...(body.refs ? { refs: body.refs } : {}), authority: ctx.authority },
      abortSignalOf(reply),
    );
  });

  app.post(
    '/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/signature-appearance',
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      // A signature's look is signing: the field must be the token's to sign, checked in the write.
      const ctx = requireLayerFieldWrite(req, docId, layerName, 'sign', pdfBits, protection);
      const ref = fieldRefFromParams(req);
      // The mark is a page of a PDF (sniffed, never declared), riding the multipart envelope.
      const envelope = await readMutationEnvelope(req, () => 'image-or-pdf');
      const parsed = parseOrInvalidArg(
        SignatureAppearanceBodySchema as unknown as SchemaLike<
          ReturnType<typeof SignatureAppearanceBodySchema.parse>
        >,
        envelope.body,
        'request body',
      );
      const resource = resourcesByRole(envelope, parsed.resources).appearance!;
      if (resource.mimeType !== 'application/pdf') {
        throw new EngineError(EngineErrorCode.InvalidArg, 'the appearance resource must be a PDF');
      }
      setNoStore(reply);
      return layerService.setSignatureAppearance(
        ctx,
        {
          docId,
          layerName,
          ref,
          pdf: new Uint8Array(resource.bytes),
          authority: ctx.authority,
        },
        abortSignalOf(reply),
      );
    },
  );

  app.post('/v1/docs/:docId/layers/:layerName/form/effects', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(
      req,
      docId,
      layerName,
      'doc.forms.fill',
      pdfBits,
      protection,
    );
    // The effects aren't checked field by field: they take a filler no `fields:fill` scope narrows.
    if (!allowsFieldWrite(changeAuthorityOf(ctx, pdfBits, protection), null, 'fill')) {
      throw new PermissionDenied('doc.forms.fill', 'target');
    }
    const body = (req.body ?? {}) as { effects?: unknown };
    const effects = parseOrInvalidArg<FormEffect[]>(
      FormEffectSchema.array() as unknown as SchemaLike<FormEffect[]>,
      body.effects,
      'body.effects',
    );
    setNoStore(reply);
    return layerService.applyFormEffects(ctx, { docId, layerName, effects }, abortSignalOf(reply));
  });

  app.post(
    '/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/widgets',
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const ref = fieldRefFromParams(req);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(
        req,
        docId,
        layerName,
        'doc.forms.modify',
        pdfBits,
        protection,
      );
      const placement = parseOrInvalidArg<WidgetPlacement>(
        WidgetPlacementSchema as unknown as SchemaLike<WidgetPlacement>,
        req.body,
        'body',
      );
      // An action that runs a script, submits or links takes doc.forms.script too.
      if (writesScripts(placement.actions)) {
        requireLayerCapability(req, docId, layerName, 'doc.forms.script', pdfBits, protection);
      }
      const objectNumber = objectNumberQuery(req.query, 'objectNumber');
      const splitObjectNumber = objectNumberQuery(req.query, 'splitObjectNumber');
      setNoStore(reply);
      return layerService.addFormWidget(
        ctx,
        {
          docId,
          layerName,
          ref,
          placement,
          ...(objectNumber !== undefined ? { objectNumber } : {}),
          ...(splitObjectNumber !== undefined ? { splitObjectNumber } : {}),
        },
        abortSignalOf(reply),
      );
    },
  );

  app.post(
    '/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/widgets/detach',
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const ref = fieldRefFromParams(req);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const protection = await documentService.getProtection(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(
        req,
        docId,
        layerName,
        'doc.forms.modify',
        pdfBits,
        protection,
      );
      const body = (req.body ?? {}) as { widget?: unknown };
      const widget = parseOrInvalidArg<AnnotationRef>(
        AnnotationRefSchema as unknown as SchemaLike<AnnotationRef>,
        body.widget,
        'body.widget',
      );
      setNoStore(reply);
      return layerService.detachFormWidget(
        ctx,
        { docId, layerName, ref, widget },
        abortSignalOf(reply),
      );
    },
  );
}

function layerParams(req: FastifyRequest): { docId: string; layerName: string } {
  const { docId, layerName } = req.params as { docId: string; layerName: string };
  return { docId, layerName };
}

/** Decode `:fieldKey` (`obj:12` / `fqn:billing.name`) into a `FormFieldRef`. */
function fieldRefFromParams(req: FastifyRequest): FormFieldRef {
  const { fieldKey } = req.params as { fieldKey: string };
  const ref = decodeFieldRefKey(fieldKey);
  if (!ref) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `fieldKey '${fieldKey}' is not a valid field key (expected 'obj:N' or 'fqn:NAME')`,
    );
  }
  return ref;
}

/**
 * The form at a pinned `formsVersion` (immutable, CDN-cacheable), read on
 * the base session or the layer's. The pin is checked before and after the
 * worker read, so a write that landed in between is a 404 into the client's
 * manifest refresh, never a body filed under the wrong pin.
 */
async function readForm(input: {
  documentService: DocumentService;
  reply: FastifyReply;
  signal: AbortSignal;
  scope: ReadScope;
  requestedVersion: number;
}): Promise<FormSnapshot> {
  const { scope } = input;
  const getManifest = () =>
    scope.kind === 'layer'
      ? input.documentService.getLayerManifest(scope.ctx, scope.docId, scope.layerName)
      : input.documentService.getManifest(scope.ctx, scope.docId);
  const assertCurrent = (current: number) => {
    if (input.requestedVersion === current) return;
    setNoStore(input.reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `${scope.kind === 'layer' ? 'layer ' : ''}forms version ${input.requestedVersion} no longer current (current=${current})`,
    );
  };

  assertCurrent((await getManifest()).formsVersion);
  if (scope.kind === 'layer') {
    await input.documentService.ensureLayerOnPool(scope.ctx, scope.docId, scope.layerName);
  }
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'forms.list' as const,
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
  if (result.tag !== 'forms.list') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected forms.list payload: ${result.tag}`,
    );
  }
  assertCurrent((await getManifest()).formsVersion);
  setImmutableCache(input.reply);
  return result.snapshot;
}

/**
 * One export job at the token's pins, checked before and after the job so an
 * immutable body never belongs to another version: a stale pin is a 404 the
 * client answers by refreshing its manifest. The response is the bundle as
 * `sendBundle` writes it.
 */
async function exportForm(input: {
  documentService: DocumentService;
  limits: BundleLimits;
  reply: FastifyReply;
  signal: AbortSignal;
  scope: ReadScope;
  token: FormExportToken;
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
    const layoutVersion = manifest.layoutVersion ?? 1;
    if (token.formsVersion !== manifest.formsVersion || token.layoutVersion !== layoutVersion) {
      setNoStore(input.reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `form export at formsVersion ${token.formsVersion}, layoutVersion ${token.layoutVersion} no longer current (current: ${manifest.formsVersion}, ${layoutVersion})`,
      );
    }
  };

  await assertCurrent();
  if (layerName !== undefined) {
    await input.documentService.ensureLayerOnPool(scope.ctx, scope.docId, layerName);
  }
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'forms.export' as const,
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
  if (result.tag !== 'forms.export') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected forms.export payload: ${result.tag}`,
    );
  }
  await assertCurrent();
  return sendBundle(input.reply, result.bundle, input.cache ?? 'immutable');
}
