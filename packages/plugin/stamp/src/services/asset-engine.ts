/**
 * The ASSET ENGINE port and the canonical-library services every write
 * needs: opening library bytes as a document, import-time previews, the
 * canonical-services check, and the import-support fact learned from the
 * first failed open.
 */
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { DocumentHandle, Engine, PageImageHandle } from '@embedpdf/engine-core/runtime';

import type { StampAssetPreview, StampConfig } from '../contract';
import type { StampContext } from './context';

export const DEFAULT_PREVIEW_WIDTH = 256;

/** Session-unique ids. Assets are session-scoped for now (no persistence),
 *  so a timestamp + counter is enough — durable ids come with the store port. */
let seq = 0;
export const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function createAssetEngine(ctx: StampContext, config: StampConfig) {
  /** Set once an import proves the engine cannot open local bytes (cloud). */
  let importSupported: boolean | null = null;

  // The ASSET ENGINE port. A configured factory is called (and memoized) on
  // the first import, not at viewer start; a configured instance is used
  // as-is; nothing configured falls back to the kernel's engine — correct for
  // local deployments, and rejected with an actionable error by cloud engines
  // at the first `open({ kind: 'bytes' })`.
  let assetEngineRef: Engine | Promise<Engine> | null = null;
  const assetEngine = (): Engine | Promise<Engine> => {
    if (!assetEngineRef) {
      const cfg = config.assetEngine;
      assetEngineRef = !cfg ? ctx.engine : typeof cfg === 'function' ? cfg() : cfg;
    }
    return assetEngineRef;
  };

  const openAssetDocument = async (bytes: Uint8Array): Promise<DocumentHandle> => {
    try {
      return await (
        await assetEngine()
      ).open({ kind: 'bytes', id: uid('stamp-import'), bytes }, { scope: ['*'] });
    } catch (err) {
      // A cloud kernel engine rejects 'bytes' with InvalidArg — turn the
      // generic contract error into the configuration fix.
      if (!config.assetEngine && EngineError.is(err, EngineErrorCode.InvalidArg)) {
        importSupported = false;
        throw new EngineError(
          EngineErrorCode.NotImplemented,
          "[stamp] importing a library PDF needs an engine that can open local bytes, and this viewer's engine cannot (cloud). Pass stampPlugin({ assetEngine: () => import('@embedpdf/engine').then((m) => m.createLocalEngine()) }) — it loads lazily, on first import.",
        );
      }
      throw err;
    }
  };

  /** Import-time preview render → bytes. The asset engine is local by
   *  definition, so the image source is always inline bytes. */
  const imageToPreview = (image: PageImageHandle): StampAssetPreview => {
    if (image.source.kind !== 'bytes') {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        '[stamp] asset engine returned a URL-sourced render; asset engines must be local',
      );
    }
    return { bytes: image.source.bytes, mimeType: image.contentType };
  };

  /** Thumbnail render of one library page (the small picker image). */
  const renderThumbnail = async (
    handle: ReturnType<DocumentHandle['page']>,
  ): Promise<StampAssetPreview> =>
    imageToPreview(
      await handle.render.image({
        viewport: { kind: 'width', width: config.previewWidth ?? DEFAULT_PREVIEW_WIDTH },
        background: 'transparent',
        includeAnnotations: true,
        format: 'png',
      }),
    );

  const requireCanonicalServices = (doc: DocumentHandle): void => {
    if (!doc.pieceInfo) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        '[stamp] canonical PDF libraries need an asset engine with pieceInfo',
      );
    }
    if (!doc.pages.setName || !doc.pages.removeName) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        '[stamp] canonical PDF libraries need an asset engine with named pages (pages.setName)',
      );
    }
  };

  ctx.cleanup(() => {
    const ownedAssetEngine = typeof config.assetEngine === 'function' ? assetEngineRef : null;
    assetEngineRef = null;
    if (ownedAssetEngine) {
      void Promise.resolve(ownedAssetEngine)
        .then((engine) => engine.destroy())
        .catch(() => {});
    }
  });

  return {
    openAssetDocument,
    imageToPreview,
    renderThumbnail,
    requireCanonicalServices,
    /** Optimistic until an import proves the engine cannot open local bytes (cloud). */
    canImport: (): boolean => importSupported !== false,
  };
}
export type StampAssetEngine = ReturnType<typeof createAssetEngine>;
