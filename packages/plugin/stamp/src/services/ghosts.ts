/**
 * Ghost renders, one per size bucket per asset, rendered lazily on the asset
 * engine the first time the ghost is shown at that size and kept until the
 * asset goes away. Materialized (dynamic) placements are user/time specific
 * and cache only for their own arm (`cacheKey` null).
 */
import type { StampPreviewProvider } from '@embedpdf/plugin-annotation/contract';

import type { StampAssetPreview } from '../contract';
import type { StampAssetEngine } from './asset-engine';
import type { StampBinaries } from './binaries';

export function createGhosts(
  {
    openAssetDocument,
    imageToPreview,
  }: Pick<StampAssetEngine, 'openAssetDocument' | 'imageToPreview'>,
  { ghostRenders }: Pick<StampBinaries, 'ghostRenders'>,
) {
  const renderGhost = async (bytes: Uint8Array, devicePixelWidth: number) => {
    const doc = await openAssetDocument(new Uint8Array(bytes));
    try {
      const layout = await doc.pages.list();
      const page = layout.pages[0];
      if (!page) return null;
      return imageToPreview(
        await doc.page(page.ref).render.image({
          viewport: { kind: 'width', width: devicePixelWidth },
          background: 'transparent',
          includeAnnotations: true,
          format: 'png',
        }),
      );
    } finally {
      await doc.close();
    }
  };

  /** A resolution-aware ghost source for placement bytes: the page renders
   *  at the requested width, cached per bucket under `cacheKey` when given. */
  const ghostProvider = (
    bytes: Uint8Array,
    fallback: StampAssetPreview | null,
    cacheKey: string | null,
  ): StampPreviewProvider => {
    const local = cacheKey ? (ghostRenders.get(cacheKey) ?? new Map()) : new Map();
    if (cacheKey) ghostRenders.set(cacheKey, local);
    return (devicePixelWidth) => {
      let pending = local.get(devicePixelWidth);
      if (!pending) {
        pending = renderGhost(bytes, devicePixelWidth).catch((error) => {
          globalThis.console?.warn('[stamp] ghost render failed, using the thumbnail:', error);
          return fallback;
        });
        local.set(devicePixelWidth, pending);
      }
      return pending;
    };
  };

  return { ghostProvider };
}
export type StampGhosts = ReturnType<typeof createGhosts>;
