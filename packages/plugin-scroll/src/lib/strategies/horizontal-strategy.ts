import { PdfPageObjectWithRotatedSize } from '@embedpdf/models';
import { Size } from '@embedpdf/models';
import { ViewportMetrics } from '@embedpdf/plugin-viewport';
import { BaseScrollStrategy, ScrollStrategyConfig } from './base-strategy';
import { VirtualItem, PageLayout } from '../types/virtual-item';

export class HorizontalScrollStrategy extends BaseScrollStrategy {
  constructor(config: ScrollStrategyConfig) {
    super(config);
  }

  createVirtualItems(pdfPageObject: PdfPageObjectWithRotatedSize[][]): VirtualItem[] {
    let xOffset = 0;
    return pdfPageObject.map((pagesInSpread, index) => {
      let pageX = 0;
      const pageLayouts: PageLayout[] = pagesInSpread.map((page) => {
        const layout: PageLayout = {
          pageNumber: page.index + 1,
          pageIndex: page.index,
          x: pageX,
          y: 0,
          width: page.size.width,
          height: page.size.height,
          rotatedWidth: page.rotatedSize.width,
          rotatedHeight: page.rotatedSize.height,
          elevated: false,
        };
        pageX += page.rotatedSize.width + this.pageGap;
        return layout;
      });
      const width = pagesInSpread.reduce(
        (sum, page, i) =>
          sum + page.rotatedSize.width + (i < pagesInSpread.length - 1 ? this.pageGap : 0),
        0,
      );
      const height = Math.max(...pagesInSpread.map((p) => p.rotatedSize.height));
      const item: VirtualItem = {
        id: `item-${index}`,
        x: xOffset,
        y: 0,
        offset: xOffset,
        width,
        height,
        pageLayouts,
        pageNumbers: pagesInSpread.map((p) => p.index + 1),
        index,
      };
      xOffset += width + this.pageGap;
      return item;
    });
  }

  getTotalContentSize(virtualItems: VirtualItem[]): { width: number; height: number } {
    if (virtualItems.length === 0) return { width: 0, height: 0 };
    const totalWidth =
      virtualItems[virtualItems.length - 1].x + virtualItems[virtualItems.length - 1].width;
    const maxHeight = Math.max(...virtualItems.map((item) => item.height));
    return {
      width: totalWidth,
      height: maxHeight,
    };
  }

  protected getScrollOffset(viewport: ViewportMetrics): number {
    return viewport.scrollLeft;
  }

  protected getClientSize(viewport: ViewportMetrics): number {
    return viewport.clientWidth;
  }

  /** Horizontal scroll: extent along scroll axis is width. */
  protected getItemSizeAlongScrollAxis(item: VirtualItem): number {
    return item.width;
  }

  /**
   * No centering for horizontal layout. Items are laid out in a simple row;
   * using total content width would produce incorrect offsets and shift pages.
   */
  /* eslint-disable no-unused-vars -- override intentionally ignores params */
  protected getCenteringOffsetX(_item: VirtualItem, _totalContentSize: Size | undefined): number {
    return 0;
  }

  /**
   * Horizontal rows visually center shorter items within the tallest row height.
   * Match that DOM layout so page-coordinate targeting lands on the rendered page.
   */
  protected getCenteringOffsetY(item: VirtualItem, totalContentSize: Size | undefined): number {
    if (!totalContentSize || item.height >= totalContentSize.height) return 0;
    return (totalContentSize.height - item.height) / 2;
  }
}
