import { BasePlugin, PluginRegistry } from '@embedpdf/core';

import { AttachmentCapability, AttachmentPluginConfig, AttachmentScope } from './types';
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

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): AttachmentCapability {
    return {
      // Active document operations
      getAttachments: () => this.getAttachments(),
      downloadAttachment: (attachment) => this.downloadAttachment(attachment),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createAttachmentScope(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createAttachmentScope(documentId: string): AttachmentScope {
    return {
      getAttachments: () => this.getAttachments(documentId),
      downloadAttachment: (attachment) => this.downloadAttachment(attachment, documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private downloadAttachment(
    attachment: PdfAttachmentObject,
    documentId?: string,
  ): Task<ArrayBuffer, PdfErrorReason> {
    const id = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.coreState.core.documents[id];

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: `Document ${id} not found`,
      });
    }

    return this.engine.readAttachmentContent(coreDoc.document, attachment);
  }

  private getAttachments(documentId?: string): Task<PdfAttachmentObject[], PdfErrorReason> {
    const id = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.coreState.core.documents[id];

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: `Document ${id} not found`,
      });
    }

    return this.engine.getAttachments(coreDoc.document);
  }
}
