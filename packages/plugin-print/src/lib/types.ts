import { BasePluginConfig } from '@embedpdf/core';
import { PdfErrorReason, PdfPrintOptions, Task } from '@embedpdf/models';

export interface PrintPluginConfig extends BasePluginConfig {}

export type PrintProgress =
  | { stage: 'preparing'; message: string }
  | { stage: 'document-ready'; message: string }
  | { stage: 'iframe-ready'; message: string }
  | { stage: 'printing'; message: string };

export interface PrintReadyEvent {
  options: PdfPrintOptions;
  buffer: ArrayBuffer;
  task: Task<ArrayBuffer, PdfErrorReason, PrintProgress>;
}

export interface PrintCapability {
  print: (options?: PdfPrintOptions) => Task<ArrayBuffer, PdfErrorReason, PrintProgress>;
}
