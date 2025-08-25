import { BasePlugin, createEmitter, Listener, PluginRegistry, Unsubscribe } from '@embedpdf/core';
import { PdfErrorCode, PdfErrorReason, PdfTaskHelper, Task } from '@embedpdf/models';

import { BufferAndName, ExportCapability, ExportPluginConfig } from './types';

export class ExportPlugin extends BasePlugin<ExportPluginConfig, ExportCapability> {
  static readonly id = 'export' as const;

  private readonly downloadRequest$ = createEmitter<'download'>();
  private readonly config: ExportPluginConfig;

  constructor(id: string, registry: PluginRegistry, config: ExportPluginConfig) {
    super(id, registry);

    this.config = config;
  }

  async initialize(_: ExportPluginConfig): Promise<void> {}

  protected buildCapability(): ExportCapability {
    return {
      saveAsCopy: this.saveAsCopy.bind(this),
      download: this.download.bind(this),
    };
  }

  public onRequest(event: Listener<'download'>): Unsubscribe {
    return this.downloadRequest$.on(event);
  }

  private download(): void {
    this.downloadRequest$.emit('download');
  }

  public saveAsCopyAndGetBufferAndName(): Task<BufferAndName, PdfErrorReason> {
    const task = new Task<BufferAndName, PdfErrorReason>();
    const document = this.coreState.core.document;
    if (!document)
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'Document not found',
      });

    this.saveAsCopy().wait((result) => {
      task.resolve({
        buffer: result,
        name: document.name ?? this.config.defaultFileName,
      });
    }, task.fail);

    return task;
  }

  private saveAsCopy(): Task<ArrayBuffer, PdfErrorReason> {
    const document = this.coreState.core.document;

    if (!document)
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'Document not found',
      });

    return this.engine.saveAsCopy(document);
  }
}
