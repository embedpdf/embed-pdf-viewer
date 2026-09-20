import type { BinarySource, Engine } from '@embedpdf/engine-core/runtime';
import { createCapabilityToken, type EventHook } from '@embedpdf/core';
import type { AnnotationRef, PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { StampPlacement } from '@embedpdf/plugin-annotation/contract';

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

export interface StampLibraryQuery {
  /** One kind or several; omitted = every library. */
  kind?: StampLibraryKind | readonly StampLibraryKind[];
}

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
  pageObjectNumber: number;
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

export interface StampState {
  libraries: Record<string, StampLibrary>;
  /** Library display order (insertion order). */
  libraryOrder: string[];
  assets: Record<string, StampAsset>;
}

export type StampAction =
  | { type: 'LIBRARY_ADDED'; library: StampLibrary }
  | { type: 'LIBRARY_UPDATED'; library: StampLibrary }
  | { type: 'LIBRARY_REMOVED'; libraryId: string }
  | { type: 'ASSET_ADDED'; asset: StampAsset }
  | { type: 'ASSET_UPDATED'; asset: StampAsset }
  | { type: 'ASSET_REMOVED'; assetId: string };

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

export interface StampCapability {
  // ── selectors (pure reads over serializable state) ──
  libraries(query?: StampLibraryQuery): StampLibrary[];
  library(id: string): StampLibrary | null;
  /** Assets of one library, in library order — or every asset when omitted. */
  assets(libraryId?: string): StampAsset[];
  asset(id: string): StampAsset | null;
  // ── binary reads (capability-held, never store state) ──
  /** The asset's paintable preview, or null while none is cached. */
  assetPreview(id: string): StampAssetPreview | null;
  /** Placement bytes; derived from the canonical page for PDF-backed libraries. */
  assetBytes(id: string): Uint8Array | null;
  // ── library intents ──
  /**
   * A new, empty library: a PDF with the given title and no registered
   * stamps yet (like Acrobat, it carries one unregistered blank page so it
   * is a valid file from the start). Resolves to the library id; feed it to
   * `addAsset({ libraryId })` to fill it.
   */
  createLibrary(
    name: string,
    opts?: { id?: string; kind?: StampLibraryKind; categories?: string[] },
  ): Promise<string>;
  /** Rename (the PDF's `/Title`) or re-categorise a library. */
  updateLibrary(id: string, patch: { name?: string; categories?: string[] }): Promise<void>;
  /**
   * Import a PDF as a stamp library: every page becomes one vector asset
   * (single-page PDF bytes + a cached preview render). Uses the asset
   * engine; in a cloud deployment without one configured this rejects with
   * an actionable error. Resolves to the new library id.
   */
  importLibraryPdf(source: BinarySource, opts?: ImportLibraryOptions): Promise<string>;
  /**
   * Add a single asset as a page of its library (a raster is flattened into
   * a fresh page first) and register it under `identifier=label`. Without
   * `libraryId`, a new library named after the label is created for it.
   */
  addAsset(input: AddAssetInput): Promise<string>;
  /**
   * Turn selected annotations of an open document into an asset: their
   * appearances are exported by the engine as ONE single-page PDF sized to
   * their union rect (vector, positions preserved — exactly what the page
   * shows) and added like any PDF asset. The identifier defaults to an
   * Acrobat-style `#…` one so the stamp keeps its identity in Acrobat.
   * Rejects when any ref is not on `pageObjectNumber`, is hidden, or has no
   * appearance (all-or-nothing: a stamp missing a part is worse than an error).
   */
  addAssetFromAnnotations(
    documentId: string,
    pageObjectNumber: PageObjectNumber,
    refs: AnnotationRef[],
    input: Omit<AddAssetInput, 'source' | 'size'>,
  ): Promise<string>;
  /** Remove an asset, deleting its canonical page before state changes when PDF-backed. */
  removeAsset(id: string): Promise<void>;
  /** Remove a library and every asset in it, ordered with in-flight library mutations. */
  removeLibrary(id: string): Promise<void>;
  /**
   * Relabel an asset (the registry key is renamed in one job), set or clear
   * its `/Subj` override, or replace its categories. The identifier never
   * changes — it is the asset's identity and every placed stamp's `/Name`.
   */
  updateAsset(
    id: string,
    patch: { label?: string; subject?: string | null; categories?: string[] },
  ): Promise<void>;
  /**
   * The library as a PDF — its title, its named pages, its artwork: the
   * complete, Acrobat-readable file. This IS the persistence format: store
   * these bytes wherever you like and `importLibraryPdf` them back.
   */
  exportLibrary(id: string): Uint8Array | null;
  /** Fires after every change to a library's canonical bytes — subscribe to persist. */
  onLibraryChanged: EventHook<StampLibraryChange>;
  // ── placement (delegates to the annotation plugin of the named document) ──
  /**
   * Arm an asset on a document: the next click on that document's pages
   * places it (and the hover ghost previews the exact placement). With
   * scripting on (the actions plugin's `javascript` switch), form-backed
   * PDFs are evaluated against that target document in a detached realm and
   * flattened first. Rides `annotation.armStamp` — bytes,
   * preview, and intrinsic size all travel along, so vector stamps keep
   * their true aspect.
   */
  armAsset(documentId: string, assetId: string, opts?: { targetWidth?: number }): Promise<void>;
  /**
   * Place an asset WITHOUT the pointer: the same materialization, name,
   * subject, fit, and page clamp a click after `armAsset` would produce —
   * one placement law, two entry points. Resolves to the new annotation.
   */
  placeAsset(
    documentId: string,
    assetId: string,
    placement: StampPlacement,
  ): Promise<AnnotationRef>;
  /** Disarm the stamp tool on a document. */
  disarm(documentId: string): void;
  /** The asset armed on a document through {@link armAsset}, while the annotation plugin still holds it. */
  armedAsset(documentId: string): StampAsset | null;
}

export const StampToken = createCapabilityToken<StampCapability>('stamp');
