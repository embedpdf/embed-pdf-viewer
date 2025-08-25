import { BasePlugin, createEmitter, PluginRegistry } from '@embedpdf/core';

import { AttachmentCapability, AttachmentPluginConfig } from './types';
import {
  PdfAttachmentObject,
  PdfErrorCode,
  PdfErrorReason,
  PdfTaskHelper,
  Task,
} from '@embedpdf/models';

export class AttachmentPlugin extends BasePlugin<AttachmentPluginConfig, AttachmentCapability> {
  static readonly id = 'attachment' as const;

  constructor(id: string, registry: PluginRegistry) {
    super(id, registry);
  }

  async initialize(_: AttachmentPluginConfig): Promise<void> {}

  protected buildCapability(): AttachmentCapability {
    return {
      getAttachments: this.getAttachments.bind(this),
      downloadAttachment: this.downloadAttachment.bind(this),
    };
  }

  private downloadAttachment(attachment: PdfAttachmentObject): Task<ArrayBuffer, PdfErrorReason> {
    const doc = this.coreState.core.document;

    if (!doc) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });
    }

    return this.engine.readAttachmentContent(doc, attachment);
  }

  private getAttachments(): Task<PdfAttachmentObject[], PdfErrorReason> {
    const doc = this.coreState.core.document;

    if (!doc) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });
    }

    return this.engine.getAttachments(doc);
  }
}
