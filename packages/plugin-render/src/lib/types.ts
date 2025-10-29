import { BasePluginConfig } from '@embedpdf/core';
import { PdfErrorReason, PdfRenderPageOptions, Rect, Task } from '@embedpdf/models';

export interface RenderPluginConfig extends BasePluginConfig {}

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
}

export interface RenderCapability {
  // Active document operations
  renderPage(options: RenderPageOptions): Task<Blob, PdfErrorReason>;
  renderPageRect(options: RenderPageRectOptions): Task<Blob, PdfErrorReason>;

  // Document-scoped operations
  forDocument(documentId: string): RenderScope;
}
