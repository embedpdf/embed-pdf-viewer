import { BasePlugin, PluginRegistry } from '@embedpdf/core';
import { FormCapability, FormPluginConfig, FormState } from './types';
import { FormAction } from './actions';
import {
  PdfErrorCode,
  PdfErrorReason,
  PdfTask,
  PdfTaskHelper,
  PdfWidgetAnnoObject,
} from '@embedpdf/models';

export class FormPlugin extends BasePlugin<
  FormPluginConfig,
  FormCapability,
  FormState,
  FormAction
> {
  static readonly id = 'form' as const;

  constructor(id: string, registry: PluginRegistry, config: FormPluginConfig) {
    super(id, registry);
  }

  async initialize(_: FormPluginConfig): Promise<void> {}

  protected buildCapability(): FormCapability {
    return {
      getPageFormAnnoWidgets: this.getPageFormAnnoWidgets.bind(this),
    };
  }

  getPageFormAnnoWidgets(pageIndex: number): PdfTask<PdfWidgetAnnoObject[]> {
    const coreState = this.coreState.core;

    if (!coreState.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const page = coreState.document.pages.find((page) => page.index === pageIndex);
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'page does not exist',
      });
    }

    return this.engine.getPageAnnoWidgets(coreState.document, page);
  }

  async destroy(): Promise<void> {
    super.destroy();
  }
}
