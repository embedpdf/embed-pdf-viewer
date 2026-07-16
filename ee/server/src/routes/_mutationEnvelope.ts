import {
  EngineError,
  EngineErrorCode,
  sniffBinaryMetadata,
  type WireResourceMap,
} from '@embedpdf/engine-core/runtime';
import type { FastifyRequest } from 'fastify';

/** Hard cap on binary parts per mutation (a stamp or attachment carries exactly one). */
export const MAX_MUTATION_RESOURCES = 8;

export interface MutationEnvelope {
  body: unknown;
  resources?: WireResourceMap;
}

/**
 * Per-resource binary acceptance, decided AFTER the `body` JSON is known
 * (multipart parts may arrive in any order, so validation is deferred to
 * the end of the stream):
 *
 *   - `'image-or-pdf'` — magic-byte sniffing must identify PNG, JPEG, or
 *     PDF, and the sniffed mime type replaces whatever was declared (the
 *     stamp rule: declared types are never trusted).
 *   - `'any'` — arbitrary bytes are legal (file attachments — attaching
 *     any format is the point). The sniffed type still wins when the
 *     format is recognized; otherwise the declared part content type
 *     rides along as advisory.
 */
export type ResourceBinaryPolicy = (body: unknown, key: string) => 'image-or-pdf' | 'any';

const STRICT_POLICY: ResourceBinaryPolicy = () => 'image-or-pdf';

/**
 * Read a mutation request body in either of its two accepted forms:
 *
 *   - `application/json` — the body IS the JSON payload (unchanged fast
 *     path; `resources` stays undefined).
 *   - `multipart/form-data` — a `body` field holding that exact same JSON,
 *     plus `resource:{key}` file parts carrying binary payloads. The
 *     mirror of the appearance-render response shape.
 *
 * Binary acceptance is a per-kind policy (see {@link ResourceBinaryPolicy});
 * callers with no binary-carrying kinds keep the strict default. Oversize
 * parts are rejected by `@fastify/multipart`'s `fileSize` limit (thrown
 * from `toBuffer()`).
 */
export async function readMutationEnvelope(
  req: FastifyRequest,
  policy: ResourceBinaryPolicy = STRICT_POLICY,
): Promise<MutationEnvelope> {
  if (!req.isMultipart()) {
    return { body: req.body };
  }
  let body: unknown;
  let sawBody = false;
  const pending: Array<{
    key: string;
    bytes: ArrayBuffer;
    filename?: string;
    declaredMime?: string;
  }> = [];
  for await (const part of req.parts()) {
    if (part.type === 'field') {
      if (part.fieldname !== 'body') continue;
      try {
        body = JSON.parse(String(part.value));
        sawBody = true;
      } catch {
        throw new EngineError(EngineErrorCode.InvalidArg, `multipart 'body' part: invalid JSON`);
      }
      continue;
    }
    if (!part.fieldname.startsWith('resource:')) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `unexpected multipart file part '${part.fieldname}' (expected 'resource:{key}')`,
      );
    }
    const key = part.fieldname.slice('resource:'.length);
    if (!key) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'multipart resource part with empty key');
    }
    if (pending.length + 1 > MAX_MUTATION_RESOURCES) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `too many resource parts (max ${MAX_MUTATION_RESOURCES})`,
      );
    }
    const buf = await part.toBuffer();
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    pending.push({
      key,
      bytes,
      ...(part.filename ? { filename: part.filename } : {}),
      ...(part.mimetype ? { declaredMime: part.mimetype } : {}),
    });
  }
  if (!sawBody) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `multipart mutation requires a 'body' JSON part`,
    );
  }

  const resources: WireResourceMap = {};
  for (const { key, bytes, filename, declaredMime } of pending) {
    const meta = sniffBinaryMetadata(bytes);
    if (policy(body, key) === 'image-or-pdf') {
      if (!meta) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `resource '${key}': unsupported binary format (expected PNG, JPEG, or PDF)`,
        );
      }
      resources[key] = { bytes, mimeType: meta.mimeType, ...(filename ? { name: filename } : {}) };
    } else {
      const mimeType = meta?.mimeType ?? declaredMime;
      resources[key] = {
        bytes,
        ...(mimeType ? { mimeType } : {}),
        ...(filename ? { name: filename } : {}),
      };
    }
  }
  return {
    body,
    ...(pending.length > 0 ? { resources } : {}),
  };
}
