import { BasePlugin, PluginRegistry } from '@embedpdf/core';
import { FormCapability, FormPluginConfig, FormState, RenderWidgetOptions } from './types';
import { FormAction } from './actions';
import {
  FormFieldValue,
  PdfErrorCode,
  PdfErrorReason,
  PdfTask,
  PdfTaskHelper,
  PdfWidgetAnnoObject,
  Task,
} from '@embedpdf/models';
import { AnnotationCapability, AnnotationPlugin } from '@embedpdf/plugin-annotation';

export class FormPlugin extends BasePlugin<
  FormPluginConfig,
  FormCapability,
  FormState,
  FormAction
> {
  static readonly id = 'form' as const;

  private readonly annotation: AnnotationCapability | null;

  constructor(id: string, registry: PluginRegistry, config: FormPluginConfig) {
    super(id, registry);

    this.annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides() ?? null;
  }

  async initialize(_: FormPluginConfig): Promise<void> {}

  protected buildCapability(): FormCapability {
    return {
      getPageFormAnnoWidgets: this.getPageFormAnnoWidgets.bind(this),
      setFormFieldValues: this.setFormFieldValues.bind(this),
      renderWidget: this.renderWidget.bind(this),
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

  setFormFieldValues(
    pageIndex: number,
    annotation: PdfWidgetAnnoObject,
    values: FormFieldValue[],
  ): PdfTask<boolean> {
    const coreState = this.coreState.core;

    const task = new Task<boolean, PdfErrorReason>();

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

    const tasks: Task<boolean, PdfErrorReason>[] = [];
    for (const value of values) {
      const task = this.engine.setFormFieldValue(coreState.document, page, annotation, value);
      tasks.push(task);
    }

    Task.allSettled(tasks).wait(() => {
      task.resolve(true);
    }, task.fail);

    return task;
  }

  renderWidget(options: RenderWidgetOptions): Task<Blob, PdfErrorReason> {
    if (!this.annotation) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'annotation plugin not found',
      });
    }

    return this.annotation.renderAnnotation(options);
  }

  async destroy(): Promise<void> {
    super.destroy();
  }
}
