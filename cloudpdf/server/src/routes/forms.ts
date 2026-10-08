import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  EngineError,
  EngineErrorCode,
  decodeAnnotKey,
  decodeFieldRefKey,
  toPageRef,
  wirePack,
  type FormDataFormat,
  type FormEffect,
  type FormFieldDraft,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldValue,
  type AnnotationPosition,
  type AnnotationRef,
  type FormSnapshot,
  type WidgetPatch,
  type WidgetPlacement,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import {
  FormDataFormatSchema,
  FormEffectSchema,
  FormFieldDraftSchema,
  FormFieldPatchSchema,
  FormFieldValueSchema,
  FormResetBodySchema,
  AnnotationRefSchema,
  SignatureAppearanceBodySchema,
  FormWidgetUpdateBodySchema,
  FormWidgetsReorderBodySchema,
  WidgetPlacementSchema,
  decodeFormToken,
  decodeWidgetAppearancesRenderToken,
} from '@embedpdf/engine-core/wire';
import {
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerResource,
} from '../app/jwt-plugin';
import type { SharpImageEncoder } from '../render/SharpImageEncoder';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';
import { renderAppearanceBatch, type ReadScope } from './_appearanceBatch';
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
import { readMutationEnvelope } from './_mutationEnvelope';
import { requireSharedDocRead } from './_planeGuard';

interface FormRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
  imageEncoder: SharpImageEncoder;
  /** Encode appearance renders in the engine worker by default. */
  encodeInEngine?: boolean;
  /** Render-lattice policy plane (absent = legacy compute-only). */
  derivedRenders?: DerivedRenderService;
}

/** Serialized form data content types (RFC-registered Adobe types). */
const EXPORT_CONTENT_TYPE: Record<FormDataFormat, string> = {
  fdf: 'application/vnd.fdf',
  xfdf: 'application/vnd.adobe.xfdf',
};

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
 *   - `doc.forms.read`   — snapshot, single field, FDF/XFDF export
 *   - `doc.forms.fill`   — value writes, reset, FDF/XFDF import
 *   - `doc.forms.modify` — field lifecycle (create/update/delete),
 *                          widget adoption (attach/detach), repair
 */
export async function registerFormRoutes(app: FastifyInstance, deps: FormRouteDeps): Promise<void> {
  const { documentService, layerService, imageEncoder, derivedRenders } = deps;
  const encodeInEngine = deps.encodeInEngine ?? true;

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
      setNoStore(reply);
      return layerService.updateFormWidget(
        ctx,
        { docId, layerName, widget, patch },
        abortSignalOf(reply),
      );
    },
  );

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
      return layerService.deleteFormWidget(
        ctx,
        { docId, layerName, widget },
        abortSignalOf(reply),
      );
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

  app.get('/v1/docs/:docId/layers/:layerName/form/data', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.read', pdfBits);
    const format = formatFromQuery(req) ?? 'xfdf';
    const exported = await layerService.exportFormData(
      ctx,
      { docId, layerName, format },
      abortSignalOf(reply),
    );
    setNoStore(reply);
    reply.type(EXPORT_CONTENT_TYPE[exported.format]);
    return reply.send(Buffer.from(exported.bytes));
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/data', async (req, reply) => {
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
    const format = formatFromQuery(req);
    const data = importBodyBytes(req);
    setNoStore(reply);
    return layerService.importFormData(
      ctx,
      { docId, layerName, data, ...(format ? { format } : {}) },
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
    setNoStore(reply);
    return layerService.updateFormField(
      ctx,
      { docId, layerName, ref, patch },
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
    const ctx = requireLayerCapability(
      req,
      docId,
      layerName,
      'doc.forms.fill',
      pdfBits,
      protection,
    );
    const body = (req.body ?? {}) as { value?: unknown };
    const value = parseOrInvalidArg<FormFieldValue>(
      FormFieldValueSchema as unknown as SchemaLike<FormFieldValue>,
      body.value,
      'body.value',
    );
    setNoStore(reply);
    return layerService.setFormValue(ctx, { docId, layerName, ref, value }, abortSignalOf(reply));
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/reset', async (req, reply) => {
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
    const body = parseOrInvalidArg<{ refs?: FormFieldRef[] }>(
      FormResetBodySchema as unknown as SchemaLike<{ refs?: FormFieldRef[] }>,
      req.body ?? {},
      'body',
    );
    setNoStore(reply);
    return layerService.resetForm(
      ctx,
      { docId, layerName, ...(body.refs ? { refs: body.refs } : {}) },
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
      const ctx = requireLayerCapability(
        req,
        docId,
        layerName,
        'doc.forms.fill',
        pdfBits,
        protection,
      );
      const ref = fieldRefFromParams(req);
      // The mark is a page of a PDF (sniffed, never declared), riding the multipart envelope.
      const { body, resources } = await readMutationEnvelope(req, () => 'image-or-pdf');
      const parsed = parseOrInvalidArg(
        SignatureAppearanceBodySchema as unknown as SchemaLike<
          ReturnType<typeof SignatureAppearanceBodySchema.parse>
        >,
        body,
        'request body',
      );
      const resource = resources?.[parsed.resource];
      if (!resource) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `body references resource '${parsed.resource}' but no such multipart part arrived`,
        );
      }
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

function formatFromQuery(req: FastifyRequest): FormDataFormat | undefined {
  const { format } = (req.query ?? {}) as { format?: unknown };
  if (format === undefined) return undefined;
  return parseOrInvalidArg<FormDataFormat>(
    FormDataFormatSchema as unknown as SchemaLike<FormDataFormat>,
    format,
    'query.format',
  );
}

/**
 * The import body arrives as a Buffer (via the binary content-type
 * parsers). Copy into a standalone ArrayBuffer: Node Buffers are views
 * over a shared pool, and the bytes get transferred to the worker.
 */
function importBodyBytes(req: FastifyRequest): ArrayBuffer {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.byteLength === 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'expected a non-empty binary FDF/XFDF request body',
    );
  }
  return new Uint8Array(body).slice().buffer;
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
