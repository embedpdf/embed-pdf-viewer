import { BasePluginConfig } from '@embedpdf/core';
import { PdfErrorReason, Task } from '@embedpdf/models';
import type { ScrollBehavior } from '@embedpdf/plugin-scroll';

export interface ThumbnailPluginConfig extends BasePluginConfig {
  /** Thumbnail width in CSS pixels. Controls the display width of each thumbnail image. Default: 120 */
  width?: number;

  /** Vertical gap between thumbnails in CSS pixels. Controls spacing between each thumbnail row. Default: 8 */
  gap?: number;

  /** Number of extra thumbnail rows to render above and below the visible viewport. Higher values improve scrolling smoothness but use more memory. Default: 3 */
  buffer?: number;

  /** Height reserved for the page number label below each thumbnail in CSS pixels. Set to 0 to hide labels. Default: 16 */
  labelHeight?: number;

  /** Whether to automatically scroll the thumbnail pane when the main document's current page changes. Default: true */
  autoScroll?: boolean;

  /** Scroll animation behavior when auto-scrolling or programmatically scrolling to thumbnails. Default: 'smooth' */
  scrollBehavior?: ScrollBehavior;

  /** Internal padding around each thumbnail image in CSS pixels. Creates visual spacing between the image and its border. Default: 0 */
  imagePadding?: number;

  /** Vertical padding for the entire thumbnail pane in CSS pixels. Adds space at the top and bottom of the scrollable area. Default: 0 */
  paddingY?: number;
}

export interface ScrollToOptions {
  top: number;
  behavior?: ScrollBehavior;
}

export interface ThumbMeta {
  pageIndex: number;
  /** Inner bitmap size (excludes padding). */
  width: number;
  height: number;
  /** Total row height (padding*2 + image height + labelHeight). */
  wrapperHeight: number;
  /** Top offset of the entire row (including padding + label). */
  top: number;
  labelHeight: number;
  /** Padding applied around the image (px). */
  padding?: number;
}

export interface WindowState {
  start: number; // first index in DOM
  end: number; // last index in DOM (inclusive)
  items: ThumbMeta[]; // meta for the indices above
  totalHeight: number; // full scroll height
}

export interface ThumbnailCapability {
  scrollToThumb(pageIdx: number): void;
  /** lazily render one thumb */
  renderThumb(pageIdx: number, dpr: number): Task<Blob, PdfErrorReason>;
}
