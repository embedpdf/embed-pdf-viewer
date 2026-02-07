export interface PageLayout {
  pageNumber: number;
  pageIndex: number;
  x: number; // Relative to item, in original coordinates
  y: number;
  width: number;
  height: number;
  rotatedWidth: number;
  rotatedHeight: number;
  elevated: boolean;
}

export interface VirtualItem {
  id: string;
  x: number; // In original coordinates
  y: number;
  offset: number;
  width: number;
  height: number;
  pageLayouts: PageLayout[];
  pageNumbers: number[];
  index: number;
}
