import {
  assertWithinLimit,
  type BundleKind,
  type BundleLimits,
  type ResourceId,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { sha256HexOf } from '../../runtime/digest';

/**
 * The resources of one export: each once, under the SHA-256 of its bytes,
 * however many rows name it, and within the limits as each is kept.
 */
export class BundleResources {
  readonly byId: Record<ResourceId, ArrayBuffer> = {};
  totalBytes = 0;

  constructor(
    protected readonly runtime: PdfRuntimeModule,
    private readonly kind: BundleKind,
    readonly limits: BundleLimits,
  ) {}

  /** Keep `bytes`, once: their id. */
  keep(bytes: ArrayBuffer): ResourceId {
    assertWithinLimit(this.kind, this.limits, 'resourceBytes', bytes.byteLength);
    const { fn, mem } = this.runtime;
    const id: ResourceId = `sha256-${sha256HexOf(fn, mem, new Uint8Array(bytes))}`;
    if (!(id in this.byId)) {
      this.byId[id] = bytes;
      this.totalBytes += bytes.byteLength;
      assertWithinLimit(this.kind, this.limits, 'resources', Object.keys(this.byId).length);
      assertWithinLimit(this.kind, this.limits, 'bundleBytes', this.totalBytes);
    }
    return id;
  }
}
