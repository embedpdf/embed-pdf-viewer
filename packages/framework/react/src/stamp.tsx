/**
 * The React view of @embedpdf/plugin-stamp.
 *
 * Thin by design: the plugin owns the store (libraries/assets) and the binary
 * sidecar (bytes + cached previews); this file only exposes hooks and owns the
 * DOM-side object-URL lifetime for gallery thumbnails. Placement UI needs no
 * component here — arming rides the annotation plugin, whose `<AnnotationLayer>`
 * already renders the hover ghost. `useStamp()` inside a `<DocumentScope>`
 * places on that document; elsewhere on the active one.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-stamp';
// The browser store for `persistStampLibraries` / `restoreStampLibraries`
// (structurally the plugin's `StampLibraryStore`), written once in `@embedpdf/web`.
export { indexedDbByteStore } from '@embedpdf/web';
export type { ByteStore } from '@embedpdf/web';
import { useEffect, useState } from 'react';
import {
  StampToken,
  stampState,
  type StampAsset,
  type StampAssetFilter,
  type StampCapability,
  type StampLibrary,
  type StampLibraryFilter,
} from '@embedpdf/plugin-stamp';
import type { EventHook } from '@embedpdf/core';
import { shallowArray, useCapability, useCapabilityEvent, useSelector } from './runtime';
import { settingsHook, stateHook } from './state';

/**
 * The stamp capability. Libraries are shared by every document; the placing
 * verbs act on the document this component is in.
 */
export function useStamp(): StampCapability {
  return useCapability(StampToken);
}

/** Subscribe to one stamp event for the mounted lifetime: `useStampEvent((stamp) => stamp.onAssetCreated, handler)`. */
export function useStampEvent<T>(
  select: (stamp: StampCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(StampToken, select, handler);
}

/**
 * The stamps' state for this component's document: the armed stamp (the
 * page's State table, declared once in `stampState`). Takes a selector, and
 * re-renders only when what it returns changes.
 */
export const useStampState = stateHook(stampState);

/** The stamp settings (`assetEngine`, `previewWidth`, `dynamic`), with or without a document. Takes a selector. */
export const useStampSettings = settingsHook(StampToken);

/** Libraries, optionally of one kind or several (`{ kind: 'stamps' }`, `{ kind: ['stamps', 'toolbar'] }`). */
export function useStampLibraries(filter?: StampLibraryFilter): readonly StampLibrary[] {
  // Keyed by value, so an inline filter doesn't read a new list every render.
  const kinds =
    filter?.kind === undefined ? undefined : ([] as string[]).concat(filter.kind).join('\u0000');
  return useSelector(
    StampToken,
    (stamp) =>
      stamp.listLibraries(kinds === undefined ? undefined : { kind: kinds.split('\u0000') }),
    shallowArray,
  );
}

/** The stamps of one library (`{ libraryId }`), of one kind or category, or every stamp. */
export function useStampAssets(filter?: StampAssetFilter): readonly StampAsset[] {
  const libraryId = filter?.libraryId;
  const kind = filter?.kind;
  const category = filter?.category;
  return useSelector(
    StampToken,
    (stamp) => stamp.listAssets({ libraryId, kind, category }),
    shallowArray,
  );
}

/**
 * Object URL for an asset's cached preview (gallery thumbnails). The plugin
 * holds the preview bytes; the URL — a DOM resource — is created here and
 * revoked on unmount/asset change, mirroring `<AnnotationLayer>`'s rule that
 * object-URL lifetime belongs to the framework layer.
 */
export function useStampAssetPreviewUrl(assetId: string | null): string | null {
  const stamp = useStamp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const preview = assetId ? stamp.getAssetPreview(assetId) : null;
    if (!preview) {
      setUrl(null);
      return;
    }
    // Copy into an exact ArrayBuffer (the engine idiom) before Blob-wrapping.
    const body = new ArrayBuffer(preview.bytes.byteLength);
    new Uint8Array(body).set(preview.bytes);
    const objectUrl = URL.createObjectURL(new Blob([body], { type: preview.mimeType }));
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [stamp, assetId]);
  return url;
}
