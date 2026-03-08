import { BasePluginConfig } from '@embedpdf/core';
import {
  ImageConversionTypes,
  ImageDataLike,
  PdfErrorReason,
  PdfRenderPageOptions,
  Rect,
  Task,
} from '@embedpdf/models';

export interface RenderPluginConfig extends BasePluginConfig {
  /**
   * Initialize and draw form widgets during renders.
   * Defaults to `false`.
   */
  withForms?: boolean;
  /**
   * Whether to render annotations
   * Defaults to `false`.
   */
  withAnnotations?: boolean;
  /**
   * The image type to use for rendering.
   * Defaults to `'image/webp'`.
   */
  defaultImageType?: ImageConversionTypes;
  /**
   * The image quality to use for rendering.
   * Defaults to `0.92`.
   */
  defaultImageQuality?: number;
}

export interface RenderPageRectOptions {
  pageIndex: number;
  rect: Rect;
  options: PdfRenderPageOptions;
}

export interface RenderPageOptions {
  pageIndex: number;
  options: PdfRenderPageOptions;
}

// Scoped render capability for a specific document
export interface RenderScope {
  renderPage(options: RenderPageOptions): Task<Blob, PdfErrorReason>;
  renderPageRect(options: RenderPageRectOptions): Task<Blob, PdfErrorReason>;
  renderPageRaw(options: RenderPageOptions): Task<ImageDataLike, PdfErrorReason>;
  renderPageRectRaw(options: RenderPageRectOptions): Task<ImageDataLike, PdfErrorReason>;
  /**
   * Render a full page as an `ImageBitmap`.
   *
   * Returns a fresh (uncached) bitmap wrapped in a `Task`.
   * **Caller owns the bitmap** — transfer it to a canvas via
   * `bitmaprenderer` context, or call `bitmap.close()` to free GPU memory.
   * If the task is aborted before resolution, the bitmap is closed internally.
   */
  renderPageBitmap(options: RenderPageOptions): Task<ImageBitmap, PdfErrorReason>;
  /**
   * Render a rectangular region of a page as an `ImageBitmap`.
   *
   * Returns a fresh (uncached) bitmap wrapped in a `Task`.
   * **Caller owns the bitmap** — transfer it to a canvas via
   * `bitmaprenderer` context, or call `bitmap.close()` to free GPU memory.
   * If the task is aborted before resolution, the bitmap is closed internally.
   */
  renderPageRectBitmap(options: RenderPageRectOptions): Task<ImageBitmap, PdfErrorReason>;
}

export interface RenderCapability {
  // Active document operations
  renderPage(options: RenderPageOptions): Task<Blob, PdfErrorReason>;
  renderPageRect(options: RenderPageRectOptions): Task<Blob, PdfErrorReason>;
  renderPageRaw(options: RenderPageOptions): Task<ImageDataLike, PdfErrorReason>;
  renderPageRectRaw(options: RenderPageRectOptions): Task<ImageDataLike, PdfErrorReason>;
  /** {@inheritDoc RenderScope.renderPageBitmap} */
  renderPageBitmap(options: RenderPageOptions): Task<ImageBitmap, PdfErrorReason>;
  /** {@inheritDoc RenderScope.renderPageRectBitmap} */
  renderPageRectBitmap(options: RenderPageRectOptions): Task<ImageBitmap, PdfErrorReason>;

  // Document-scoped operations
  forDocument(documentId: string): RenderScope;
}
