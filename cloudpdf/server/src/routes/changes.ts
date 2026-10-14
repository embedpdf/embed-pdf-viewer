import {
  EngineError,
  EngineErrorCode,
  type Change,
  type ChangeOp,
  type PageCoordinates,
  type WireAnnotationResources,
  type WireResourceMap,
} from '@embedpdf/engine-core/runtime';
import {
  CHANGE_REQUEST_LIMITS,
  ChangeRequestSchema,
  ChangeOpWireSchema,
  wireTemplates,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';

import { abortSignalOf, parseOrInvalidArg, setNoStore, type SchemaLike } from './_helpers';
import { assertEveryPartNamed, readMutationEnvelope } from './_mutationEnvelope';
import { requireLayerChangeWrite, requireLayerDocAccessOnly } from '../app/jwt-plugin';
import type { DocumentService } from '../services/DocumentService';
import type { RequestedChange } from '../services/layerChanges';
import type { LayerService } from '../services/LayerService';

export interface ChangeRouteDeps {
  documentService: DocumentService;
  layerService: LayerService;
}

type ChangeOpWire = z.infer<typeof ChangeOpWireSchema>;

/** A request as its schema checked it: every change holds exactly one of `ops` and `undoOf`. */
interface ChangeRequest {
  changes: ({ opId: string; ops: ChangeOpWire[] } | { opId: string; undoOf: string })[];
}

/**
 * `POST /v1/docs/:docId/layers/:layerName/changes`: user actions, each a
 * change whose ops apply in order in one transaction, all or none, or the
 * undo of an earlier change (`{ opId, undoOf }`). Each change stands on its
 * own: a refused one rolls back alone. 200 with one answer per change, in
 * order: applied with its result, or refused with its error. A change asked
 * again under its opId gets the same answer, refusals included. A 4xx refuses
 * the whole request only: authentication, a malformed body, the limits.
 *
 * A change's bytes travel as multipart `resource:{key}` parts beside a `body`
 * part holding the JSON, which names each part by its key where an op takes
 * it.
 */
export async function registerChangeRoutes(
  app: FastifyInstance,
  deps: ChangeRouteDeps,
): Promise<void> {
  const { documentService, layerService } = deps;

  app.post(wireTemplates.layerChanges, async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    const protection = await documentService.getProtection(accessCtx, docId, layerName);
    const ctx = requireLayerChangeWrite(req, docId, layerName, pdfBits, protection);
    const envelope = await readMutationEnvelope(req, changeBinaryPolicy);
    const request = parseOrInvalidArg<ChangeRequest>(
      ChangeRequestSchema as unknown as SchemaLike<ChangeRequest>,
      envelope.body,
      'request body',
    );
    const named = new Set<string>();
    const changes = request.changes.map(
      (entry): RequestedChange => ({
        opId: entry.opId,
        change:
          'undoOf' in entry
            ? { undoOf: entry.undoOf }
            : opsOf(entry.ops, envelope.resources, named),
      }),
    );
    assertEveryPartNamed(envelope, named);
    setNoStore(reply);
    const answers = await layerService.applyChanges(
      ctx,
      { docId, layerName, changes, authority: ctx.authority },
      abortSignalOf(reply),
    );
    return { changes: answers };
  });
}

/**
 * A change's ops, each with the bytes its parts carry in place of the keys
 * its `resources` name; each key used is added to `named`.
 */
function opsOf(
  ops: readonly ChangeOpWire[],
  parts: WireResourceMap | undefined,
  named: Set<string>,
): Change<PageCoordinates, WireAnnotationResources> {
  if (ops.length > CHANGE_REQUEST_LIMITS.ops) {
    throw new EngineError(
      EngineErrorCode.PayloadTooLarge,
      `a change holds at most ${CHANGE_REQUEST_LIMITS.ops} ops`,
      { details: { limit: 'ops', max: CHANGE_REQUEST_LIMITS.ops, value: ops.length } },
    );
  }
  const bytesOf = (key: string): ArrayBuffer => {
    const part = parts?.[key];
    if (!part) throw new EngineError(EngineErrorCode.InvalidArg, `no part 'resource:${key}'`);
    named.add(key);
    return part.bytes;
  };
  return {
    ops: ops.map((op): ChangeOp<PageCoordinates, WireAnnotationResources> => {
      switch (op.type) {
        case 'annotations.create':
        case 'annotations.update': {
          if (!op.resources) return op as ChangeOp<PageCoordinates, WireAnnotationResources>;
          const resources: WireAnnotationResources = {};
          if (op.resources.appearance) resources.appearance = bytesOf(op.resources.appearance);
          if (op.resources.file) resources.file = bytesOf(op.resources.file);
          return { ...op, resources } as ChangeOp<PageCoordinates, WireAnnotationResources>;
        }
        case 'forms.setSignatureAppearance': {
          const { resources, ...rest } = op;
          return { ...rest, appearance: { pdf: new Uint8Array(bytesOf(resources.appearance)) } };
        }
        default:
          return op as ChangeOp<PageCoordinates, WireAnnotationResources>;
      }
    }),
  };
}

/** A part an op takes as an attached file may hold any bytes; every other part is an image or a PDF. */
function changeBinaryPolicy(body: unknown, key: string): 'image-or-pdf' | 'any' {
  const changes = (body as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(changes)) return 'image-or-pdf';
  const asFile = changes.some(
    (entry: { ops?: { resources?: { file?: unknown } }[] }) =>
      Array.isArray(entry?.ops) && entry.ops.some((op) => op?.resources?.file === key),
  );
  return asFile ? 'any' : 'image-or-pdf';
}
