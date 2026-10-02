/** @embedpdf/plugin-stamp/contract: the public stamp vocabulary. */
import type {
  BatchResult,
  DeepPartial,
  EventHook,
  OperationOptions,
  SettingsApi,
} from '@embedpdf/core';
import type {
  Annotation,
  AnnotationRef,
  BinarySource,
  LocalEngine,
  PageRef,
} from '@embedpdf/engine-core/runtime';
import type { StampPlacement } from '@embedpdf/plugin-annotation/contract';

export { StampToken } from './token';
export { DEFAULT_LIBRARY_KIND } from './convention';
export type { StampLibraryStore } from './persistence';
export type { StampPlacement } from '@embedpdf/plugin-annotation/contract';

/**
 * The stamp plugin: a workspace-scoped asset substrate.
 *
 * The design law ("documents have a home; assets ride the wire"): imported
 * PDF libraries retain one canonical PDF whose catalog/page `/PieceInfo`
 * carries their metadata. Per-asset PDFs and previews are derived caches used
 * for placement. Standalone PNG/JPEG assets remain loose because the engine
 * intentionally has no raster-to-PDF-page authoring primitive.
 */

export type StampAssetKind = 'stamp' | 'signature' | 'initials';

/**
 * What a library file is for: the routing key a surface queries by. Open:
 * the plugin defines `stamps` (the default) and `signatures`; an embedder
 * may define its own (`toolbar`, `legal-seals`). Persisted in the file.
 */
export type StampLibraryKind = string;

/**
 * How a mark is authored: drawn strokes (kept as a vector path), typed text
 * in a registered font (embedded by the flatten), a raster image, or a page
 * of a PDF. Ink strokes are in points, from the top-left and y down like
 * every page position, any origin — the asset page is the mark's bounds.
 */
export type MarkSource =
  | {
      kind: 'ink';
      strokes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>;
      color?: string;
      strokeWidth?: number;
    }
  | { kind: 'text'; text: string; fontFamily: string; color?: string; fontSize?: number }
  | { kind: 'image'; source: BinarySource }
  | { kind: 'pdf'; source: BinarySource; pageIndex?: number };

/**
 * One asset's serializable descriptor. The bytes and the cached preview are
 * deliberately not here: session state holds serializable data only, and
 * binary lives in the capability and crosses only as call arguments and
 * return values, mirroring the engine's own BinarySource rule.
 */
export interface StampAsset {
  /** Derived and stable: `${libraryId}:${name}` (never allocated). */
  id: string;
  libraryId: string;
  kind: StampAssetKind;
  /**
   * The stamp's identifier: the text before the first `=` in its library
   * key, and the placed annotation's `/Name`: a standard name (`Approved`)
   * or a custom one (`#LBGiYhk8V_oAfmqAPENiwD`). Not display text.
   */
  name: string;
  /** What the picker shows and the placed annotation's default `/Subj`:
   *  the text after `=` in the library key (`Goedgekeurd`). */
  label: string;
  /** Intrinsic size in PDF points (the source page's crop box / image pixels 1:1). */
  size: { width: number; height: number };
  /** The library page that is this asset. Every asset is a page: a raster
   *  added to a library becomes a page carrying the image. */
  page: PageRef;
  /** An explicit `/Subj` override (PieceInfo); placements use `label` otherwise. */
  subject?: string;
  categories?: string[];
}

/**
 * A library is a PDF: its `/Title` is the name, its `/Names /Pages` registry
 * the assets, its pages the artwork, PieceInfo only what has no standard
 * home. One imported PDF becomes one library; `exportLibrary` returns it.
 */
export interface StampLibrary {
  /** PieceInfo `Id`: stable while the title is editable. */
  id: string;
  name: string;
  /** PieceInfo `Kind`: `'stamps'`, `'signatures'`, or an embedder's own. */
  kind: StampLibraryKind;
  /** PieceInfo `Locale`: the language of the labels, when the library says. */
  locale?: string;
  categories?: string[];
  /** Asset ids in display order. */
  assetIds: string[];
}

// ── settings ──────────────────────────────────────────────────────────────

/**
 * The local engine stamp libraries open in, or a function that makes one. A
 * function is called on the first import, not at startup, and its engine is
 * destroyed with the plugin.
 */
export type StampAssetEngine = LocalEngine | (() => LocalEngine | Promise<LocalEngine>);

/**
 * The stamp plugin's settings. `stampPlugin(config)` registers them over
 * {@link STAMP_DEFAULTS}, and `updateSettings()` changes them while the app
 * runs.
 */
