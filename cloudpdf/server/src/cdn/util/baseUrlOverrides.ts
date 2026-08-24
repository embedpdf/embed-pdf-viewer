/**
 * Build the `CdnAccessInfo.baseUrlOverrides` map for a CDN signer.
 * Every cacheable resource in `coverage` gets mapped to the CDN
 * origin — the SDK swaps the origin host while keeping the path. The
 * map is intentionally scope-narrow: resources the caller's scope
 * doesn't grant are simply absent, so the SDK can't accidentally try
 * to route an unauthorized request through the CDN (and the CDN's
 * per-prefix signed policies wouldn't let it through anyway).
 *
 * Used by every signer except `none`.
 */

import type { CdnCoverageEntry, DocResourceId } from '@embedpdf/engine-core/wire';

export function buildBaseUrlOverrides(
  cdnOrigin: string,
  coverage: ReadonlyArray<CdnCoverageEntry>,
): Partial<Record<DocResourceId, string>> {
  const out: Partial<Record<DocResourceId, string>> = {};
  for (const entry of coverage) {
    out[entry.resourceId] = cdnOrigin;
  }
  return out;
}
