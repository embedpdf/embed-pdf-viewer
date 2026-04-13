import { PdfAnnotationSubtype, PdfWidgetAnnoObject, PDF_FORM_FIELD_TYPE } from '@embedpdf/models';
import { createRenderer, type BoxedAnnotationRenderer } from '@embedpdf/plugin-annotation/vue';
import FormTextField from './annotations/form-text-field.vue';
import FormCheckbox from './annotations/form-checkbox.vue';
import FormRadioButton from './annotations/form-radio-button.vue';
import FormCombobox from './annotations/form-combobox.vue';
import FormListbox from './annotations/form-listbox.vue';
import TextFillMode from './fill-mode/text-fill-mode.vue';
import ToggleFillMode from './fill-mode/toggle-fill-mode.vue';
import RadioButtonFillMode from './fill-mode/radio-button-fill-mode.vue';
import ComboboxFillMode from './fill-mode/combobox-fill-mode.vue';
import ListboxFillMode from './fill-mode/listbox-fill-mode.vue';
import TextFieldPreview from './previews/text-field-preview.vue';
import CheckboxPreview from './previews/checkbox-preview.vue';
import RadioButtonPreview from './previews/radio-button-preview.vue';
import ListboxPreview from './previews/listbox-preview.vue';
import type { WidgetPreviewData } from './types';

export type { WidgetPreviewData } from './types';

export const formRenderers: BoxedAnnotationRenderer[] = [
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formTextField',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.TEXTFIELD,
    component: FormTextField,
    renderPreview: TextFieldPreview,
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: TextFillMode,
  }),
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formCheckbox',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.CHECKBOX,
    component: FormCheckbox,
    renderPreview: CheckboxPreview,
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: ToggleFillMode,
  }),
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formRadioButton',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.RADIOBUTTON,
    component: FormRadioButton,
    renderPreview: RadioButtonPreview,
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: RadioButtonFillMode,
  }),
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formCombobox',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.COMBOBOX,
    component: FormCombobox,
    renderPreview: TextFieldPreview,
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: ComboboxFillMode,
  }),
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formListbox',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.LISTBOX,
    component: FormListbox,
    renderPreview: ListboxPreview,
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: ListboxFillMode,
  }),
];
