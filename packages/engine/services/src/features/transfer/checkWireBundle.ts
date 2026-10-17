import {
  EngineError,
  EngineErrorCode,
  assertWithinLimit,
  sniffBinaryMetadata,
  type BundleKind,
  type BundleLimits,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { sha256HexOf } from '../../runtime/digest';

/**
 * Check a bundle as a worker receives it, before anything uses it, the
 * checks cheapest first: each resource is bytes; the manifest
 * (`assertManifest`, given the resources' sizes by id); then each resource
 * against its id, hashed here. Returns each resource's hash, for an index
 * that keeps them.
 */
export function checkWireBundle(
  runtime: PdfRuntimeModule,
  kind: BundleKind,
  bundle: { readonly resources?: Readonly<Record<string, ArrayBuffer>> },
  limits: BundleLimits,
  assertManifest: (
    manifest: unknown,
    resourceSizes: ReadonlyMap<string, number>,
    limits: BundleLimits,
  ) => void,
): Map<ArrayBuffer, string> {
  const sizes = new Map<string, number>();
  for (const [id, bytes] of Object.entries(bundle.resources ?? {})) {
    if (!(bytes instanceof ArrayBuffer)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `${kind} bundle: resource ${id} is not bytes`,
      );
    }
    sizes.set(id, bytes.byteLength);
  }
  assertManifest(bundle, sizes, limits);

  const { fn, mem } = runtime;
  const hashes = new Map<ArrayBuffer, string>();
  for (const [id, bytes] of Object.entries(bundle.resources ?? {})) {
    const hex = sha256HexOf(fn, mem, new Uint8Array(bytes));
    if (`sha256-${hex}` !== id) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `${kind} bundle: resource ${id} doesn't match its id`,
      );
    }
    hashes.set(bytes, hex);
  }
  return hashes;
}

/**
 * Refuse an image resource whose decoded size is past `imagePixels`, read
 * from its header before it is decoded: a small PNG can decode to gigabytes.
 */
export function assertImageWithinLimit(
  kind: BundleKind,
  limits: BundleLimits,
  bytes: ArrayBuffer,
): void {
  const meta = sniffBinaryMetadata(bytes);
  if (meta && 'width' in meta) {
    assertWithinLimit(kind, limits, 'imagePixels', meta.width * meta.height);
  }
}
