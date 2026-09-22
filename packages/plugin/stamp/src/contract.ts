/** @embedpdf/plugin-stamp/contract — the PUBLIC stamp vocabulary. */
import type { BatchResult, EventHook, OperationOptions } from '@embedpdf/core';
import type { AnnotationRef, BinarySource, Engine, PageRef } from '@embedpdf/engine-core/runtime';
import type { StampPlacement } from '@embedpdf/plugin-annotation/contract';

export { StampToken } from './token';
export { DEFAULT_LIBRARY_KIND } from './convention';
export type { StampLibraryStore } from './persistence';

/**
 * The stamp plugin: a workspace-scoped ASSET substrate.
 *
 * The design law ("documents have a home; assets ride the wire"): imported
 * PDF libraries retain one canonical PDF whose catalog/page `/PieceInfo`
 * carries their metadata. Per-asset PDFs and previews are derived caches used
 * for placement. Standalone PNG/JPEG assets remain loose because the engine
 * intentionally has no raster-to-PDF-page authoring primitive.
 */

export type StampAssetKind = 'stamp' | 'signature' | 'initials';

/**
 * What a library file is FOR — the routing key a surface queries by. Open:
 * the plugin defines `stamps` (the default) and `signatures`; an embedder
 * may define its own (`toolbar`, `legal-seals`). Persisted in the file.
 */
export type StampLibraryKind = string;

/**
 * How a mark is authored: drawn strokes (kept as a vector path), typed text
 * in a registered font (embedded by the flatten), a raster image, or a page
 * of a PDF. Ink strokes are in points, y-up, any origin — the asset page is
 * the mark's bounds.
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
 * One asset's SERIALIZABLE descriptor. The bytes and the cached preview are
 * deliberately NOT here — the reducer state stays pure/serializable (kernel
 * rule 1); binary lives in the capability and crosses only as call
 * arguments/returns, mirroring the engine's own BinarySource rule.
 */
export interface StampAsset {
  /** Derived and stable: `${libraryId}:${name}` (never allocated). */
  id: string;
  libraryId: string;
  kind: StampAssetKind;
  /**
   * The stamp's IDENTIFIER — the text before the first `=` in its library
   * key, and the placed annotation's `/Name`: a standard name (`Approved`)
   * or a custom one (`#LBGiYhk8V_oAfmqAPENiwD`). Not display text.
   */
  name: string;
  /** What the picker shows and the placed annotation's default `/Subj` —
   *  the text after `=` in the library key (`Goedgekeurd`). */
  label: string;
  /** Intrinsic size in PDF points (the source page's crop box / image pixels 1:1). */
  size: { width: number; height: number };
  /** The library page that IS this asset. Every asset is a page: a raster
   *  added to a library becomes a page carrying the image. */
  page: PageRef;
  /** An explicit `/Subj` override (PieceInfo); placements use `label` otherwise. */
  subject?: string;
  categories?: string[];
}

/**
 * A library IS a PDF: its `/Title` is the name, its `/Names /Pages` registry
 * the assets, its pages the artwork, PieceInfo only what has no standard
 * home. One imported PDF becomes one library; `exportLibrary` returns it.
 */
export interface StampLibrary {
  /** PieceInfo `Id` — stable while the title is editable. */
  id: string;
  name: string;
  /** PieceInfo `Kind`: `'stamps'`, `'signatures'`, or an embedder's own. */
  kind: StampLibraryKind;
  /** PieceInfo `Locale` — the language of the labels, when the library says. */
  locale?: string;
  categories?: string[];
  /** Asset ids in display order. */
  assetIds: string[];
}

/** Why a library's canonical bytes changed — the persistence signal. */
export interface StampLibraryChange {
  libraryId: string;
  reason:
    | 'created'
    | 'imported'
    | 'updated'
    | 'asset-added'
    | 'asset-updated'
    | 'asset-removed'
    | 'removed';
}

export interface StampConfig {
  /**
   * The ASSET ENGINE port: any `Engine` that can open `{ kind: 'bytes' }` —
   * used only to slice an imported library PDF into per-page assets and
   * render their previews.
   *
   * Omitted → the kernel's own engine is used, which is exactly right for a
   * local deployment (same WASM instance, zero extra cost). In a CLOUD
   * deployment the kernel engine cannot open local bytes, so pass a factory —
   * it is called (and memoized) on the first import, never at viewer boot:
   *
   * ```ts
   * stampPlugin({
   *   assetEngine: () => import('@embedpdf/engine').then((m) => m.createLocalEngine()),
   * })
   * ```
   */
  assetEngine?: Engine | (() => Engine | Promise<Engine>);
  /** Cached thumbnail width in device px (import-time render). Default 256. */
  previewWidth?: number;
  /**
   * Evaluate form-backed (dynamic) PDF stamp assets on arm. Default `true`.
   * Scripting itself is the workspace's ONE JavaScript switch,
   * `actionsPlugin({ javascript: { enabled } })`: stamp has no switch of its
   * own — it asks the target document's actions plugin for a DETACHED realm
   * (same identity, clock, sandbox, and budget; isolated globals), and arms
   * the template unevaluated when scripting is off or actions is absent.
   * `false` keeps templates static even with scripting on — a product
   * choice (a stamp's appearance must equal the reviewed template), not a
   * trust boundary: a detached realm can only alert and spend budget.
   */
  dynamic?: boolean;
}

export interface ImportLibraryOptions {
  /**
   * FALLBACK library name, applied only when the PDF carries no `/Title`
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
   * FALLBACK per-page labels for a plain PDF (no `/Names /Pages` registry):
   * every page becomes a stamp named `Stamp<n>` with this label. Ignored
   * when the PDF registers its stamps itself.
   */
  assetName?: (pageIndex: number) => string;
}

