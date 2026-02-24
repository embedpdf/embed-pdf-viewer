import { BasePlugin, PluginRegistry } from '@embedpdf/core';
import {
  FormCapability,
  FormPluginConfig,
  FormScope,
  FormState,
  RenderWidgetOptions,
} from './types';
import { FormAction, initFormState, cleanupFormState } from './actions';
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
import { initialDocumentState } from './reducer';

export class FormPlugin extends BasePlugin<
  FormPluginConfig,
  FormCapability,
  FormState,
  FormAction
> {
  static readonly id = 'form' as const;

  private annotation: AnnotationCapability | null = null;

  constructor(id: string, registry: PluginRegistry, _config: FormPluginConfig) {
    super(id, registry);

    this.annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides() ?? null;
  }

  async initialize(): Promise<void> {}

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initFormState(documentId, { ...initialDocumentState }));
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupFormState(documentId));
  }

  protected buildCapability(): FormCapability {
    return {
      getPageFormAnnoWidgets: (pageIndex, documentId?) =>
        this.getPageFormAnnoWidgets(pageIndex, documentId),
      setFormFieldValues: (pageIndex, annotation, values, documentId?) =>
        this.setFormFieldValues(pageIndex, annotation, values, documentId),
      renderWidget: (options, documentId?) => this.renderWidget(options, documentId),
      forDocument: (documentId) => this.createFormScope(documentId),
    };
  }

  private createFormScope(documentId: string): FormScope {
    return {
      getPageFormAnnoWidgets: (pageIndex) => this.getPageFormAnnoWidgets(pageIndex, documentId),
      setFormFieldValues: (pageIndex, annotation, values) =>
        this.setFormFieldValues(pageIndex, annotation, values, documentId),
      renderWidget: (options) => this.renderWidget(options, documentId),
    };
  }

  private getPageFormAnnoWidgets(
    pageIndex: number,
    documentId?: string,
  ): PdfTask<PdfWidgetAnnoObject[]> {
    const docState = this.getCoreDocumentOrThrow(documentId);
    const doc = docState.document;

    if (!doc) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document is not open',
      });
    }

    const page = doc.pages.find((p) => p.index === pageIndex);
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'page does not exist',
      });
    }

    return this.engine.getPageAnnoWidgets(doc, page);
  }

  private setFormFieldValues(
    pageIndex: number,
    annotation: PdfWidgetAnnoObject,
    values: FormFieldValue[],
    documentId?: string,
  ): PdfTask<boolean> {
    const docState = this.getCoreDocumentOrThrow(documentId);
    const doc = docState.document;

    if (!doc) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document is not open',
      });
    }

    const page = doc.pages.find((p) => p.index === pageIndex);
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'page does not exist',
      });
    }

    const task = new Task<boolean, PdfErrorReason>();
    const tasks: Task<boolean, PdfErrorReason>[] = [];

    for (const value of values) {
      tasks.push(this.engine.setFormFieldValue(doc, page, annotation, value));
    }

    Task.allSettled(tasks).wait(() => {
      task.resolve(true);
    }, task.fail);

    return task;
  }

  private renderWidget(
    options: RenderWidgetOptions,
    documentId?: string,
  ): Task<Blob, PdfErrorReason> {
    if (!this.annotation) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'annotation plugin not found',
      });
    }

    const id = documentId ?? this.getActiveDocumentId();
    return this.annotation.forDocument(id).renderAnnotation(options);
  }

  async destroy(): Promise<void> {
    super.destroy();
  }
}
