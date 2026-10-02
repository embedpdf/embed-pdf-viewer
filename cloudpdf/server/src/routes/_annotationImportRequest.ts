import { Buffer } from 'node:buffer';

import {
  EngineError,
  EngineErrorCode,
  type AnnotationBundleLimits,
  type AnnotationImportManifest,
  type ResourceId,
} from '@embedpdf/engine-core/runtime';
import { AnnotationImportManifestSchema } from '@embedpdf/engine-core/wire';
import type { FastifyRequest } from 'fastify';

import { parseOrInvalidArg, type SchemaLike } from './_helpers';

export interface AnnotationImportRequest {
  manifest: AnnotationImportManifest;
  /** Each resource's bytes, by the id its part is named for. */
  resources: Record<ResourceId, ArrayBuffer>;
}

/**
 * Read an import request, `multipart/form-data`: a `manifest` part (the
 * bundle without its bytes, and the options) and one `resource:<id>` part per
 * resource. The limits hold while the parts stream in, so a request past one
 * is stopped before the rest of it is read, with `PayloadTooLarge` naming
 * the limit: the manifest's size, each resource's size, how many resources,
 * and the bundle's bytes counted across every part. That the parts and the
 * manifest name each other, and each resource matches its id, is the
 * worker's check, with the rest of the bundle's.
 */
export async function readAnnotationImportRequest(
  req: FastifyRequest,
  limits: AnnotationBundleLimits,
): Promise<AnnotationImportRequest> {
  if (!req.isMultipart()) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "an import is multipart/form-data: a 'manifest' part and a 'resource:<id>' part per resource",
    );
  }
  let manifest: unknown;
  let bundleBytes = 0;
  const count = (bytes: number) => {
    bundleBytes += bytes;
    if (bundleBytes > limits.bundleBytes) throw tooLarge(limits, 'bundleBytes');
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
        if (part.fieldname !== 'manifest') {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `unexpected multipart field '${part.fieldname}' (expected 'manifest')`,
          );
        }
        if (part.valueTruncated) throw tooLarge(limits, 'manifestBytes');
        const text = String(part.value);
        count(Buffer.byteLength(text));
        try {
          manifest = JSON.parse(text);
        } catch {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            "multipart 'manifest' part: invalid JSON",
          );
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
      if (part.file.truncated) throw tooLarge(limits, 'resourceBytes');
      const bytes = Buffer.concat(chunks);
      resources[id] = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  } catch (err) {
    switch ((err as { code?: unknown }).code) {
      case 'FST_REQ_FILE_TOO_LARGE':
        throw tooLarge(limits, 'resourceBytes');
      case 'FST_FILES_LIMIT':
      case 'FST_PARTS_LIMIT':
        throw tooLarge(limits, 'resources');
      case 'FST_FIELDS_LIMIT':
        throw new EngineError(EngineErrorCode.InvalidArg, "an import has one 'manifest' part");
      default:
        throw err;
    }
  }
  if (manifest === undefined) {
    throw new EngineError(EngineErrorCode.InvalidArg, "an import needs its 'manifest' part");
  }
  return {
    manifest: parseOrInvalidArg(
      AnnotationImportManifestSchema as unknown as SchemaLike<AnnotationImportManifest>,
      manifest,
      'manifest',
    ),
    resources,
  };
}

function tooLarge(
  limits: AnnotationBundleLimits,
  limit: keyof AnnotationBundleLimits,
): EngineError {
  return new EngineError(
    EngineErrorCode.PayloadTooLarge,
    `the annotation bundle is past its ${limit} limit of ${limits[limit]}`,
    { details: { limit, max: limits[limit] } },
  );
}
