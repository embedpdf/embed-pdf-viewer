import { Buffer } from 'node:buffer';

import {
  EngineError,
  EngineErrorCode,
  type BundleKind,
  type BundleLimits,
  type ResourceId,
} from '@embedpdf/engine-core/runtime';
import type { FastifyRequest } from 'fastify';

import { parseOrInvalidArg, type SchemaLike } from './_helpers';

export interface BundleImportRequest<Body> {
  body: Body;
  /** Each resource's bytes, by the id its part is named for. */
  resources: Record<ResourceId, ArrayBuffer>;
}

/**
 * Read a bundle import, either family's, `multipart/form-data`: a `body`
 * part (the bundle without its bytes, and the options), checked against
 * `bodySchema`, and one `resource:<id>` part per resource. The limits hold
 * while the parts stream in, so a request past one is stopped before the
 * rest of it is read, with `PayloadTooLarge` naming the limit: the body's
 * size, each resource's size, how many resources, and the bundle's bytes
 * counted across every part. That the bundle's rows and the parts name
 * each other, and each resource matches its id, is the worker's check,
 * with the rest of the bundle's.
 */
export async function readBundleImportRequest<Body>(
  req: FastifyRequest,
  limits: BundleLimits,
  bundle: { readonly kind: BundleKind; readonly bodySchema: SchemaLike<Body> },
): Promise<BundleImportRequest<Body>> {
  const tooLarge = (limit: keyof BundleLimits) =>
    new EngineError(
      EngineErrorCode.PayloadTooLarge,
      `the ${bundle.kind} bundle is past its ${limit} limit of ${limits[limit]}`,
      { details: { limit, max: limits[limit] } },
    );
  if (!req.isMultipart()) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "an import is multipart/form-data: a 'body' part and a 'resource:<id>' part per resource",
    );
  }
  let body: unknown;
  let bundleBytes = 0;
  const count = (bytes: number) => {
    bundleBytes += bytes;
    if (bundleBytes > limits.bundleBytes) throw tooLarge('bundleBytes');
  };
  const resources: Record<ResourceId, ArrayBuffer> = {};
  const parts = req.parts({
    limits: {
      fields: 1,
      fieldSize: limits.manifestBytes,
      files: limits.resources,
      fileSize: limits.resourceBytes,
      parts: limits.resources + 1,
    },
  });
  try {
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname !== 'body') {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `unexpected multipart field '${part.fieldname}' (expected 'body')`,
          );
        }
        if (part.valueTruncated) throw tooLarge('manifestBytes');
        const text = String(part.value);
        count(Buffer.byteLength(text));
        try {
          body = JSON.parse(text);
        } catch {
          throw new EngineError(EngineErrorCode.InvalidArg, "multipart 'body' part: invalid JSON");
        }
        continue;
      }
      if (!part.fieldname.startsWith('resource:')) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `unexpected multipart file part '${part.fieldname}' (expected 'resource:<id>')`,
        );
      }
      const id = part.fieldname.slice('resource:'.length) as ResourceId;
      if (id in resources) {
        throw new EngineError(EngineErrorCode.InvalidArg, `resource ${id} is sent twice`);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        count((chunk as Buffer).length);
        chunks.push(chunk as Buffer);
      }
      if (part.file.truncated) throw tooLarge('resourceBytes');
      const bytes = Buffer.concat(chunks);
      resources[id] = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  } catch (err) {
    switch ((err as { code?: unknown }).code) {
      case 'FST_REQ_FILE_TOO_LARGE':
        throw tooLarge('resourceBytes');
      case 'FST_FILES_LIMIT':
      case 'FST_PARTS_LIMIT':
        throw tooLarge('resources');
      case 'FST_FIELDS_LIMIT':
        throw new EngineError(EngineErrorCode.InvalidArg, "an import has one 'body' part");
      default:
        throw err;
    }
  }
  if (body === undefined) {
    throw new EngineError(EngineErrorCode.InvalidArg, "an import needs its 'body' part");
  }
  return { body: parseOrInvalidArg(bundle.bodySchema, body, 'body'), resources };
}
