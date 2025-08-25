import { BasePluginConfig } from '@embedpdf/core';
import { PdfAttachmentObject, PdfErrorReason, Task } from '@embedpdf/models';

export interface AttachmentPluginConfig extends BasePluginConfig {}

export interface AttachmentCapability {
  getAttachments: () => Task<PdfAttachmentObject[], PdfErrorReason>;
  downloadAttachment: (attachment: PdfAttachmentObject) => Task<ArrayBuffer, PdfErrorReason>;
}
