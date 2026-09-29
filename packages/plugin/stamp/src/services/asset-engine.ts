/**
 * The asset engine port and the canonical-library services every write
 * needs: opening library bytes as a document on a local engine, import-time
 * previews, and the import-support fact learned from the first import.
 */
import { isLocalEngine } from '@embedpdf/engine-core/runtime';
import type {
  Engine,
  LocalDocumentHandle,
  LocalPageHandle,
  PageImageHandle,
} from '@embedpdf/engine-core/runtime';

import type { StampAssetPreview, StampConfig } from '../contract';
import type { StampContext } from './context';
import { stampError } from './errors';

export const DEFAULT_PREVIEW_WIDTH = 256;

/** Session-unique ids (scratch documents, library ids a file does not carry):
 *  a timestamp plus a counter. */
let idCounter = 0;
export const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export function createAssetEngine(ctx: StampContext, config: StampConfig) {
  /** Set once an import finds the asset engine is not local (cloud). */
  let importSupported: boolean | null = null;

  // The asset engine port. A configured factory is called (and memoized) on
  // the first import, not at viewer start; a configured instance is used
  // as-is; nothing configured falls back to the kernel's engine: correct for
  // local deployments, and refused with an actionable error at the first
  // import when it is a cloud engine.
  let assetEngineRef: Engine | Promise<Engine> | null = null;
  const assetEngine = (): Engine | Promise<Engine> => {
    if (!assetEngineRef) {
      const configured = config.assetEngine;
      assetEngineRef = !configured
        ? ctx.engine
        : typeof configured === 'function'
          ? configured()
          : configured;
    }
    return assetEngineRef;
  };

  /** Library PDFs are sliced and tagged (`/PieceInfo`) on a local engine only. */
  const openAssetDocument = async (bytes: Uint8Array): Promise<LocalDocumentHandle> => {
    const engine = await assetEngine();
    if (!isLocalEngine(engine)) {
      if (importSupported !== false) {
        importSupported = false;
        ctx.notify();
      }
      throw stampError(
        'unsupported',
        config.assetEngine
          ? "the stamp plugin's assetEngine must be a local engine (createLocalEngine())"
          : "importing a library PDF needs a local engine, and this viewer's engine is a cloud engine. Pass stampPlugin({ assetEngine: () => import('@embedpdf/engine').then((module) => module.createLocalEngine()) }): it loads lazily, on first import.",
      );
    }
    return engine.open({ kind: 'bytes', id: uid('stamp-import'), bytes }, { scope: ['*'] });
  };

  /** Import-time preview render to bytes. The asset engine is local by
   *  definition, so the image source is always inline bytes. */
  const imageToPreview = (image: PageImageHandle): StampAssetPreview => {
    if (image.source.kind !== 'bytes') {
      throw stampError(
        'unsupported',
        'the asset engine returned a URL-sourced render; asset engines must be local',
      );
    }
    return { bytes: image.source.bytes, mimeType: image.contentType };
  };

  /** Thumbnail render of one library page (the small picker image). */
  const renderThumbnail = async (handle: LocalPageHandle): Promise<StampAssetPreview> =>
    imageToPreview(
      await handle.render.image({
        viewport: { kind: 'width', width: config.previewWidth ?? DEFAULT_PREVIEW_WIDTH },
        background: 'transparent',
        includeAnnotations: true,
        format: 'png',
      }),
    );

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
    /** Optimistic until an import finds the asset engine is not local (cloud). */
    canImport: (): boolean => importSupported !== false,
  };
}
export type StampAssetEngine = ReturnType<typeof createAssetEngine>;
