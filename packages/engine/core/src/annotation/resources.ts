import { ANNOTATION_RESOURCE_ROLES } from './field-names';
import type { AnnotationSubtype } from './subtype';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { sniffBinaryMetadata } from '../resource/binaryMetadata';

/**
 * Bytes travel beside an annotation's data, never inside it:
 * `create(data, resources)` and `update(ref, patch, resources)`. A read
 * returns the data only. Each role names what the bytes are for; a kind
 * declares the roles it takes (`kinds/<kind>/declaration.ts`).
 */

/**
 * What bytes beside an annotation's data can be for:
 *
 * - `appearance`: what the box shows before the rotation the data describes,
 *   PNG, JPEG or a one-page PDF, scaled into the box as the data's `fit` says.
 *   A stamp requires it; on update it replaces the drawing.
 * - `file`: an attached file's exact bytes; its name, MIME type and
 *   description are the data's `file`. A file attachment requires it; on
 *   update it replaces the bytes.
 */
export const ANNOTATION_RESOURCE_ROLE_NAMES = ['appearance', 'file'] as const;

export type AnnotationResourceRole = (typeof ANNOTATION_RESOURCE_ROLE_NAMES)[number];

/** Bytes as a caller holds them. */
export type ResourceBytes = Uint8Array | Blob;

/** The bytes of one write, by role. */
export type AnnotationResources = Partial<Record<AnnotationResourceRole, ResourceBytes>>;

/** The same, owned and ready for a worker transfer list or a multipart part. */
export type WireAnnotationResources = Partial<Record<AnnotationResourceRole, ArrayBuffer>>;

/**
 * Copy each resource into bytes the write owns: the local engine transfers
 * them to its worker, which detaches the buffer, and the caller's bytes are
 * only borrowed. An appearance that isn't PNG, JPEG or PDF fails here,
 * before anything is sent; the format comes from the bytes.
 */
export async function resolveAnnotationResources(
  resources: AnnotationResources | undefined,
): Promise<WireAnnotationResources> {
  if (!resources) return {};
  for (const role of Object.keys(resources)) {
    if (!(ANNOTATION_RESOURCE_ROLE_NAMES as readonly string[]).includes(role)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `unknown annotation resource '${role}'; expected ${ANNOTATION_RESOURCE_ROLE_NAMES.join(' or ')}`,
      );
    }
  }
  const wire: WireAnnotationResources = {};
  for (const role of ANNOTATION_RESOURCE_ROLE_NAMES) {
    const data = resources[role];
    if (data === undefined) continue;
    const bytes = await ownedBytes(data);
    if (role === 'appearance' && !sniffBinaryMetadata(bytes)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'the appearance resource must be PNG, JPEG or one-page PDF bytes',
      );
    }
    wire[role] = bytes;
  }
  return wire;
}

export function hasAnnotationResources(resources: WireAnnotationResources): boolean {
  return ANNOTATION_RESOURCE_ROLE_NAMES.some((role) => resources[role] !== undefined);
}

/**
 * Check a write's resources against its kind: a role the kind doesn't take
 * is refused, and so is a create without a role the kind requires.
 */
export function assertAnnotationResources(
  subtype: AnnotationSubtype,
  resources: WireAnnotationResources | undefined,
  write: 'create' | 'update',
): void {
  const roles = ANNOTATION_RESOURCE_ROLES[subtype] ?? {};
  for (const role of ANNOTATION_RESOURCE_ROLE_NAMES) {
    const given = resources?.[role] !== undefined;
    if (given && roles[role] === undefined) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `a ${subtype} annotation takes no '${role}' resource`,
      );
    }
    if (!given && write === 'create' && roles[role] === 'required') {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `creating a ${subtype} annotation needs its '${role}' resource`,
      );
    }
  }
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

async function ownedBytes(data: ResourceBytes): Promise<ArrayBuffer> {
  if (isBlob(data)) return data.arrayBuffer();
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}
