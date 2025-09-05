import { BasePlugin, createEmitter, Listener, PluginRegistry, Unsubscribe } from '@embedpdf/core';
import {
  PdfErrorCode,
  PdfErrorReason,
  PdfPrintOptions,
  PdfTaskHelper,
  Task,
} from '@embedpdf/models';

import { PrintCapability, PrintPluginConfig, PrintProgress, PrintReadyEvent } from './types';

export class PrintPlugin extends BasePlugin<PrintPluginConfig, PrintCapability> {
  static readonly id = 'print' as const;

  private readonly printReady$ = createEmitter<PrintReadyEvent>();

  constructor(id: string, registry: PluginRegistry, _config: PrintPluginConfig) {
    super(id, registry);
  }

  async initialize(_: PrintPluginConfig): Promise<void> {}

  protected buildCapability(): PrintCapability {
    return {
      print: this.print.bind(this),
    };
  }

  public onPrintRequest(listener: Listener<PrintReadyEvent>): Unsubscribe {
    return this.printReady$.on(listener);
  }

  private print(options?: PdfPrintOptions): Task<ArrayBuffer, PdfErrorReason, PrintProgress> {
    const printOptions = options ?? {};
    const task = new Task<ArrayBuffer, PdfErrorReason, PrintProgress>();
    task.progress({ stage: 'preparing', message: 'Preparing document...' });

    const prepare = this.preparePrintDocument(printOptions);
    prepare.wait((buffer) => {
      task.progress({ stage: 'document-ready', message: 'Document prepared successfully' });
      // Emit buffer + task for the framework layer to display & trigger print
      this.printReady$.emit({ options: printOptions, buffer, task });
    }, task.fail);

    return task;
  }

  public preparePrintDocument(options: PdfPrintOptions): Task<ArrayBuffer, PdfErrorReason> {
    const document = this.coreState.core.document;

    if (!document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'Document not found',
      });
    }

    return this.engine.preparePrintDocument(document, options);
  }
}
