import {
  PdfAnnotationSubtype,
  PdfWidgetAnnoObject,
  PDF_FORM_FIELD_TYPE,
  PdfStandardFont,
  Rect,
} from '@embedpdf/models';
import { createRenderer, BoxedAnnotationRenderer } from '@embedpdf/plugin-annotation/@framework';
import { FormTextField } from './annotations/form-text-field';
import { FormCheckbox } from './annotations/form-checkbox';
import { FormRadioButton } from './annotations/form-radio-button';
import { FormCombobox } from './annotations/form-combobox';
import { FormListbox } from './annotations/form-listbox';
import { TextFillMode } from './fill-mode/text-fill-mode';
import { ToggleFillMode } from './fill-mode/toggle-fill-mode';
import { RadioButtonFillMode } from './fill-mode/radio-button-fill-mode';
import { ComboboxFillMode } from './fill-mode/combobox-fill-mode';
import { ListboxFillMode } from './fill-mode/listbox-fill-mode';

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
    render: ({ annotation, isSelected, scale, pageIndex, onClick }) => (
      <FormTextField
        annotation={annotation}
        isSelected={isSelected}
        scale={scale}
        pageIndex={pageIndex}
        onClick={onClick}
      />
    ),
    renderPreview: ({ bounds, scale }) => (
      <div
        style={{
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: bounds.size.width * scale,
          height: bounds.size.height * scale,
          border: '1px dashed rgba(66, 133, 244, 0.6)',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          boxSizing: 'border-box' as const,
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${2 * scale}px`,
          overflow: 'hidden',
        }}
      />
    ),
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: (props) => <TextFillMode {...props} />,
  }),
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formCheckbox',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.CHECKBOX,
    render: ({ annotation, isSelected, scale, pageIndex, onClick }) => (
      <FormCheckbox
        annotation={annotation}
        isSelected={isSelected}
        scale={scale}
        pageIndex={pageIndex}
        onClick={onClick}
      />
    ),
    renderPreview: ({ bounds, scale }) => (
      <div
        style={{
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: bounds.size.width * scale,
          height: bounds.size.height * scale,
          border: '1px dashed rgba(66, 133, 244, 0.6)',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          boxSizing: 'border-box' as const,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
    ),
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: (props) => <ToggleFillMode {...props} />,
  }),
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formRadioButton',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.RADIOBUTTON,
    render: ({ annotation, isSelected, scale, pageIndex, onClick }) => (
      <FormRadioButton
        annotation={annotation}
        isSelected={isSelected}
        scale={scale}
        pageIndex={pageIndex}
        onClick={onClick}
      />
    ),
    renderPreview: ({ bounds, scale }) => (
      <div
        style={{
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: bounds.size.width * scale,
          height: bounds.size.height * scale,
          border: '1px dashed rgba(66, 133, 244, 0.6)',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: '50%',
          boxSizing: 'border-box' as const,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
    ),
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: (props) => <RadioButtonFillMode {...props} />,
  }),
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formCombobox',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.COMBOBOX,
    render: ({ annotation, isSelected, scale, pageIndex, onClick }) => (
      <FormCombobox
        annotation={annotation}
        isSelected={isSelected}
        scale={scale}
        pageIndex={pageIndex}
        onClick={onClick}
      />
    ),
    renderPreview: ({ bounds, scale }) => (
      <div
        style={{
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: bounds.size.width * scale,
          height: bounds.size.height * scale,
          border: '1px dashed rgba(66, 133, 244, 0.6)',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          boxSizing: 'border-box' as const,
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${2 * scale}px`,
          overflow: 'hidden',
        }}
      />
    ),
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: (props) => <ComboboxFillMode {...props} />,
  }),
  createRenderer<PdfWidgetAnnoObject, WidgetPreviewData>({
    id: 'formListbox',
    matches: (a): a is PdfWidgetAnnoObject =>
      a.type === PdfAnnotationSubtype.WIDGET && a.field?.type === PDF_FORM_FIELD_TYPE.LISTBOX,
    render: ({ annotation, isSelected, scale, pageIndex, onClick }) => (
      <FormListbox
        annotation={annotation}
        isSelected={isSelected}
        scale={scale}
        pageIndex={pageIndex}
        onClick={onClick}
      />
    ),
    renderPreview: ({ bounds, scale }) => (
      <div
        style={{
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: bounds.size.width * scale,
          height: bounds.size.height * scale,
          border: '1px dashed rgba(66, 133, 244, 0.6)',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          boxSizing: 'border-box' as const,
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
        }}
      />
    ),
    interactionDefaults: { isDraggable: false, isResizable: true, isRotatable: false },
    useAppearanceStream: false,
    renderLocked: (props) => <ListboxFillMode {...props} />,
  }),
];
