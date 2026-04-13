import {
  PdfAnnotationSubtype,
  PdfWidgetAnnoObject,
  PDF_FORM_FIELD_TYPE,
  type Rect,
  type PdfStandardFont,
} from '@embedpdf/models';
import { createRenderer, type BoxedAnnotationRenderer } from '@embedpdf/plugin-annotation/svelte';
import FormTextField from './annotations/FormTextField.svelte';
import FormCheckbox from './annotations/FormCheckbox.svelte';
import FormRadioButton from './annotations/FormRadioButton.svelte';
import FormCombobox from './annotations/FormCombobox.svelte';
import FormListbox from './annotations/FormListbox.svelte';
import TextFillMode from './fill-mode/TextFillMode.svelte';
import ToggleFillMode from './fill-mode/ToggleFillMode.svelte';
import RadioButtonFillMode from './fill-mode/RadioButtonFillMode.svelte';
import ComboboxFillMode from './fill-mode/ComboboxFillMode.svelte';
import ListboxFillMode from './fill-mode/ListboxFillMode.svelte';
import TextFieldPreview from './previews/TextFieldPreview.svelte';
import CheckboxPreview from './previews/CheckboxPreview.svelte';
import RadioButtonPreview from './previews/RadioButtonPreview.svelte';
import ListboxPreview from './previews/ListboxPreview.svelte';

export interface WidgetPreviewData {
  rect: Rect;
  fontFamily?: PdfStandardFont;
  fontSize?: number;
  fontColor?: string;
}

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
