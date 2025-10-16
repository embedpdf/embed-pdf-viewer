import { BasePlugin, createEmitter, Listener, PluginRegistry } from '@embedpdf/core';
import { PdfErrorCode, PdfErrorReason, PdfTaskHelper, Task } from '@embedpdf/models';

import {
  BufferAndName,
  ExportCapability,
  ExportPluginConfig,
  ExportScope,
  DownloadRequestEvent,
} from './types';

export class ExportPlugin extends BasePlugin<ExportPluginConfig, ExportCapability> {
  static readonly id = 'export' as const;

  private readonly downloadRequest$ = createEmitter<DownloadRequestEvent>();
  private readonly config: ExportPluginConfig;

  constructor(id: string, registry: PluginRegistry, config: ExportPluginConfig) {
    super(id, registry);
    this.config = config;
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): ExportCapability {
    return {
      // Active document operations
      saveAsCopy: () => this.saveAsCopy(),
      download: () => this.download(),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createExportScope(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createExportScope(documentId: string): ExportScope {
    return {
      saveAsCopy: () => this.saveAsCopy(documentId),
      download: () => this.download(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private download(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.downloadRequest$.emit({ documentId: id });
  }

  private saveAsCopy(documentId?: string): Task<ArrayBuffer, PdfErrorReason> {
    const id = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.coreState.core.documents[id];

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: `Document ${id} not found`,
      });
    }

    return this.engine.saveAsCopy(coreDoc.document);
  }

  public saveAsCopyAndGetBufferAndName(documentId: string): Task<BufferAndName, PdfErrorReason> {
    const task = new Task<BufferAndName, PdfErrorReason>();
    const coreDoc = this.coreState.core.documents[documentId];

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: `Document ${documentId} not found`,
      });
    }

    this.saveAsCopy(documentId).wait(
      (result) => {
        task.resolve({
          buffer: result,
          name: coreDoc.document!.name ?? this.config.defaultFileName,
        });
      },
      (error) => task.fail(error),
    );

    return task;
  }

  // ─────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────

  public onRequest(listener: Listener<DownloadRequestEvent>) {
    return this.downloadRequest$.on(listener);
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_: ExportPluginConfig): Promise<void> {
    this.logger.info('ExportPlugin', 'Initialize', 'Export plugin initialized');
  }

  async destroy(): Promise<void> {
    this.downloadRequest$.clear();
    await super.destroy();
  }
}