export interface StampSettings {
  /**
   * The engine stamp libraries open in. `null` uses the viewer's own engine,
   * which is right when that engine is local. A cloud viewer passes a local
   * engine, or a function that makes one:
   *
   * ```ts
   * stampPlugin({
   *   assetEngine: () => import('@embedpdf/engine').then((module) => module.createLocalEngine()),
   * })
   * ```
   */
  readonly assetEngine: StampAssetEngine | null;
  /** The width of a stamp's thumbnail, in device pixels. */
  readonly previewWidth: number;
  /**
   * Fill in a dynamic stamp's form fields when it's armed or placed.
   * Scripting itself is the workspace's one JavaScript switch,
   * `actionsPlugin({ javascript: { enabled } })`: without the actions plugin,
   * or with scripting off, a stamp is placed as it is. `false` keeps every
   * stamp as reviewed, even with scripting on.
   */
  readonly dynamic: boolean;
}

/** What the stamp settings are when the app registers none. */
export const STAMP_DEFAULTS: StampSettings = {
  assetEngine: null,
  previewWidth: 256,
  dynamic: true,
};

/** What `stampPlugin(config)` takes: any of the settings, merged over the defaults. */
export type StampConfig = DeepPartial<StampSettings>;

// ── verbs ─────────────────────────────────────────────────────────────────

/**
 * Which document a placing verb acts on. Left out, it is the document in
 * scope (`useStamp()` inside a `<DocumentScope>`, a document plugin's
 * `ctx.get(StampToken)`), else the active document.
 */
export interface StampDocumentOptions extends OperationOptions {
  readonly documentId?: string;
}

/** `armAsset()`'s options. */
export interface StampArmOptions extends StampDocumentOptions {
  /** Placed width in PDF points; the stamp's own width by default. */
  readonly targetWidth?: number;
}

export interface CreateLibraryOptions extends OperationOptions {
  /** The library's id; a fresh one when left out or taken. */
  readonly id?: string;
  /** What the library is for. Default `'stamps'`. */
  readonly kind?: StampLibraryKind;
  readonly categories?: string[];
}

export interface StampLibraryPatch {
  readonly name?: string;
  readonly categories?: string[];
}

export interface ImportLibraryOptions extends OperationOptions {
  /**
   * Fallback library name, applied only when the PDF carries no `/Title`
   * (an Acrobat-authored or previously exported library names itself).
   * Default `'Stamps'`.
   */
  name?: string;
  /** Library categories written to catalog `/PieceInfo`. */
  categories?: string[];
  /** Kind stamped onto every imported asset. Default `'stamp'`. */
  kind?: StampAssetKind;
  /** What the file is for; overrides what the file says (an Acrobat-authored set imported for a toolbar). */
  libraryKind?: StampLibraryKind;
  /**
   * Fallback per-page labels for a plain PDF (no `/Names /Pages` registry):
   * every page becomes a stamp named `Stamp<n>` with this label. Ignored
   * when the PDF registers its stamps itself.
   */
  assetName?: (pageIndex: number) => string;
}

export interface AddAssetInput {
  /** Target library; omitted, a new single-asset library named after the asset. */
  libraryId?: string;
  /** The identifier (placed `/Name`). Omit to mint an Acrobat-style `#…` one. */
  name?: string;
  /** Picker text and default `/Subj`. Defaults to `name`. */
  label?: string;
  kind?: StampAssetKind;
  subject?: string;
  categories?: string[];
  /**
   * PNG, JPEG, or single-page PDF bytes. Exactly one of `source` / `mark`. A
   * raster becomes a page of the library sized to `size` (default: its
   * pixels as points, 1:1) with the image flattened into it, so every asset
   * is a page and every library a complete PDF.
   */
  source?: BinarySource;
  /** An authored mark: drawn, typed, an image, or a PDF page. Exactly one of `source` / `mark`. */
  mark?: MarkSource;
  /** Thumbnail override for pickers (PNG/JPEG); rendered from the page otherwise. */
  preview?: BinarySource;
  /** Page size in PDF points for a raster source. Ignored for PDF sources (the page has one). */
  size?: { width: number; height: number };
}

/** What `createAssetFromAnnotations()` takes besides the annotations: where the stamp goes and its name. */
export type AssetFromAnnotationsInput = Omit<AddAssetInput, 'source' | 'mark' | 'size'>;

