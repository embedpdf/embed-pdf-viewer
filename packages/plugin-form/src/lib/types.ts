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

export interface FormCapability {
  getPageFormAnnoWidgets: (pageIndex: number) => PdfTask<PdfWidgetAnnoObject[]>;
  setFormFieldValues: (
    pageIndex: number,
    annotation: PdfWidgetAnnoObject,
    values: FormFieldValue[],
  ) => PdfTask<boolean>;
  renderWidget: (options: RenderWidgetOptions) => Task<Blob, PdfErrorReason>;
}

export interface FormState {}
