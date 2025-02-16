import { NavigationState, ViewportRegion, ViewportState } from "../types";

export interface ViewportTrackerOptions {
  container: HTMLElement;
  state: NavigationState;
}

const CONTAINER_PADDING = 32;
const PAGE_GAP = 20;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

export class ViewportTracker {
  private container: HTMLElement;
  private state: NavigationState;
  private cachedPagePositions: Map<number, {top: number, height: number}> | null = null;
  private lastZoomLevel: number | null = null;
  
  constructor(options: ViewportTrackerOptions) {
    this.container = options.container;
    this.state = options.state;
  }

  private calculatePagePositions(zoomLevel: number): Map<number, {top: number, height: number}> {
    let accumulatedHeight = 0 // Start with top padding;
    const pagePositions = new Map<number, {top: number, height: number}>();
    
    this.state.pages.forEach((page, index) => {
      const pageHeight = page.page.size.height * zoomLevel;
      pagePositions.set(index + 1, {
        top: accumulatedHeight,
        height: pageHeight
      });
      accumulatedHeight += pageHeight + PAGE_GAP; // 20px gap
    });

    this.cachedPagePositions = pagePositions;
    this.lastZoomLevel = zoomLevel;
    return pagePositions;
  }

  public getPagePositions(): Map<number, {top: number, height: number}> {
    if (this.lastZoomLevel === this.state.zoomLevel && this.cachedPagePositions) {
      return this.cachedPagePositions;
    }
    return this.calculatePagePositions(this.state.currentZoomLevel);
  }

  public getViewportState(): ViewportState {
    const regions: ViewportRegion[] = [];
    
    const scrollTop = this.container.scrollTop;
    const scrollLeft = this.container.scrollLeft;
    const viewportWidth = this.container.clientWidth;
    const viewportHeight = this.container.clientHeight;
    const zoomLevel = this.state.currentZoomLevel;

    // Use cached positions if zoom level hasn't changed
    const pagePositions = this.getPagePositions();

    // For each page, calculate visibility
    this.state.pages.forEach((page, index) => {
      const pageNumber = index + 1;
      const pagePos = pagePositions.get(pageNumber)!;
      
      // Calculate page rect in document coordinates
      const pageRect = {
        top: pagePos.top + CONTAINER_PADDING - scrollTop,
        left: CONTAINER_PADDING - scrollLeft,
        width: page.page.size.width * zoomLevel,
        height: pagePos.height
      };

      // Viewport rect is always at 0,0 with viewport dimensions
      const viewportRect = {
        top: 0,
        left: 0,
        width: viewportWidth,
        height: viewportHeight
      };

      const intersection = this.calculateIntersection(pageRect, viewportRect);

      if (intersection) {
        // Convert intersection back to absolute coordinates
        const absoluteIntersection = {
          left: intersection.left + scrollLeft - CONTAINER_PADDING, // Subtract padding for correct absolute position
          top: intersection.top + scrollTop - CONTAINER_PADDING,
          width: intersection.width,
          height: intersection.height
        };

        // Convert to PDF units
        const pdfCoords = this.screenToPdfUnits({
          x: absoluteIntersection.left,
          y: absoluteIntersection.top - pagePos.top // Relative to page top
        }, zoomLevel);

        const visibleDimensions = this.screenToPdfUnits({
          x: intersection.width,
          y: intersection.height
        }, zoomLevel);

        const totalArea = (page.page.size.width * zoomLevel) * pagePos.height;
        const visibleArea = intersection.width * intersection.height;
        const visiblePercentage = (visibleArea / totalArea) * 100;

        regions.push({
          pageNumber,
          viewportX: intersection.left,
          viewportY: intersection.top,
          pageX: pdfCoords.x,
          pageY: pdfCoords.y,
          visibleWidth: visibleDimensions.x,
          visibleHeight: visibleDimensions.y,
          visiblePercentage
        });
      }
    });

    const viewportState = {
      zoomLevel: this.state.currentZoomLevel,
      pagePositions: pagePositions,
      viewportRegions: regions,
    };

    return viewportState;
  }

  private calculateIntersection(
    rect1: Rect,
    rect2: Rect
  ): Rect | null {
    const left = Math.max(rect1.left, rect2.left);
    const top = Math.max(rect1.top, rect2.top);
    const right = Math.min(rect1.left + rect1.width, rect2.left + rect2.width);
    const bottom = Math.min(rect1.top + rect1.height, rect2.top + rect2.height);

    if (right >= left && bottom >= top) {
      return {
        left,
        top,
        width: right - left,
        height: bottom - top
      };
    }
    return null;
  }

  private screenToPdfUnits(
    screen: { x: number; y: number },
    zoomLevel: number
  ): Point {
    return {
      x: (screen.x / zoomLevel),
      y: (screen.y / zoomLevel)
    };
  }

  public dispose(): void {
    this.cachedPagePositions?.clear();
    this.cachedPagePositions = null;
    this.lastZoomLevel = null;
  }
} 