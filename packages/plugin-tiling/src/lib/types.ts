import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  ImageConversionTypes,
  PdfErrorReason,
  PdfPageObject,
  Rect,
  Rotation,
  Task,
} from '@embedpdf/models';
import { PageVisibilityMetrics } from '@embedpdf/plugin-scroll';

export interface TilingPluginConfig extends BasePluginConfig {
  tileSize: number;
  overlapPx: number;
  extraRings: number;
  /**
   * Optional image type override for tile rendering.
   * When omitted, tile rendering falls back to the render plugin defaults.
   */
  defaultImageType?: ImageConversionTypes;
}

export interface VisibleRect {
  pageX: number;
  pageY: number;
  visibleWidth: number;
  visibleHeight: number;
}

export type TileStatus = 'queued' | 'rendering' | 'ready';

export interface Tile {
  status: TileStatus;
  screenRect: Rect;
  pageRect: Rect;
  isFallback: boolean;
  srcScale: number;
  col: number;
  row: number;
  id: string;
}

export interface TilingDocumentState {
  visibleTiles: Record<number, Tile[]>;
}

export interface TilingState {
  documents: Record<string, TilingDocumentState>;
}

export interface TilingEvent {
  documentId: string;
  tiles: Record<number, Tile[]>;
}

export interface TilingScope {
  /**
   * Render a single tile as an `ImageBitmap`.
   *
   * Returns a fresh (uncached) bitmap per call — no deduplication.
   * **Caller owns the bitmap** — transfer it to a canvas or call
   * `bitmap.close()` to free GPU memory.
   */
  renderTile: (options: RenderTileOptions) => Task<ImageBitmap, PdfErrorReason>;
  onTileRendering: EventHook<Record<number, Tile[]>>;
}

export interface TilingCapability {
  /** {@inheritDoc TilingScope.renderTile} */
  renderTile: (
    options: RenderTileOptions,
    documentId?: string,
  ) => Task<ImageBitmap, PdfErrorReason>;
  forDocument(documentId: string): TilingScope;
  onTileRendering: EventHook<TilingEvent>;
}

export interface CalculateTilesForPageOptions {
  tileSize: number;
  overlapPx: number;
  extraRings: number;
  scale: number;
  rotation: Rotation;
  page: PdfPageObject;
  metric: PageVisibilityMetrics;
}

export interface RenderTileOptions {
  pageIndex: number;
  tile: Tile;
  dpr: number;
  /**
   * Optional image type override for this tile render.
   * Falls back to the tiling plugin config, then to the render plugin default.
   */
  imageType?: ImageConversionTypes;
}
