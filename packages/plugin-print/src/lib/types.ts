import { BasePluginConfig } from '@embedpdf/core';
import { PdfErrorReason, PdfPrintOptions, Task } from '@embedpdf/models';

export interface PrintPluginConfig extends BasePluginConfig {}

export type PrintProgress =
  | { stage: 'preparing'; message: string }
  | { stage: 'document-ready'; message: string }
  | { stage: 'iframe-ready'; message: string }
  | { stage: 'printing'; message: string };

// Events include documentId
export interface PrintReadyEvent {
  documentId: string;
  options: PdfPrintOptions;
  buffer: ArrayBuffer;
  task: Task<ArrayBuffer, PdfErrorReason, PrintProgress>;
}

// Scoped print capability
export interface PrintScope {
  print: (options?: PdfPrintOptions) => Task<ArrayBuffer, PdfErrorReason, PrintProgress>;
}

export interface PrintCapability {
  // Active document operations
  print: (options?: PdfPrintOptions) => Task<ArrayBuffer, PdfErrorReason, PrintProgress>;

  // Document-scoped operations
  forDocument(documentId: string): PrintScope;
}

// Note: Print plugin doesn't need state/reducer as it's stateless
export interface PrintState {}
