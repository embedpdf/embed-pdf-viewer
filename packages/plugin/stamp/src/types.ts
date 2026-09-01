import type { BinarySource, Engine } from '@embedpdf/engine-core/runtime';
import { createCapabilityToken } from '@embedpdf/core';
import type { FormScriptingOptions } from '@embedpdf/plugin-form/contract';

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
 * One asset's SERIALIZABLE descriptor. The bytes and the cached preview are
 * deliberately NOT here — the reducer state stays pure/serializable (kernel
 * rule 1); binary lives in the capability and crosses only as call
 * arguments/returns, mirroring the engine's own BinarySource rule.
 */
export interface StampAsset {
  id: string;
  libraryId: string;
  kind: StampAssetKind;
  name: string;
  /** Intrinsic size in PDF points (the source page's crop box / image pixels 1:1). */
  size: { width: number; height: number };
  /** What the asset bytes are: a single-page vector PDF, or a raster image. */
  format: 'pdf' | 'png' | 'jpeg';
  /** Canonical library page identity; present for PDF-backed libraries. */
  pageObjectNumber?: number;
  subject?: string;
  categories?: string[];
}

/** A named group of assets — one imported PDF becomes one library. */
export interface StampLibrary {
  id: string;
  name: string;
  /** PDF-backed libraries own canonical bytes; loose libraries are raster/pre-sliced conveniences. */
  storage: 'canonical-pdf' | 'loose';
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
  | { type: 'LIBRARY_REMOVED'; libraryId: string }
  | { type: 'ASSET_ADDED'; asset: StampAsset }
  | { type: 'ASSET_REMOVED'; assetId: string };

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
  /** Cached preview width in device px (import-time render). Default 256. */
  previewWidth?: number;
  /**
   * Opt-in Acrobat JavaScript evaluation for form-backed PDF stamp assets.
   * On arm, the plugin recalculates a temporary copy using the target
   * document's identity/name/clock, flattens it, and arms the resulting
   * static page. Canonical library and derived base bytes stay unchanged.
   */
  scripting?: FormScriptingOptions;
}

export interface ImportLibraryOptions {
  /** Library display name. Default `'Stamps'`. */
  name?: string;
  /** Library categories written to catalog `/PieceInfo`. */
  categories?: string[];
  /** Kind stamped onto every imported asset. Default `'stamp'`. */
  kind?: StampAssetKind;
  /** Per-page asset names; default `Stamp <n>`. */
  assetName?: (pageIndex: number) => string;
}

export interface AddAssetInput {
  /** Target library; omitted → a new single-asset library named after the asset. */
  libraryId?: string;
  name: string;
  kind?: StampAssetKind;
  subject?: string;
  categories?: string[];
  /** Single-page PDF (vector) or PNG/JPEG bytes. */
  source: BinarySource;
  /**
   * Paintable preview for pickers + the hover ghost. Loose PDF assets cannot
   * derive one without opening the PDF; canonical libraries render it after
   * insertion. Raster sources default to their own bytes.
   */
  preview?: BinarySource;
  /** Intrinsic size in PDF points. Required for PDF sources; rasters are sniffed. */
  size?: { width: number; height: number };
}

/** A cached, browser-paintable render of an asset (PNG from import; raster assets as-is). */
export interface StampAssetPreview {
  bytes: Uint8Array;
  mimeType: string;
}

export interface StampCapability {
  // ── selectors (pure reads over serializable state) ──
  libraries(): StampLibrary[];
  library(id: string): StampLibrary | null;
  /** Assets of one library, in library order — or every asset when omitted. */
  assets(libraryId?: string): StampAsset[];
  asset(id: string): StampAsset | null;
  // ── binary reads (capability-held, never store state) ──
  /** The asset's paintable preview, or null while none is cached. */
  assetPreview(id: string): StampAssetPreview | null;
  /** Placement bytes; derived from the canonical page for PDF-backed libraries. */
  assetBytes(id: string): Uint8Array | null;
  /** Canonical library PDF bytes, or null for a loose library/unknown id. */
  libraryBytes(id: string): Uint8Array | null;
  // ── library intents ──
  /**
   * Import a PDF as a stamp library: every page becomes one vector asset
   * (single-page PDF bytes + a cached preview render). Uses the asset
   * engine; in a cloud deployment without one configured this rejects with
   * an actionable error. Resolves to the new library id.
   */
  importLibraryPdf(source: BinarySource, opts?: ImportLibraryOptions): Promise<string>;
  /**
   * Add a single asset. A PDF added to a canonical library is inserted as a
   * page and receives `/PieceInfo`; loose assets keep their bytes directly.
   * Raster input cannot be appended to a canonical PDF library.
   */
  addAsset(input: AddAssetInput): Promise<string>;
  /** Remove an asset, deleting its canonical page before state changes when PDF-backed. */
  removeAsset(id: string): Promise<void>;
  /** Remove a library and every asset in it, ordered with in-flight library mutations. */
  removeLibrary(id: string): Promise<void>;
  // ── placement (delegates to the annotation plugin of the named document) ──
  /**
   * Arm an asset on a document: the next click on that document's pages
   * places it (and the hover ghost previews the exact placement). With
   * scripting enabled, form-backed PDFs are evaluated against that target
   * document and flattened first. Rides `annotation.armStamp` — bytes,
   * preview, and intrinsic size all travel along, so vector stamps keep
   * their true aspect.
   */
  armAsset(documentId: string, assetId: string, opts?: { targetWidth?: number }): Promise<void>;
  /** Disarm the stamp tool on a document. */
  disarm(documentId: string): void;
}

export const StampToken = createCapabilityToken<StampCapability>('stamp');
