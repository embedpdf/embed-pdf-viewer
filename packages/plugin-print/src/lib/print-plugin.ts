import { BasePlugin, createEmitter, Listener, PluginRegistry, Unsubscribe } from '@embedpdf/core';
import {
  PdfErrorCode,
  PdfErrorReason,
  PdfPrintOptions,
  PdfTaskHelper,
  Task,
} from '@embedpdf/models';

import {
  PrintCapability,
  PrintPluginConfig,
  PrintProgress,
  PrintReadyEvent,
  PrintScope,
} from './types';

export class PrintPlugin extends BasePlugin<PrintPluginConfig, PrintCapability> {
  static readonly id = 'print' as const;

  private readonly printReady$ = createEmitter<PrintReadyEvent>();

  constructor(id: string, registry: PluginRegistry, _config: PrintPluginConfig) {
    super(id, registry);
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): PrintCapability {
    return {
      // Active document operations
      print: (options?: PdfPrintOptions) => this.print(options),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createPrintScope(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createPrintScope(documentId: string): PrintScope {
    return {
      print: (options?: PdfPrintOptions) => this.print(options, documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private print(
    options?: PdfPrintOptions,
    documentId?: string,
  ): Task<ArrayBuffer, PdfErrorReason, PrintProgress> {
    const id = documentId ?? this.getActiveDocumentId();
    const printOptions = options ?? {};
    const task = new Task<ArrayBuffer, PdfErrorReason, PrintProgress>();

    task.progress({ stage: 'preparing', message: 'Preparing document...' });

    const prepare = this.preparePrintDocument(printOptions, id);
    prepare.wait(
      (buffer) => {
        task.progress({ stage: 'document-ready', message: 'Document prepared successfully' });
        // Emit buffer + task for the framework layer to display & trigger print
        this.printReady$.emit({
          documentId: id,
          options: printOptions,
          buffer,
          task,
        });
      },
      (error) => task.fail(error),
    );

    return task;
  }

  private preparePrintDocument(
    options: PdfPrintOptions,
    documentId: string,
  ): Task<ArrayBuffer, PdfErrorReason> {
    const coreDoc = this.coreState.core.documents[documentId];

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: `Document ${documentId} not found`,
      });
    }

    return this.engine.preparePrintDocument(coreDoc.document, options);
  }

  // ─────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────

  public onPrintRequest(listener: Listener<PrintReadyEvent>): Unsubscribe {
    return this.printReady$.on(listener);
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_: PrintPluginConfig): Promise<void> {
    this.logger.info('PrintPlugin', 'Initialize', 'Print plugin initialized');
  }

  async destroy(): Promise<void> {
    this.printReady$.clear();
    await super.destroy();
  }
}
