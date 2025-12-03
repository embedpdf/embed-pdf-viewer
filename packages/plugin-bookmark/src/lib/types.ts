import { BasePluginConfig } from '@embedpdf/core';
import { Task } from '@embedpdf/models';
import { PdfBookmarkObject } from '@embedpdf/models';
import { PdfErrorReason } from '@embedpdf/models';

export interface BookmarkPluginConfig extends BasePluginConfig {}

// Scoped bookmark capability for a specific document
export interface BookmarkScope {
  getBookmarks(): Task<{ bookmarks: PdfBookmarkObject[] }, PdfErrorReason>;
}

export interface BookmarkCapability {
  // Active document operations
  getBookmarks: () => Task<{ bookmarks: PdfBookmarkObject[] }, PdfErrorReason>;

  // Document-scoped operations
  forDocument(documentId: string): BookmarkScope;
}
