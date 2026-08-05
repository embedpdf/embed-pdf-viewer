import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  EngineError,
  EngineErrorCode,
  decodeFieldRefKey,
  type FormDataFormat,
  type FormEffect,
  type FormFieldDraft,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldValue,
  type FormWidgetRef,
} from '@embedpdf/engine-core/runtime';
import {
  FormDataFormatSchema,
  FormEffectSchema,
  FormFieldDraftSchema,
  FormFieldPatchSchema,
  FormFieldValueSchema,
  FormWidgetRefSchema,
} from '@embedpdf/engine-core/wire';
import { requireLayerCapability, requireLayerDocAccessOnly } from '../app/jwt-plugin';
import type { DocumentService } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';
import { abortSignalFromRequest, parseOrInvalidArg, setNoStore, type SchemaLike } from './_helpers';

interface FormRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
}

/** Serialized form data content types (RFC-registered Adobe types). */
const EXPORT_CONTENT_TYPE: Record<FormDataFormat, string> = {
  fdf: 'application/vnd.fdf',
  xfdf: 'application/vnd.adobe.xfdf',
};

/**
 * Layer-scoped form routes.
 *
 * Forms are DOCUMENT-scoped (one AcroForm per layer document), so unlike
 * annotations there is no per-page collection and no content-addressed
 * `@version` read URL — every response here is `no-store`. Coherence with
 * the page-scoped caches is preserved the other way around: mutation
 * results carry a real `cacheDelta` for every page whose widget
 * appearances changed, produced by the form commit's version bumps.
 *
 * Scope model (narrowing, resolver-enforced):
 *   - `doc.forms.read`   — snapshot, single field, FDF/XFDF export
 *   - `doc.forms.fill`   — value writes, reset, FDF/XFDF import
 *   - `doc.forms.modify` — field lifecycle (create/update/delete),
 *                          widget adoption (attach/detach), repair
 */
export async function registerFormRoutes(app: FastifyInstance, deps: FormRouteDeps): Promise<void> {
  const { documentService, layerService } = deps;

  app.get('/v1/docs/:docId/layers/:layerName/form', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.read', pdfBits);
    setNoStore(reply);
    return layerService.getFormSnapshot(ctx, { docId, layerName }, abortSignalFromRequest(req));
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
      abortSignalFromRequest(req),
    );
    const field = snapshot.fields.find((f) =>
      ref.kind === 'objectNumber'
        ? f.fieldObjectNumber === ref.fieldObjectNumber
        : f.name === ref.name,
    );
    if (!field) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        ref.kind === 'objectNumber'
          ? `form field not found: object ${ref.fieldObjectNumber}`
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
      abortSignalFromRequest(req),
    );
    setNoStore(reply);
    reply.type(EXPORT_CONTENT_TYPE[exported.format]);
    return reply.send(Buffer.from(exported.bytes));
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/data', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.fill', pdfBits);
    const format = formatFromQuery(req);
    const data = importBodyBytes(req);
    setNoStore(reply);
    return layerService.importFormData(
      ctx,
      { docId, layerName, data, ...(format ? { format } : {}) },
      abortSignalFromRequest(req),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/repair', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.modify', pdfBits);
    const body = (req.body ?? {}) as { bakeAppearances?: unknown };
    if (body.bakeAppearances !== undefined && typeof body.bakeAppearances !== 'boolean') {
      throw new EngineError(EngineErrorCode.InvalidArg, 'body.bakeAppearances: expected boolean');
    }
    setNoStore(reply);
    return layerService.repairForm(
      ctx,
      { docId, layerName, bakeAppearances: body.bakeAppearances ?? false },
      abortSignalFromRequest(req),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/fields', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.modify', pdfBits);
    const draft = parseOrInvalidArg<FormFieldDraft>(
      FormFieldDraftSchema as unknown as SchemaLike<FormFieldDraft>,
      req.body,
      'request body',
    );
    setNoStore(reply);
    return layerService.createFormField(
      ctx,
      { docId, layerName, draft },
      abortSignalFromRequest(req),
    );
  });

  app.patch('/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const ref = fieldRefFromParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.modify', pdfBits);
    const patch = parseOrInvalidArg<FormFieldPatch>(
      FormFieldPatchSchema as unknown as SchemaLike<FormFieldPatch>,
      req.body,
      'request body',
    );
    setNoStore(reply);
    return layerService.updateFormField(
      ctx,
      { docId, layerName, ref, patch },
      abortSignalFromRequest(req),
    );
  });

  app.delete('/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const ref = fieldRefFromParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.modify', pdfBits);
    setNoStore(reply);
    return layerService.deleteFormField(
      ctx,
      { docId, layerName, ref },
      abortSignalFromRequest(req),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/value', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const ref = fieldRefFromParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.fill', pdfBits);
    const body = (req.body ?? {}) as { value?: unknown };
    const value = parseOrInvalidArg<FormFieldValue>(
      FormFieldValueSchema as unknown as SchemaLike<FormFieldValue>,
      body.value,
      'body.value',
    );
    setNoStore(reply);
    return layerService.setFormValue(
      ctx,
      { docId, layerName, ref, value },
      abortSignalFromRequest(req),
    );
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/reset', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const ref = fieldRefFromParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.fill', pdfBits);
    setNoStore(reply);
    return layerService.resetFormField(ctx, { docId, layerName, ref }, abortSignalFromRequest(req));
  });

  app.post('/v1/docs/:docId/layers/:layerName/form/effects', async (req, reply) => {
    const { docId, layerName } = layerParams(req);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.fill', pdfBits);
    const body = (req.body ?? {}) as { effects?: unknown };
    const effects = parseOrInvalidArg<FormEffect[]>(
      FormEffectSchema.array() as unknown as SchemaLike<FormEffect[]>,
      body.effects,
      'body.effects',
    );
    setNoStore(reply);
    return layerService.applyFormEffects(
      ctx,
      { docId, layerName, effects },
      abortSignalFromRequest(req),
    );
  });

  app.post(
    '/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/widgets',
    async (req, reply) => {
      const { docId, layerName } = layerParams(req);
      const ref = fieldRefFromParams(req);
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.modify', pdfBits);
      const body = (req.body ?? {}) as { widget?: unknown; onState?: unknown };
      const widget = parseOrInvalidArg<FormWidgetRef>(
        FormWidgetRefSchema as unknown as SchemaLike<FormWidgetRef>,
        body.widget,
        'body.widget',
      );
      if (body.onState !== undefined && typeof body.onState !== 'string') {
        throw new EngineError(EngineErrorCode.InvalidArg, 'body.onState: expected string');
      }
      setNoStore(reply);
      return layerService.attachFormWidget(
        ctx,
        { docId, layerName, ref, widget, ...(body.onState ? { onState: body.onState } : {}) },
        abortSignalFromRequest(req),
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
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.forms.modify', pdfBits);
      const body = (req.body ?? {}) as { widget?: unknown };
      const widget = parseOrInvalidArg<FormWidgetRef>(
        FormWidgetRefSchema as unknown as SchemaLike<FormWidgetRef>,
        body.widget,
        'body.widget',
      );
      setNoStore(reply);
      return layerService.detachFormWidget(
        ctx,
        { docId, layerName, ref, widget },
        abortSignalFromRequest(req),
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
