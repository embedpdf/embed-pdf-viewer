import {
  PdfPageObjectWithRotatedSize,
  Position,
  Rect,
  Rotation,
  scalePosition,
  Size,
  transformPosition,
  transformRect,
} from '@embedpdf/models';
import { ViewportMetrics } from '@embedpdf/plugin-viewport';
import { VirtualItem } from '../types/virtual-item';
import { ScrollMetrics } from '../types';

export interface ScrollStrategyConfig {
  pageGap?: number;
  viewportGap?: number;
  bufferSize?: number;
}

export abstract class BaseScrollStrategy {
  protected pageGap: number;
  protected viewportGap: number;
  protected bufferSize: number;

  constructor(config: ScrollStrategyConfig) {
    this.pageGap = config.pageGap ?? 20;
    this.viewportGap = config.viewportGap ?? 20;
    this.bufferSize = config.bufferSize ?? 2;
  }

  abstract createVirtualItems(pdfPageObject: PdfPageObjectWithRotatedSize[][]): VirtualItem[];
  abstract getTotalContentSize(virtualItems: VirtualItem[]): Size;
  protected abstract getScrollOffset(viewport: ViewportMetrics): number;
  protected abstract getClientSize(viewport: ViewportMetrics): number;

  /**
   * Returns the item's extent along the scroll axis. Vertical layout uses height;
   * horizontal layout uses width. Used for visible range and end spacing calculations.
   */
  protected abstract getItemSizeAlongScrollAxis(item: VirtualItem): number;

  /**
   * Horizontal centering offset for items narrower than the content max width.
   * Vertical layout centers spreads within the row; horizontal layout overrides to 0
   * since items stay in a simple row without centering.
   */
  protected getCenteringOffsetX(_item: VirtualItem, totalContentSize: Size | undefined): number {
    if (!totalContentSize || _item.width >= totalContentSize.width) return 0;
    return (totalContentSize.width - _item.width) / 2;
  }

  /**
   * Vertical centering offset for items shorter than the content max height.
   * Horizontal layout centers items within the row height; vertical layout keeps
   * items top-aligned and uses the default of 0.
   */
  protected getCenteringOffsetY(_item: VirtualItem, _totalContentSize: Size | undefined): number {
    return 0;
  }

  protected getVisibleRange(
    viewport: ViewportMetrics,
    virtualItems: VirtualItem[],
    scale: number,
  ): { start: number; end: number } {
    const scrollOffset = this.getScrollOffset(viewport);
    const clientSize = this.getClientSize(viewport);
    const viewportStart = scrollOffset;
    const viewportEnd = scrollOffset + clientSize;

    // Use extent along scroll axis (height for vertical, width for horizontal)
    let startIndex = 0;
    while (
      startIndex < virtualItems.length &&
      (virtualItems[startIndex].offset +
        this.getItemSizeAlongScrollAxis(virtualItems[startIndex])) *
        scale <=
        viewportStart
    ) {
      startIndex++;
    }

    let endIndex = startIndex;
    while (endIndex < virtualItems.length && virtualItems[endIndex].offset * scale <= viewportEnd) {
      endIndex++;
    }

    return {
      start: Math.max(0, startIndex - this.bufferSize),
      end: Math.min(virtualItems.length - 1, endIndex + this.bufferSize - 1),
    };
  }

  handleScroll(
    viewport: ViewportMetrics,
    virtualItems: VirtualItem[],
    scale: number,
  ): ScrollMetrics {
    const range = this.getVisibleRange(viewport, virtualItems, scale);
    const visibleItems = virtualItems.slice(range.start, range.end + 1);
    const totalContentSize = this.getTotalContentSize(virtualItems);
    const pageVisibilityMetrics = this.calculatePageVisibility(
      visibleItems,
      viewport,
      scale,
      totalContentSize,
    );
    const visiblePages = pageVisibilityMetrics.map((m) => m.pageNumber);
    const renderedPageIndexes = virtualItems
      .slice(range.start, range.end + 1)
      .flatMap((item) => item.index);
    const currentPage = this.determineCurrentPage(pageVisibilityMetrics);
    const first = virtualItems[range.start];
    const last = virtualItems[range.end];
    const startSpacing = first ? first.offset * scale : 0;
    const lastItem = virtualItems[virtualItems.length - 1];
    // End spacing = distance from last rendered item to end of content (uses extent along scroll axis)
    const endSpacing = last
      ? (lastItem.offset + this.getItemSizeAlongScrollAxis(lastItem)) * scale -
        (last.offset + this.getItemSizeAlongScrollAxis(last)) * scale
      : 0;

    return {
      currentPage,
      visiblePages,
      pageVisibilityMetrics,
      renderedPageIndexes,
      scrollOffset: { x: viewport.scrollLeft, y: viewport.scrollTop },
      startSpacing,
      endSpacing,
    };
  }

