import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { PdfErrorReason, PdfPageObject, Rect, Rotation, Task } from '@embedpdf/models';
import { PageVisibilityMetrics } from '@embedpdf/plugin-scroll';

export interface TilingPluginConfig extends BasePluginConfig {
  tileSize: number;
  overlapPx: number;
  extraRings: number;
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
  renderTile: (options: RenderTileOptions) => Task<Blob, PdfErrorReason>;
  onTileRendering: EventHook<Record<number, Tile[]>>;
}

export interface TilingCapability {
  renderTile: (options: RenderTileOptions, documentId?: string) => Task<Blob, PdfErrorReason>;
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
}
