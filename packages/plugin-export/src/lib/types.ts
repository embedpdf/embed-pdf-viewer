import { BasePluginConfig } from '@embedpdf/core';
import { PdfErrorReason, Task } from '@embedpdf/models';

export interface ExportPluginConfig extends BasePluginConfig {
  defaultFileName: string;
}

export interface BufferAndName {
  buffer: ArrayBuffer;
  name: string;
}

// Events include documentId
export interface DownloadRequestEvent {
  documentId: string;
}

// Scoped export capability
export interface ExportScope {
  saveAsCopy: () => Task<ArrayBuffer, PdfErrorReason>;
  download: () => void;
}

export interface ExportCapability {
  // Active document operations
  saveAsCopy: () => Task<ArrayBuffer, PdfErrorReason>;
  download: () => void;

  // Document-scoped operations
  forDocument(documentId: string): ExportScope;
}

// Note: Export plugin doesn't need state/reducer as it's stateless
export interface ExportState {}