export interface StampAssetPatch {
  readonly label?: string;
  /** `null` drops the subject override, so placements use the label. */
  readonly subject?: string | null;
  readonly categories?: string[];
}

/** A cached, browser-paintable render of an asset (PNG from import; raster assets as-is). */
export interface StampAssetPreview {
  bytes: Uint8Array;
  mimeType: string;
}

export interface StampLibraryFilter {
  readonly kind?: StampLibraryKind | readonly StampLibraryKind[];
}
export interface StampAssetFilter {
  readonly libraryId?: string;
  readonly kind?: StampAssetKind;
  readonly category?: string;
}

// ── events ────────────────────────────────────────────────────────────────

/** A library's bytes changed, and why: the one to save it on. */
export interface StampLibraryChangedEvent {
  readonly libraryId: string;
  readonly reason:
    | 'created'
    | 'imported'
    | 'updated'
    | 'asset-added'
    | 'asset-updated'
    | 'asset-removed'
    | 'removed';
}
export interface StampLibraryCreatedEvent {
  readonly libraryId: string;
  readonly library: StampLibrary;
}
export interface StampLibraryUpdatedEvent {
  readonly libraryId: string;
  readonly library: StampLibrary;
}
export interface StampLibraryDeletedEvent {
  readonly libraryId: string;
  readonly library: null;
}
export interface StampAssetCreatedEvent {
  readonly assetId: string;
  readonly libraryId: string;
  readonly asset: StampAsset;
}
export interface StampAssetUpdatedEvent {
  readonly assetId: string;
  readonly libraryId: string;
  readonly asset: StampAsset;
}
export interface StampAssetDeletedEvent {
  readonly assetId: string;
  readonly libraryId: string;
  readonly asset: null;
}
/** A stamp was armed on a document, or disarmed (`asset: null`). */
export interface StampArmChangedEvent {
  readonly documentId: string;
  readonly asset: StampAsset | null;
}

/**
 * Stamp libraries and their assets, shared by every document, and placing
 * them on a document. The placing verbs act on the document in scope, else
 * the active one, or the one their options name (`documentId`). A library is
 * a PDF (one page per asset): `exportLibrary` returns the persistence format,
 * `importLibrary` reads it back. Every verb rejects with a `PluginError`, and
 * every async verb takes a `signal`: cancelled, it rejects
 * `operation-cancelled` and changes nothing. The settings belong to the
 * plugin, not to a document.
 */
export interface StampCapability extends SettingsApi<StampSettings> {
  // ── reading ──
  listLibraries(filter?: StampLibraryFilter): readonly StampLibrary[];
  getLibrary(libraryId: string): StampLibrary | null;
  /** Assets in the order a picker shows them: by library, then within it. */
  listAssets(filter?: StampAssetFilter): readonly StampAsset[];
  getAsset(assetId: string): StampAsset | null;
  /** The cached thumbnail (the `previewWidth` setting), or null. */
  getAssetPreview(assetId: string): StampAssetPreview | null;
  /** A preview at any width, rendered by the asset engine and cached per width. Rejects `not-found`. */
  renderAssetPreview(
    assetId: string,
    options: { width: number } & OperationOptions,
  ): Promise<StampAssetPreview | null>;
  /** A copy of the asset's placement bytes (a one-page PDF), or null. */
  readAssetBytes(assetId: string): Uint8Array | null;

  // ── libraries ──
  /** Create an empty library. Fires `onLibraryCreated` and `onLibraryChanged`. */
  createLibrary(name: string, options?: CreateLibraryOptions): Promise<{ library: StampLibrary }>;
  /** Rename a library or change its categories. Rejects `not-found`. Fires `onLibraryUpdated`. */
  updateLibrary(
    libraryId: string,
    changes: StampLibraryPatch,
    options?: OperationOptions,
  ): Promise<{ library: StampLibrary }>;
  /** Delete a library with its assets. Fires `onLibraryDeleted`. */
  deleteLibrary(libraryId: string, options?: OperationOptions): Promise<void>;
  /**
   * A PDF becomes a library (one asset per page). Rejects `invalid-input` for
   * bytes that aren't a PDF, `unsupported` without a local asset engine.
   * Fires `onLibraryCreated`, then `onAssetCreated` per stamp.
   */
  importLibrary(
    source: BinarySource,
    options?: ImportLibraryOptions,
  ): Promise<{ library: StampLibrary }>;
  /** The library as the PDF it is. Rejects `not-found`. */
  exportLibrary(libraryId: string, options?: OperationOptions): Promise<Uint8Array>;

