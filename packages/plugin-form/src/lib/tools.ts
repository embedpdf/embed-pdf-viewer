import {
  PdfAnnotationObject,
  PdfAnnotationSubtype,
  PDF_FORM_FIELD_TYPE,
  PDF_FORM_FIELD_FLAG,
  PdfWidgetAnnoObject,
  PdfStandardFont,
} from '@embedpdf/models';
import { AnnotationTool, defineAnnotationTool } from '@embedpdf/plugin-annotation';
import { textFieldHandlerFactory } from './handlers';

export const formTextFieldTool = defineAnnotationTool({
  id: 'formTextField' as const,
  name: 'Text Field',
  labelKey: 'form.textfield',
  matchScore: (a: PdfAnnotationObject) => {
    if (a.type !== PdfAnnotationSubtype.WIDGET) return 0;
    const widget = a;
    return widget.field?.type === PDF_FORM_FIELD_TYPE.TEXTFIELD ? 10 : 0;
  },
  interaction: {
    exclusive: false,
    cursor: 'crosshair',
    isDraggable: true,
    isResizable: true,
    isRotatable: false,
    isGroupDraggable: false,
    isGroupResizable: false,
    isGroupRotatable: false,
  },
  defaults: {
    type: PdfAnnotationSubtype.WIDGET,
    fontFamily: PdfStandardFont.Helvetica,
    fontSize: 12,
    fontColor: '#000000',
    strokeColor: '#000000',
    color: '#FFFFFF',
    strokeWidth: 1,
    field: {
      flag: PDF_FORM_FIELD_FLAG.NONE,
      name: 'TextField',
      alternateName: 'TextField',
      value: '',
      type: PDF_FORM_FIELD_TYPE.TEXTFIELD,
    },
  },
  behavior: {
    useAppearanceStream: false,
  },
  clickBehavior: {
    enabled: true,
    defaultSize: { width: 150, height: 24 },
  },
  pointerHandler: textFieldHandlerFactory,
} satisfies AnnotationTool<PdfWidgetAnnoObject, 'formTextField'>);

export const formTools = [formTextFieldTool];