export interface AddAssetInput {
  /** Target library; omitted → a new single-asset library named after the asset. */
  libraryId?: string;
  /** The identifier (placed `/Name`). Omit to mint an Acrobat-style `#…` one. */
  name?: string;
  /** Picker text and default `/Subj`. Defaults to `name`. */
  label?: string;
  kind?: StampAssetKind;
  subject?: string;
  categories?: string[];
  /**
   * Single-page PDF (vector) or PNG/JPEG bytes. A raster becomes a PAGE of
   * the library sized to `size` (default: its pixels as points, 1:1) with the
   * image flattened into it — so every asset is a page and every library a
   * complete PDF.
   */
  /** PNG, JPEG, or single-page PDF bytes. Exactly one of `source` / `mark`. */
  source?: BinarySource;
  /** An authored mark — drawn, typed, an image, or a PDF page. Exactly one of `source` / `mark`. */
  mark?: MarkSource;
  /** Thumbnail override for pickers (PNG/JPEG); rendered from the page otherwise. */
  preview?: BinarySource;
  /** Page size in PDF points for a RASTER source. Ignored for PDF sources (the page has one). */
  size?: { width: number; height: number };
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

// ── events ──
export interface StampLibraryEvent {
  readonly libraryId: string;
  /** The library after the change; null once deleted. */
  readonly library: StampLibrary | null;
}
export interface StampAssetEvent {
  readonly assetId: string;
  readonly libraryId: string;
  /** The asset after the change; null once deleted. */
  readonly asset: StampAsset | null;
}
export interface StampArmChangedEvent {
  readonly documentId: string;
  readonly assetId: string | null;
}

/**
 * Stamp libraries and their assets (workspace-scoped); placement targets a
 * document. A library IS a PDF (one page per asset) — `exportLibrary` returns
 * the persistence format, `importLibrary` reads it back.
 */
export interface StampCapability {
  // ── reading ──
  listLibraries(filter?: StampLibraryFilter): readonly StampLibrary[];
  getLibrary(id: string): StampLibrary | null;
  listAssets(filter?: StampAssetFilter): readonly StampAsset[];
  getAsset(id: string): StampAsset | null;
  /** The cached thumbnail (the configured preview width), or null. */
  getAssetPreview(id: string): StampAssetPreview | null;
  /** A preview at any width, rendered by the asset engine and cached per width. */
  renderAssetPreview(
    id: string,
    options: { width: number } & OperationOptions,
  ): Promise<StampAssetPreview | null>;
  /** A copy of the asset's placement bytes (a one-page PDF), or null. */
  readAssetBytes(id: string): Uint8Array | null;

  // ── libraries ──
  createLibrary(
    name: string,
    options?: { id?: string; kind?: StampLibraryKind; categories?: string[] },
  ): Promise<string>;
  updateLibrary(id: string, patch: { name?: string; categories?: string[] }): Promise<void>;
  /** Delete a library with its assets. */
  deleteLibrary(id: string): Promise<void>;
  /** A PDF becomes a library (one asset per page). */
  importLibrary(source: BinarySource, options?: ImportLibraryOptions): Promise<string>;
  /** The library as the PDF it is. Rejects `not-found`. */
  exportLibrary(id: string): Promise<Uint8Array>;

  // ── assets ──
  createAsset(input: AddAssetInput): Promise<string>;
  /** Annotations on a page become an asset (their appearance exported as one page). */
  createAssetFromAnnotations(
    documentId: string,
    page: PageRef,
    refs: readonly AnnotationRef[],
    input: Omit<AddAssetInput, 'source' | 'size'>,
  ): Promise<string>;
  updateAsset(
    id: string,
    patch: { label?: string; subject?: string | null; categories?: string[] },
  ): Promise<void>;
  deleteAsset(id: string): Promise<void>;
  /** Move an asset to another library (a copy there, then the original is deleted). */
  moveAsset(id: string, to: { libraryId: string }): Promise<string>;
  /** Copy an asset within its library. */
  duplicateAsset(id: string, options?: { label?: string }): Promise<string>;

  // ── placement ──
  /** Arm on a document; the next click places. */
  armAsset(documentId: string, assetId: string, options?: { targetWidth?: number }): Promise<void>;
  disarm(documentId: string): void;
  /** What is armed on a document. Pure. */
  getArmedAsset(documentId: string): StampAsset | null;
  /** Place without the pointer. */
  placeAsset(
    documentId: string,
    assetId: string,
    placement: StampPlacement,
  ): Promise<AnnotationRef>;
  /** Stamp many pages with one asset at the same page-relative placement. */
  placeAssetOnPages(
    documentId: string,
    assetId: string,
    pages: readonly PageRef[] | 'all',
    placement: Omit<StampPlacement, 'page'>,
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, PageRef>>;
  /** Would placing on this document succeed (annotation create authority)? */
  canPlace(documentId?: string): boolean;
  /** Can this deployment import library PDFs (an engine that opens local bytes)? */
  canImport(): boolean;

  // ── events ──
  readonly onLibraryCreated: EventHook<StampLibraryEvent>;
  readonly onLibraryUpdated: EventHook<StampLibraryEvent>;
  readonly onLibraryDeleted: EventHook<StampLibraryEvent>;
  readonly onAssetCreated: EventHook<StampAssetEvent>;
  readonly onAssetUpdated: EventHook<StampAssetEvent>;
  readonly onAssetDeleted: EventHook<StampAssetEvent>;
  readonly onArmChanged: EventHook<StampArmChangedEvent>;
  /** A library's bytes changed (subscribe to persist). */
  readonly onLibraryChanged: EventHook<StampLibraryChange>;
}
