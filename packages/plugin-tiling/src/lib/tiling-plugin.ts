import {
  BasePlugin,
  createBehaviorEmitter,
  Listener,
  PluginRegistry,
  REFRESH_PAGES,
  RefreshPagesAction,
} from '@embedpdf/core';
import { ignore } from '@embedpdf/models';
import { RenderCapability, RenderPlugin } from '@embedpdf/plugin-render';
import {
  ScrollCapability,
  ScrollMetrics,
  ScrollPlugin,
  ScrollEvent,
} from '@embedpdf/plugin-scroll';
import { ViewportCapability, ViewportPlugin } from '@embedpdf/plugin-viewport';

import { initTilingState, cleanupTilingState, markTileStatus, updateVisibleTiles } from './actions';
import { initialTilingDocumentState } from './reducer';
import {
  TilingPluginConfig,
  TilingCapability,
  Tile,
  RenderTileOptions,
  TilingState,
  TilingEvent,
  TilingScope,
} from './types';
import { calculateTilesForPage } from './utils';

export class TilingPlugin extends BasePlugin<TilingPluginConfig, TilingCapability, TilingState> {
  static readonly id = 'tiling' as const;

  private readonly tileRendering$ = createBehaviorEmitter<TilingEvent>();

  private config: TilingPluginConfig;
  private renderCapability: RenderCapability;
  private scrollCapability: ScrollCapability;
  private viewportCapability: ViewportCapability;

  constructor(id: string, registry: PluginRegistry, config: TilingPluginConfig) {
    super(id, registry);

    this.config = config;

    this.renderCapability = this.registry.getPlugin<RenderPlugin>('render')!.provides();
    this.scrollCapability = this.registry.getPlugin<ScrollPlugin>('scroll')!.provides();
    this.viewportCapability = this.registry.getPlugin<ViewportPlugin>('viewport')!.provides();

    this.scrollCapability.onScroll(
      (event: ScrollEvent) => this.calculateVisibleTiles(event.documentId, event.metrics),
      {
        mode: 'throttle',
        wait: 50,
        throttleMode: 'trailing',
      },
    );

    this.coreStore.onAction(REFRESH_PAGES, (action) => this.recalculateTiles(action.payload));
  }

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initTilingState(documentId, initialTilingDocumentState));
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupTilingState(documentId));
  }

  protected override onScaleChanged(documentId: string): void {
    this.recalculateTilesForDocument(documentId);
  }

  protected override onRotationChanged(documentId: string): void {
    this.recalculateTilesForDocument(documentId);
  }

  private recalculateTilesForDocument(documentId: string): void {
    const scrollScope = this.scrollCapability.forDocument(documentId);
    const viewportScope = this.viewportCapability.forDocument(documentId);
    const metrics = scrollScope.getMetrics(viewportScope.getMetrics());
    this.calculateVisibleTiles(documentId, metrics);
  }

  async recalculateTiles(payload: RefreshPagesAction['payload']): Promise<void> {
    const { documentId, pageIndexes } = payload;
    const coreDoc = this.getCoreDocument(documentId);
    if (!coreDoc || !coreDoc.document) return;

    const scrollScope = this.scrollCapability.forDocument(documentId);
    const viewportScope = this.viewportCapability.forDocument(documentId);
    const currentMetrics = scrollScope.getMetrics(viewportScope.getMetrics());

    // Recalculate tiles for refreshed pages with a new timestamp
    const refreshedTiles: Record<number, Tile[]> = {};
    const refreshTimestamp = Date.now();
    const scale = coreDoc.scale;
    const rotation = coreDoc.rotation;

    for (const pageIndex of pageIndexes) {
      const metric = currentMetrics.pageVisibilityMetrics.find(
        (m) => m.pageNumber === pageIndex + 1,
      );
      if (!metric) continue;

      const page = coreDoc.document.pages[pageIndex];
      if (!page) continue;

      refreshedTiles[pageIndex] = calculateTilesForPage({
        page,
        metric,
        scale,
        rotation,
        tileSize: this.config.tileSize,
        overlapPx: this.config.overlapPx,
        extraRings: this.config.extraRings,
      }).map((tile) => ({
        ...tile,
        id: `${tile.id}-r${refreshTimestamp}`, // Add refresh token to force new render
      }));
    }

    if (Object.keys(refreshedTiles).length > 0) {
      this.dispatch(updateVisibleTiles(documentId, refreshedTiles));
    }
  }

  async initialize(): Promise<void> {
    // Fetch dependencies from the registry if needed
  }

  private calculateVisibleTiles(documentId: string, scrollMetrics: ScrollMetrics): void {
    if (!this.config.enabled) {
      this.dispatch(updateVisibleTiles(documentId, {}));
      return;
    }

    const coreDoc = this.getCoreDocument(documentId);
    if (!coreDoc || !coreDoc.document) return;

    const scale = coreDoc.scale;
    const rotation = coreDoc.rotation;
    const visibleTiles: { [pageIndex: number]: Tile[] } = {};

    for (const scrollMetric of scrollMetrics.pageVisibilityMetrics) {
      const pageIndex = scrollMetric.pageNumber - 1; // Convert to 0-based index
      const page = coreDoc.document.pages[pageIndex];
      if (!page) continue;

      // Calculate tiles for the page using the utility function
      const tiles = calculateTilesForPage({
        page,
        metric: scrollMetric,
        scale,
        rotation,
        tileSize: this.config.tileSize,
        overlapPx: this.config.overlapPx,
        extraRings: this.config.extraRings,
      });

      visibleTiles[pageIndex] = tiles;
    }

    this.dispatch(updateVisibleTiles(documentId, visibleTiles));
  }

  override onStoreUpdated(prevState: TilingState, newState: TilingState): void {
    for (const documentId in newState.documents) {
      const prevDoc = prevState.documents[documentId];
      const newDoc = newState.documents[documentId];
      if (prevDoc !== newDoc) {
        this.tileRendering$.emit({ documentId, tiles: newDoc.visibleTiles });
      }
    }
  }

  protected buildCapability(): TilingCapability {
    return {
      renderTile: this.renderTile.bind(this),
      forDocument: this.createTilingScope.bind(this),
      onTileRendering: this.tileRendering$.on,
    };
  }

  private createTilingScope(documentId: string): TilingScope {
    return {
      renderTile: (options) => this.renderTile(options, documentId),
      onTileRendering: (listener: Listener<Record<number, Tile[]>>) =>
        this.tileRendering$.on((event) => {
          if (event.documentId === documentId) listener(event.tiles);
        }),
    };
  }

  private renderTile(options: RenderTileOptions, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    if (!this.renderCapability) {
      throw new Error('Render capability not available.');
    }

    this.dispatch(markTileStatus(id, options.pageIndex, options.tile.id, 'rendering'));

    const task = this.renderCapability.forDocument(id).renderPageRect({
      pageIndex: options.pageIndex,
      rect: options.tile.pageRect,
      options: {
        scaleFactor: options.tile.srcScale,
        dpr: options.dpr,
      },
    });

    task.wait(() => {
      this.dispatch(markTileStatus(id, options.pageIndex, options.tile.id, 'ready'));
    }, ignore);

    return task;
  }
}