  // ── assets ──
  /**
   * Add a stamp from bytes or a mark. Rejects `not-found` for an unknown
   * library, `invalid-input` for bytes that aren't a picture or a taken
   * identifier. Fires `onAssetCreated`.
   */
  createAsset(input: AddAssetInput, options?: OperationOptions): Promise<{ asset: StampAsset }>;
  /**
   * Annotations on a page of a document become one stamp, exactly as they
   * look. All or nothing: a hidden annotation, one without an appearance, or
   * one on another page fails the call. Rejects `permission-denied` without
   * `doc.download` (see `canCreateFromAnnotations`), `not-found` for a page
   * that isn't in the document.
   */
  createAssetFromAnnotations(
    page: PageRef | number,
    refs: readonly AnnotationRef[],
    input: AssetFromAnnotationsInput,
    options?: StampDocumentOptions,
  ): Promise<{ asset: StampAsset }>;
  /** Change a stamp's label, subject or categories; its identifier never changes. Rejects `not-found`. */
  updateAsset(
    assetId: string,
    changes: StampAssetPatch,
    options?: OperationOptions,
  ): Promise<{ asset: StampAsset }>;
  /** Remove a stamp from its library. Fires `onAssetDeleted`. */
  deleteAsset(assetId: string, options?: OperationOptions): Promise<void>;
  /** Move a stamp to another library: a copy there, with a new id, then the original goes. */
  moveAsset(
    assetId: string,
    to: { libraryId: string },
    options?: OperationOptions,
  ): Promise<{ asset: StampAsset }>;
  /** Copy a stamp within its library. */
  duplicateAsset(
    assetId: string,
    options?: { label?: string } & OperationOptions,
  ): Promise<{ asset: StampAsset }>;

  // ── placing, on one document ──
  /**
   * Arm a stamp: the next click on the document places it, with a preview
   * under the pointer. Rejects `not-found` for an unknown asset,
   * `permission-denied` without `annotations:create` (see `canPlace`).
   * Fires `onArmChanged`.
   */
  armAsset(assetId: string, options?: StampArmOptions): Promise<void>;
  /** Disarm the stamp without placing it. Fires `onArmChanged` when one was armed. */
  disarm(documentId?: string): void;
  /** The stamp the next click on the document places, or null. */
  getArmedAsset(documentId?: string): StampAsset | null;
  /**
   * Place a stamp without the pointer, its middle on `center`, sized by its
   * picture and kept on the page. Resolves `{ annotation }`. Selected only
   * with `select: true`. Rejects `permission-denied` without
   * `annotations:create`, `not-found` for an unknown asset or page.
   */
  placeAsset(
    assetId: string,
    placement: StampPlacement,
    options?: StampDocumentOptions,
  ): Promise<{ annotation: Annotation }>;
  /**
   * Place one stamp at the same spot on several pages (refs or indexes), or
   * on `'all'`. Resolves the placed stamps, and the pages that failed.
   */
  placeAssetOnPages(
    assetId: string,
    pages: readonly (PageRef | number)[] | 'all',
    placement: Omit<StampPlacement, 'page'>,
    options?: StampDocumentOptions,
  ): Promise<BatchResult<Annotation, PageRef>>;
  /** Whether a stamp may be armed or placed on the document (`annotations:create`). */
  canPlace(documentId?: string): boolean;
  /** Whether annotations of the document may become a stamp, which copies them out (`doc.download`). */
  canCreateFromAnnotations(documentId?: string): boolean;
  /** Whether libraries can be imported: false once an import found no local engine to open them in. */
  canImport(): boolean;

  // ── events ──
  readonly onLibraryCreated: EventHook<StampLibraryCreatedEvent>;
  readonly onLibraryUpdated: EventHook<StampLibraryUpdatedEvent>;
  readonly onLibraryDeleted: EventHook<StampLibraryDeletedEvent>;
  readonly onAssetCreated: EventHook<StampAssetCreatedEvent>;
  readonly onAssetUpdated: EventHook<StampAssetUpdatedEvent>;
  readonly onAssetDeleted: EventHook<StampAssetDeletedEvent>;
  /** A stamp was armed or disarmed on a document. */
  readonly onArmChanged: EventHook<StampArmChangedEvent>;
  /** A library's bytes changed (subscribe to persist). */
  readonly onLibraryChanged: EventHook<StampLibraryChangedEvent>;
}
