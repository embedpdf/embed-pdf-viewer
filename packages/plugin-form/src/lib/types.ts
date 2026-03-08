import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  PdfErrorReason,
  PdfRenderPageAnnotationOptions,
  PdfTask,
  PdfWidgetAnnoField,
  PdfWidgetAnnoObject,
  Task,
} from '@embedpdf/models';

export interface FormPluginConfig extends BasePluginConfig {}

export interface RenderWidgetOptions {
  pageIndex: number;
  annotation: PdfWidgetAnnoObject;
  options?: PdfRenderPageAnnotationOptions;
}

export interface FormDocumentState {
  fieldWidgets: Record<string, PdfWidgetAnnoObject>;
  selectedFieldId: string | null;
}

export interface FormState {
  documents: Record<string, FormDocumentState>;
}

export interface FormStateChangeEvent {
  documentId: string;
  state: FormDocumentState;
}

export interface FieldValueChangeEvent {
  documentId: string;
  pageIndex: number;
  annotationId: string;
  widget: PdfWidgetAnnoObject;
}

export interface FormScope {
  getPageFormAnnoWidgets(pageIndex: number): PdfTask<PdfWidgetAnnoObject[]>;
  setFormFieldValues(
    pageIndex: number,
    annotation: PdfWidgetAnnoObject,
    newField: PdfWidgetAnnoField,
  ): PdfTask<boolean>;
  renderWidget(options: RenderWidgetOptions): Task<Blob, PdfErrorReason>;
  selectField(annotationId: string): void;
  deselectField(): void;
  getSelectedFieldId(): string | null;
  getState(): FormDocumentState;
  onStateChange: EventHook<FormDocumentState>;
  onFieldValueChange: EventHook<FieldValueChangeEvent>;
}

export interface FormCapability {
  getPageFormAnnoWidgets(pageIndex: number, documentId?: string): PdfTask<PdfWidgetAnnoObject[]>;
  setFormFieldValues(
    pageIndex: number,
    annotation: PdfWidgetAnnoObject,
    newField: PdfWidgetAnnoField,
    documentId?: string,
  ): PdfTask<boolean>;
  renderWidget(options: RenderWidgetOptions, documentId?: string): Task<Blob, PdfErrorReason>;
  selectField(annotationId: string, documentId?: string): void;
  deselectField(documentId?: string): void;
  getSelectedFieldId(documentId?: string): string | null;
  getState(documentId?: string): FormDocumentState;
  forDocument(documentId: string): FormScope;
  onStateChange: EventHook<FormStateChangeEvent>;
  onFieldValueChange: EventHook<FieldValueChangeEvent>;
}
