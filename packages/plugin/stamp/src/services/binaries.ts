/**
 * The binary sidecar of the serializable store: asset bytes + cached
 * previews, the canonical library PDFs, the ghost render caches, and the
 * per-library mutation queue. The reducer never sees these (kernel rule 1).
 */
import type { StampAssetPreview } from '../contract';
import type { StampContext } from './context';

export function createBinaries(ctx: StampContext) {
  /** Binary sidecar of the serializable store: asset bytes + cached preview,
   *  keyed by asset id. The reducer never sees these (kernel rule 1). */
  const binaries = new Map<string, { bytes: Uint8Array; preview: StampAssetPreview | null }>();
  /** The durable source of truth for a canonical library. Asset PDFs above
   *  are derived page extractions; this map owns the rewritten whole PDF. */
  const libraryBinaries = new Map<string, Uint8Array>();
  /** Whole-PDF rewrites must be serialized per library or two concurrent
   *  appends could both start from the same bytes and lose one page. */
  const libraryMutationTails = new Map<string, Promise<void>>();

  const mutateLibrary = <T>(libraryId: string, mutation: () => Promise<T>): Promise<T> => {
    const previous = libraryMutationTails.get(libraryId) ?? Promise.resolve();
    const result = previous.then(mutation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    libraryMutationTails.set(libraryId, tail);
    return result.finally(() => {
      if (libraryMutationTails.get(libraryId) === tail) libraryMutationTails.delete(libraryId);
    });
  };

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
    libraryMutationTails.clear();
  });

  return { binaries, libraryBinaries, ghostRenders, mutateLibrary };
}
export type StampBinaries = ReturnType<typeof createBinaries>;
