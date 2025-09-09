import { BasePluginConfig } from '@embedpdf/core';
import { PdfErrorReason, PdfTask, PdfWidgetAnnoObject } from '@embedpdf/models';

export interface FormPluginConfig extends BasePluginConfig {}

export interface FormCapability {
  getPageFormAnnoWidgets: (pageIndex: number) => PdfTask<PdfWidgetAnnoObject[]>;
}

export interface FormState {}
