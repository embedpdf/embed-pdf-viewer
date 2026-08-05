/**
 * The React view of @embedpdf/plugin-stamp.
 *
 * Thin by design: the plugin owns the store (libraries/assets) and the binary
 * sidecar (bytes + cached previews); this file only exposes hooks and owns the
 * DOM-side object-URL lifetime for gallery thumbnails. Placement UI needs no
 * component here — arming rides the annotation plugin, whose `<AnnotationLayer>`
 * already renders the hover ghost.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-stamp';
import { useEffect, useState } from 'react';
import { StampToken, type StampAsset, type StampLibrary } from '@embedpdf/plugin-stamp';
import { shallowArray, useCapability, useDocumentId, useSelector } from './runtime';

/** The stamp capability (workspace-scoped: one library set for every document). */
export function useStamp() {
  return useCapability(StampToken);
}

export function useStampLibraries(): StampLibrary[] {
  return useSelector(StampToken, (c) => c.libraries(), shallowArray);
}

/** Assets of one library, or every asset when `libraryId` is omitted. */
export function useStampAssets(libraryId?: string): StampAsset[] {
  return useSelector(StampToken, (c) => c.assets(libraryId), shallowArray);
}

/**
 * Object URL for an asset's cached preview (gallery thumbnails). The plugin
 * holds the preview BYTES; the URL — a DOM resource — is created here and
 * revoked on unmount/asset change, mirroring `<AnnotationLayer>`'s rule that
 * object-URL lifetime belongs to the framework layer.
 */
export function useStampAssetPreviewUrl(assetId: string | null): string | null {
  const stamp = useCapability(StampToken);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const preview = assetId ? stamp.assetPreview(assetId) : null;
    if (!preview) {
      setUrl(null);
      return;
    }
    // Copy into an EXACT ArrayBuffer (the engine idiom) before Blob-wrapping.
    const body = new ArrayBuffer(preview.bytes.byteLength);
    new Uint8Array(body).set(preview.bytes);
    const obj = URL.createObjectURL(new Blob([body], { type: preview.mimeType }));
    setUrl(obj);
    return () => {
      URL.revokeObjectURL(obj);
      setUrl(null);
    };
  }, [stamp, assetId]);
  return url;
}

/**
 * Arm/disarm assets against the nearest `<DocumentScope>` (or the active
 * document) — the one-liner a gallery item's onClick needs.
 */
export function useArmStampAsset(): {
  armAsset: (assetId: string, opts?: { targetWidth?: number }) => Promise<void>;
  disarm: () => void;
} {
  const stamp = useCapability(StampToken);
  const documentId = useDocumentId();
  return {
    armAsset: (assetId, opts) => {
      if (!documentId) return Promise.reject(new Error('[stamp] no document in scope'));
      return stamp.armAsset(documentId, assetId, opts);
    },
    disarm: () => {
      if (documentId) stamp.disarm(documentId);
    },
  };
}
