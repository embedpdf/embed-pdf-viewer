/**
 * The stamp plugin's readers: `useStamp()` (the API), `useStampState()`, `useStampSettings()`,
 * `useStampEvent()`, and the three a picker is built from: `useStampLibraries()`,
 * `useStampAssets()` and `useStampAssetPreviewUrl()`.
 *
 * The plugin owns the libraries, their stamps and the cached previews; the one thing made here is
 * the DOM resource a picker shows, the object URL of a stamp's preview.
 */
import type { EventHook } from '@embedpdf/core';
import { StampToken, stampState } from '@embedpdf/plugin-stamp';
import type {
  StampAsset,
  StampAssetFilter,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '@embedpdf/plugin-stamp';
import { objectUrlOf } from '@embedpdf/web';
import {
  shallowArray,
  useCapability,
  useCapabilityEvent,
  useOptionalSelector,
  useSelector,
} from '../runtime/readers.svelte';
import { settingsReader, stateReader } from '../runtime/state.svelte';
import { valueOf, type CurrentValue, type MaybeGetter } from '../runtime/values.svelte';

/**
 * The stamp API. Libraries are shared by every document; the placing verbs (`armAsset`,
 * `placeAsset`, …) act on the nearest `<DocumentScope>`'s document, else the active one. A handle:
 * keep it whole and call through it, `stamp.armAsset(id)`.
 */
export function useStamp(): StampCapability {
  return useCapability(StampToken);
}

/** Subscribe to one stamp event while the component lives: `useStampEvent((stamp) => stamp.onLibraryChanged, handler)`. */
export function useStampEvent<T>(
  select: (stamp: StampCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(StampToken, select, handler);
}

/**
 * The stamps' state for this component's document: the armed stamp (the page's State table,
 * declared once in `stampState`), as a reactive object (`stampState.armedAsset`). With a
 * selector, the value it picks as `{ current }`.
 */
export const useStampState = stateReader(stampState);

/** The stamp settings (`assetEngine`, `previewWidth`, `dynamic`), with or without a document. */
export const useStampSettings = settingsReader(StampToken);

/**
 * The libraries as `{ current }`, optionally of one kind or several (`{ kind: 'stamps' }`,
 * `{ kind: ['stamps', 'legal-seals'] }`; a function to follow a prop). Every read is a new array,
 * compared item by item, so the value changes only when a library is added, renamed or removed.
 */
export function useStampLibraries(
  filter?: MaybeGetter<StampLibraryFilter | undefined>,
): CurrentValue<readonly StampLibrary[]> {
  return useSelector(StampToken, (stamp) => stamp.listLibraries(valueOf(filter)), shallowArray);
}

/**
 * The stamps as `{ current }`: one library's (`{ libraryId }`), one kind's or category's, or every
 * stamp, in the order a picker shows them. A filter that changes is a function:
 * `useStampAssets(() => ({ libraryId }))`.
 */
export function useStampAssets(
  filter?: MaybeGetter<StampAssetFilter | undefined>,
): CurrentValue<readonly StampAsset[]> {
  return useSelector(StampToken, (stamp) => stamp.listAssets(valueOf(filter)), shallowArray);
}

/**
 * An image URL for a stamp's cached preview (a gallery thumbnail) as `{ current }`, or null while
 * there is none. An id that changes is a function: `useStampAssetPreviewUrl(() => assetId)`.
 *
 * The plugin holds the preview's bytes; the URL is a DOM resource, so it is made here and revoked
 * when the preview changes or the component goes away, the rule `<AnnotationLayer>` follows for
 * the pictures it shows.
 */
export function useStampAssetPreviewUrl(
  assetId: MaybeGetter<string | null>,
): CurrentValue<string | null> {
  // The preview itself, read on every change: it follows the id, and a preview that arrives
  // after the stamp does.
  const preview = useOptionalSelector(
    StampToken,
    (stamp) => {
      const id = valueOf(assetId);
      return id ? stamp.getAssetPreview(id) : null;
    },
    null,
  );
  let url = $state<string | null>(null);
  $effect(() => {
    const current = preview.current;
    if (!current) {
      url = null;
      return;
    }
    const objectUrl = objectUrlOf(current);
    url = objectUrl.url;
    return () => {
      objectUrl.revoke();
      url = null;
    };
  });
  return {
    get current() {
      return url;
    },
  };
}
