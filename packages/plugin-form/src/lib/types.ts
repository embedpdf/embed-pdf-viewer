import { BasePluginConfig } from '@embedpdf/core';
import {
  FormFieldValue,
  PdfErrorReason,
  PdfRenderPageAnnotationOptions,
  PdfTask,
  PdfWidgetAnnoObject,
  Task,
} from '@embedpdf/models';

export interface FormPluginConfig extends BasePluginConfig {}

export interface RenderWidgetOptions {
  pageIndex: number;
  annotation: PdfWidgetAnnoObject;
  options?: PdfRenderPageAnnotationOptions;
}

export interface FormDocumentState {}

export interface FormState {
  documents: Record<string, FormDocumentState>;
}

export interface FormScope {
  getPageFormAnnoWidgets(pageIndex: number): PdfTask<PdfWidgetAnnoObject[]>;
  setFormFieldValues(
    pageIndex: number,
    annotation: PdfWidgetAnnoObject,
    values: FormFieldValue[],
  ): PdfTask<boolean>;
  renderWidget(options: RenderWidgetOptions): Task<Blob, PdfErrorReason>;
}

export interface FormCapability {
  getPageFormAnnoWidgets(pageIndex: number, documentId?: string): PdfTask<PdfWidgetAnnoObject[]>;
  setFormFieldValues(
    pageIndex: number,
    annotation: PdfWidgetAnnoObject,
    values: FormFieldValue[],
    documentId?: string,
  ): PdfTask<boolean>;
  renderWidget(options: RenderWidgetOptions, documentId?: string): Task<Blob, PdfErrorReason>;
  forDocument(documentId: string): FormScope;
}