  protected calculatePageVisibility(
    virtualItems: VirtualItem[],
    viewport: ViewportMetrics,
    scale: number,
    totalContentSize?: Size,
  ): ScrollMetrics['pageVisibilityMetrics'] {
    const visibilityMetrics: ScrollMetrics['pageVisibilityMetrics'] = [];

    virtualItems.forEach((item) => {
      const centeringOffsetX = this.getCenteringOffsetX(item, totalContentSize);
      const centeringOffsetY = this.getCenteringOffsetY(item, totalContentSize);

      item.pageLayouts.forEach((page) => {
        const itemX = (item.x + centeringOffsetX) * scale;
        const itemY = (item.y + centeringOffsetY) * scale;
        const pageX = itemX + page.x * scale;
        const pageY = itemY + page.y * scale;
        const pageWidth = page.rotatedWidth * scale;
        const pageHeight = page.rotatedHeight * scale;

        const viewportLeft = viewport.scrollLeft;
        const viewportTop = viewport.scrollTop;
        const viewportRight = viewportLeft + viewport.clientWidth;
        const viewportBottom = viewportTop + viewport.clientHeight;

        const intersectionLeft = Math.max(pageX, viewportLeft);
        const intersectionTop = Math.max(pageY, viewportTop);
        const intersectionRight = Math.min(pageX + pageWidth, viewportRight);
        const intersectionBottom = Math.min(pageY + pageHeight, viewportBottom);

        if (intersectionLeft < intersectionRight && intersectionTop < intersectionBottom) {
          const visibleWidth = intersectionRight - intersectionLeft;
          const visibleHeight = intersectionBottom - intersectionTop;
          const totalArea = pageWidth * pageHeight;
          const visibleArea = visibleWidth * visibleHeight;

          visibilityMetrics.push({
            pageNumber: page.pageNumber,
            viewportX: intersectionLeft - viewportLeft,
            viewportY: intersectionTop - viewportTop,
            visiblePercentage: (visibleArea / totalArea) * 100,
            original: {
              pageX: (intersectionLeft - pageX) / scale,
              pageY: (intersectionTop - pageY) / scale,
              visibleWidth: visibleWidth / scale,
              visibleHeight: visibleHeight / scale,
              scale: 1,
            },
            scaled: {
              pageX: intersectionLeft - pageX,
              pageY: intersectionTop - pageY,
              visibleWidth,
              visibleHeight,
              scale,
            },
          });
        }
      });
    });

    return visibilityMetrics;
  }

  protected determineCurrentPage(
    visibilityMetrics: ScrollMetrics['pageVisibilityMetrics'],
  ): number {
    if (visibilityMetrics.length === 0) return 1;

    const maxVisibility = Math.max(...visibilityMetrics.map((m) => m.visiblePercentage));
    const mostVisiblePages = visibilityMetrics.filter((m) => m.visiblePercentage === maxVisibility);

    return mostVisiblePages.length === 1
      ? mostVisiblePages[0].pageNumber
      : mostVisiblePages.sort((a, b) => a.pageNumber - b.pageNumber)[0].pageNumber;
  }

  private getRectLocationForPage(
    pageNumber: number,
    virtualItems: VirtualItem[],
    totalContentSize?: Size,
  ): Rect | null {
    // Find the virtual item containing the page
    const item = virtualItems.find((item) => item.pageNumbers.includes(pageNumber));
    if (!item) return null;

    // Find the specific page layout for the requested page number
    const pageLayout = item.pageLayouts.find((layout) => layout.pageNumber === pageNumber);
    if (!pageLayout) return null;

    const centeringOffsetX = this.getCenteringOffsetX(item, totalContentSize);
    const centeringOffsetY = this.getCenteringOffsetY(item, totalContentSize);

    return {
      origin: {
        x: item.x + pageLayout.x + centeringOffsetX,
        y: item.y + pageLayout.y + centeringOffsetY,
      },
      size: {
        width: pageLayout.width,
        height: pageLayout.height,
      },
    };
  }

  getScrollPositionForPage(
    pageNumber: number,
    virtualItems: VirtualItem[],
    scale: number,
    rotation: Rotation,
    pageCoordinates?: { x: number; y: number },
  ): Position | null {
    const totalContentSize = this.getTotalContentSize(virtualItems);
    const pageRect = this.getRectLocationForPage(pageNumber, virtualItems, totalContentSize);
    if (!pageRect) return null;

    const scaledBasePosition = scalePosition(pageRect.origin, scale);

    // If specific page coordinates are provided, add them to the base position
    if (pageCoordinates) {
      const rotatedSize = transformPosition(
        {
          width: pageRect.size.width,
          height: pageRect.size.height,
        },
        {
          x: pageCoordinates.x,
          y: pageCoordinates.y,
        },
        rotation,
        scale,
      );

      return {
        x: scaledBasePosition.x + rotatedSize.x + this.viewportGap,
        y: scaledBasePosition.y + rotatedSize.y + this.viewportGap,
      };
    }

    return {
      x: scaledBasePosition.x + this.viewportGap,
      y: scaledBasePosition.y + this.viewportGap,
    };
  }

  getRectPositionForPage(
    pageNumber: number,
    virtualItems: VirtualItem[],
    scale: number,
    rotation: Rotation,
    rect: Rect,
  ): Rect | null {
    const totalContentSize = this.getTotalContentSize(virtualItems);
    const pageRect = this.getRectLocationForPage(pageNumber, virtualItems, totalContentSize);
    if (!pageRect) return null;

    const scaledBasePosition = scalePosition(pageRect.origin, scale);

    const rotatedSize = transformRect(
      {
        width: pageRect.size.width,
        height: pageRect.size.height,
      },
      rect,
      rotation,
      scale,
    );

    return {
      origin: {
        x: scaledBasePosition.x + rotatedSize.origin.x,
        y: scaledBasePosition.y + rotatedSize.origin.y,
      },
      size: rotatedSize.size,
    };
  }
}
