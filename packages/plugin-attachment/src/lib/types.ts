import { BasePluginConfig } from '@embedpdf/core';
import { PdfAttachmentObject, PdfErrorReason, Task } from '@embedpdf/models';

export interface AttachmentPluginConfig extends BasePluginConfig {}

// Scoped attachment capability for a specific document
export interface AttachmentScope {
  getAttachments(): Task<PdfAttachmentObject[], PdfErrorReason>;
  downloadAttachment(attachment: PdfAttachmentObject): Task<ArrayBuffer, PdfErrorReason>;
}

export interface AttachmentCapability {
  // Active document operations
  getAttachments: () => Task<PdfAttachmentObject[], PdfErrorReason>;
  downloadAttachment: (attachment: PdfAttachmentObject) => Task<ArrayBuffer, PdfErrorReason>;

  // Document-scoped operations
  forDocument(documentId: string): AttachmentScope;
}
