import { Buffer } from 'node:buffer';

import type { ResourceId } from '@embedpdf/engine-core/runtime';
import type { FastifyReply } from 'fastify';

import { setImmutableCache, setNoStore } from './_helpers';
import { buildMultipart, type MultipartPart } from './_multipart';

/**
 * Answer an export with its bundle, either family's, as `multipart/form-data`:
 * the bundle without its bytes as the `body` part, then one `resource:<id>`
 * part per resource. A GET at its token is immutable; a POST is answered
 * uncached.
 */
export function sendBundle(
  reply: FastifyReply,
  bundle: { readonly resources: Readonly<Record<ResourceId, ArrayBuffer>> },
  cache: 'immutable' | 'no-store',
) {
  const { resources, ...manifest } = bundle;
  const parts: MultipartPart[] = Object.entries(resources).map(([id, bytes]) => ({
    key: id,
    filename: id,
    contentType: 'application/octet-stream',
    body: Buffer.from(bytes),
  }));
  if (cache === 'no-store') setNoStore(reply);
  else setImmutableCache(reply);
  const { contentType, body } = buildMultipart(manifest, parts);
  reply.type(contentType);
  return reply.send(body);
}
