/**
 * The binaries resource: asset bytes and cached previews, the canonical
 * library PDFs, and the ghost render caches. State holds only the
 * serializable descriptors; everything binary lives here, next to the
 * per-library mutation queue that orders whole-PDF rewrites.
 */
import type { StampAssetPreview } from '../contract';
import type { StampContext } from './context';

export function createBinaries(ctx: StampContext) {
  /** Asset bytes (a one-page placement PDF) and the cached preview, by asset id. */
  const binaries = new Map<string, { bytes: Uint8Array; preview: StampAssetPreview | null }>();
  /** The durable source of truth for a canonical library. Asset PDFs above
   *  are derived page extractions; this map owns the rewritten whole PDF. */
  const libraryBinaries = new Map<string, Uint8Array>();

  /** Whole-PDF rewrites are serialized per library, or two concurrent
   *  appends could both start from the same bytes and lose one page. */
  const mutateLibrary = <T>(libraryId: string, mutation: () => Promise<T>): Promise<T> =>
    ctx.serialQueue(`library:${libraryId}`)(mutation);

  /**
   * Ghost renders, one per size bucket per asset, rendered lazily on the
   * asset engine the first time the ghost is shown at that size and kept
   * until the asset goes away. Materialized (dynamic) placements are
   * user/time specific and cache only for their own arm (`cacheKey` null).
   */
  const ghostRenders = new Map<string, Map<number, Promise<StampAssetPreview | null>>>();

  ctx.cleanup(() => {
    binaries.clear();
    ghostRenders.clear();
    libraryBinaries.clear();
  });

  return { binaries, libraryBinaries, ghostRenders, mutateLibrary };
}
export type StampBinaries = ReturnType<typeof createBinaries>;
