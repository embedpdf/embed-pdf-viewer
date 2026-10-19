/**
 * The stamp plugin's service and feature, and the helper that keeps libraries between visits:
 *
 *   withStamp(options)                       the plugin, for provideEmbedPdf()
 *   inject(EpdfStamp)                        the libraries (`libraries()`), their stamps
 *                                            (`assetsOf(filter)`), a stamp's picture
 *                                            (`previewUrlOf(id)`), arming and placing, the armed
 *                                            stamp (`armedAsset()`), the events as streams
 *   persistStampLibraries(stamp, store)      every change of a library written to `store`, from
 *                                            the service's `libraryChanged$` stream
 *
 * The plugin's `restoreStampLibraries(stamp, store)` takes the service as it is.
 *
 * Placing needs no component here: an armed stamp rides the annotation plugin, whose
 * `<epdf-annotation-layer>` draws it under the pointer.
 */
import { effect, Injectable, signal, type Signal } from '@angular/core';
import type { EventHook } from '@embedpdf/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  persistStampLibraries as persistLibraries,
  stampPlugin,
  stampState,
  StampToken,
  type StampAsset,
  type StampAssetFilter,
  type StampConfig,
  type StampLibrary,
  type StampLibraryStore,
} from '@embedpdf/plugin-stamp';
import { objectUrlOf } from '@embedpdf/web';
import type { Observable } from 'rxjs';

const NO_LIBRARIES: readonly StampLibrary[] = Object.freeze([]);
const NO_ASSETS: readonly StampAsset[] = Object.freeze([]);

/**
 * Stamps: the libraries and their stamps, shared by every document, and arming and placing
 * them on the document in scope (`[epdfDocumentScope]`), else the active one. The Stamps page's
 * methods, `armedAsset()` as a signal, the events as streams (`libraryChanged$`, `armChanged$`,
 * …), and the settings. The libraries work without a document; a placing call refuses with
 * `not-ready` until one is open.
 */
@Injectable({ providedIn: 'root' })
export class EpdfStamp extends pluginService({
  name: 'EpdfStamp',
  feature: 'withStamp()',
  token: StampToken,
  state: stampState,
  methods: [
    'listLibraries',
    'getLibrary',
    'listAssets',
    'getAsset',
    'getAssetPreview',
    'renderAssetPreview',
    'readAssetBytes',
    'createLibrary',
    'updateLibrary',
    'deleteLibrary',
    'importLibrary',
    'exportLibrary',
    'createAsset',
    'createAssetFromAnnotations',
    'updateAsset',
    'deleteAsset',
    'moveAsset',
    'duplicateAsset',
    'armAsset',
    'disarm',
    'getArmedAsset',
    'placeAsset',
    'placeAssetOnPages',
    'canPlace',
    'canCreateFromAnnotations',
    'canImport',
  ],
  events: [
    'onLibraryChanged',
    'onLibraryCreated',
    'onLibraryUpdated',
    'onLibraryDeleted',
    'onAssetCreated',
    'onAssetUpdated',
    'onAssetDeleted',
    'onArmChanged',
  ],
}) {
  /**
   * Every library, in the order they were added. It changes when a library is added, renamed
   * or removed; filter it for the kinds a picker shows (`library.kind`).
   */
  readonly libraries: Signal<readonly StampLibrary[]> = this.binding.select(
    (stamp) => stamp.listLibraries(),
    NO_LIBRARIES,
  );

  /**
   * The stamps in the order a picker shows them: one library's (`{ libraryId }`), one kind's or
   * category's, or every stamp. Pass a function (`() => ({ libraryId: this.libraryId() })`) and
   * it follows the signals it reads. It changes when a stamp is added, renamed or removed.
   */
  assetsOf(
    filter?: StampAssetFilter | (() => StampAssetFilter | undefined),
  ): Signal<readonly StampAsset[]> {
    const filterOf = typeof filter === 'function' ? filter : () => filter;
    return this.binding.select((stamp) => stamp.listAssets(filterOf()), NO_ASSETS);
  }

  /**
   * An image URL for a stamp's picture (a picker's thumbnail), or null while it has none. Pass
   * a function (`() => this.asset().id`) and it follows the stamp you show, and a picture that
   * arrives after the stamp does.
   *
   * The URL is a browser resource that holds the picture's bytes, so it is released when the
   * stamp changes and when the caller goes: call it in an injection context (a constructor or a
   * field initializer).
   */
  previewUrlOf(assetId: string | null | (() => string | null)): Signal<string | null> {
    const idOf = typeof assetId === 'function' ? assetId : () => assetId;
    // The plugin keeps each picture until it changes, so this wakes only for a new one.
    const preview = this.binding.select(
      (stamp) => {
        const id = idOf();
        return id ? stamp.getAssetPreview(id) : null;
      },
      null,
      Object.is,
    );
    const url = signal<string | null>(null);
    effect((onCleanup) => {
      const picture = preview();
      if (!picture) {
        url.set(null);
        return;
      }
      const objectUrl = objectUrlOf(picture);
      url.set(objectUrl.url);
      onCleanup(() => objectUrl.revoke());
    });
    return url.asReadonly();
  }
}

/** Stamps, with their settings: `withStamp({ assetEngine: localEngine() })` on a cloud viewer. */
export function withStamp(options?: StampConfig): EmbedPdfFeature {
  return { plugins: [stampPlugin(options)], services: [EpdfStamp] };
}

/** A stream as the plugin's kind of event: listen, and stop with the call it returns or a signal. */
function eventHookOf<T>(events: Observable<T>): EventHook<T> {
  return (listener, options) => {
    const subscription = events.subscribe(listener);
    options?.signal?.addEventListener('abort', () => subscription.unsubscribe(), { once: true });
    return () => subscription.unsubscribe();
  };
}

/** What {@link persistStampLibraries} takes besides the stamps and the store. */
export type PersistStampLibrariesOptions = NonNullable<Parameters<typeof persistLibraries>[2]>;

/**
 * Keep every library in `store` from now on: a change writes the library's PDF (a burst of
 * edits saves once), a removed library is deleted. `except` names the libraries never to store,
 * such as the standard set you import on every visit. Returns the stop, for when the caller
 * goes: `inject(DestroyRef).onDestroy(persistStampLibraries(stamp, store))`.
 */
export function persistStampLibraries(
  stamp: Pick<EpdfStamp, 'exportLibrary' | 'libraryChanged$'>,
  store: StampLibraryStore,
  options?: PersistStampLibrariesOptions,
): () => void {
  // The plugin's own helper, which reads only these two members: the changes, through the
  // stream (so it follows the viewer from before it starts), and the bytes.
  return persistLibraries(
    { exportLibrary: stamp.exportLibrary, onLibraryChanged: eventHookOf(stamp.libraryChanged$) },
    store,
    options,
  );
}
