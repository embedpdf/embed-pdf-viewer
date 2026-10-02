/**
 * @embedpdf/vue/stamp: the Vue view of `@embedpdf/plugin-stamp`.
 *
 * Thin by design: the plugin owns the libraries, their stamps and the cached
 * previews; this entry gives them to Vue as refs, and owns the one DOM
 * resource a picker needs, the object URL of a stamp's preview. Placing needs
 * no component here: an armed stamp rides the annotation plugin, whose
 * `<AnnotationLayer>` draws the ghost under the pointer.
 *
 *   const stamp = useStamp();
 *   const assets = useStampAssets(() => ({ libraryId: props.libraryId }));
 *   const { armedAsset } = useStampState();
 *   await stamp.armAsset(assetId); // the next click places it
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-stamp';
// The browser store for `persistStampLibraries` / `restoreStampLibraries`
// (structurally the plugin's `StampLibraryStore`), written once in `@embedpdf/web`.
export { indexedDbByteStore } from '@embedpdf/web';
export type { ByteStore } from '@embedpdf/web';
import { shallowRef, toValue, watch } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { objectUrlOf } from '@embedpdf/web';
import { shallowEqual } from '@embedpdf/core';
import type { EventHook } from '@embedpdf/core';
import { StampToken, stampState } from '@embedpdf/plugin-stamp';
import type {
  StampAsset,
  StampAssetFilter,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '@embedpdf/plugin-stamp';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalSelector,
  useSelector,
} from './runtime/capabilities';
import { settingsComposable, stateComposable } from './state';

/**
 * The stamp API. Libraries are shared by every document; the placing verbs
 * (`armAsset`, `placeAsset`, …) act on the nearest `<DocumentScope>`'s
 * document, else the active one. The object never changes, so keep it whole:
 * `stamp.armAsset(id)`.
 */
export function useStamp(): StampCapability {
  return useCapability(StampToken);
}

/** Subscribe to one stamp event while the component lives: `useStampEvent((stamp) => stamp.onLibraryChanged, handler)`. */
export function useStampEvent<Event>(
  select: (stamp: StampCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(StampToken, select, handler);
}

/**
 * The stamps' state for this component's document as refs: the armed stamp
 * (the page's State table, declared once in `stampState`). With a selector,
 * one ref that updates only when the value it picks changes.
 */
export const useStampState = stateComposable(stampState);

/** The stamp settings (`assetEngine`, `previewWidth`, `dynamic`), with or without a document, as refs. Takes a selector. */
export const useStampSettings = settingsComposable(StampToken);

/**
 * The libraries as a ref, optionally of one kind or several
 * (`{ kind: 'stamps' }`, `{ kind: ['stamps', 'legal-seals'] }`; a getter to
 * follow a prop). It updates when a library is added, renamed or removed.
 */
export function useStampLibraries(
  filter?: MaybeRefOrGetter<StampLibraryFilter | undefined>,
): Readonly<Ref<readonly StampLibrary[]>> {
  // Every read is a new array: compared item by item, the ref updates only
  // when the libraries themselves change.
  return useSelector(StampToken, (stamp) => stamp.listLibraries(toValue(filter)), shallowEqual);
}

/**
 * The stamps as a ref: one library's (`{ libraryId }`), one kind's or
 * category's, or every stamp, in the order a picker shows them. Pass a getter
 * to follow a prop or a ref: `useStampAssets(() => ({ libraryId: library.value?.id }))`.
 */
export function useStampAssets(
  filter?: MaybeRefOrGetter<StampAssetFilter | undefined>,
): Readonly<Ref<readonly StampAsset[]>> {
  // Compared item by item, like the libraries: every read is a new array.
  return useSelector(StampToken, (stamp) => stamp.listAssets(toValue(filter)), shallowEqual);
}

/**
 * An image URL for a stamp's cached preview (a gallery thumbnail), as a ref,
 * or null while there is none. Pass a getter to follow a prop:
 * `useStampAssetPreviewUrl(() => props.assetId)`.
 *
 * The plugin holds the preview's bytes; the URL is a DOM resource, so it is
 * made here and revoked when the asset changes or the component unmounts,
 * the same rule `<AnnotationLayer>` follows for the pictures it shows.
 */
export function useStampAssetPreviewUrl(
  assetId: MaybeRefOrGetter<string | null>,
): Readonly<Ref<string | null>> {
  // The preview itself, read on every change: it follows the asset, and a
  // preview that arrives after the asset does.
  const preview = useOptionalSelector(
    StampToken,
    (stamp) => {
      const id = toValue(assetId);
      return id ? stamp.getAssetPreview(id) : null;
    },
    null,
  );
  const url = shallowRef<string | null>(null);
  watch(
    preview,
    (current, _previous, onCleanup) => {
      if (!current) {
        url.value = null;
        return;
      }
      const objectUrl = objectUrlOf(current);
      url.value = objectUrl.url;
      onCleanup(() => {
        objectUrl.revoke();
        url.value = null;
      });
    },
    { immediate: true },
  );
  return url;
}
