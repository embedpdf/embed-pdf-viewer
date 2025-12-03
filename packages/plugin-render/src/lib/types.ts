import { BasePluginConfig } from '@embedpdf/core';
import { PdfErrorReason, PdfRenderPageOptions, Rect, Task } from '@embedpdf/models';

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

export interface RenderCapability {
  renderPage: (options: RenderPageOptions) => Task<Blob, PdfErrorReason>;
  renderPageRect: (options: RenderPageRectOptions) => Task<Blob, PdfErrorReason>;
}
