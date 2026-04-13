import {
  PdfAnnotationObject,
  PdfAnnotationSubtype,
  PDF_FORM_FIELD_TYPE,
  PDF_FORM_FIELD_FLAG,
  PdfWidgetAnnoObject,
  PdfStandardFont,
} from '@embedpdf/models';
import { AnnotationTool, defineAnnotationTool } from '@embedpdf/plugin-annotation';
import {
  textFieldHandlerFactory,
  checkboxHandlerFactory,
  radioButtonHandlerFactory,
  comboboxHandlerFactory,
  listboxHandlerFactory,
} from './handlers';

export const formTextFieldTool = defineAnnotationTool({
  id: 'formTextField' as const,
  name: 'Text Field',
  labelKey: 'form.textfield',
  categories: ['annotation', 'form'],
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
    isGroupDraggable: true,
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

export const formCheckboxTool = defineAnnotationTool({
  id: 'formCheckbox' as const,
  name: 'Checkbox',
  labelKey: 'form.checkbox',
  categories: ['annotation', 'form'],
  matchScore: (a: PdfAnnotationObject) => {
    if (a.type !== PdfAnnotationSubtype.WIDGET) return 0;
    const widget = a;
    return widget.field?.type === PDF_FORM_FIELD_TYPE.CHECKBOX ? 10 : 0;
  },
  interaction: {
    exclusive: false,
    cursor: 'crosshair',
    isDraggable: true,
    isResizable: true,
    isRotatable: false,
    isGroupDraggable: true,
    isGroupResizable: false,
    isGroupRotatable: false,
  },
  defaults: {
    type: PdfAnnotationSubtype.WIDGET,
    strokeColor: '#000000',
    color: '#FFFFFF',
    strokeWidth: 1,
    field: {
      flag: PDF_FORM_FIELD_FLAG.NONE,
      name: 'Checkbox',
      alternateName: 'Checkbox',
      value: 'Off',
      type: PDF_FORM_FIELD_TYPE.CHECKBOX,
    },
  },
  behavior: {
    useAppearanceStream: false,
  },
  clickBehavior: {
    enabled: true,
    defaultSize: { width: 20, height: 20 },
  },
  pointerHandler: checkboxHandlerFactory,
} satisfies AnnotationTool<PdfWidgetAnnoObject, 'formCheckbox'>);

export const formRadioButtonTool = defineAnnotationTool({
  id: 'formRadioButton' as const,
  name: 'Radio Button',
  labelKey: 'form.radiobutton',
  categories: ['annotation', 'form'],
  matchScore: (a: PdfAnnotationObject) => {
    if (a.type !== PdfAnnotationSubtype.WIDGET) return 0;
    const widget = a;
    return widget.field?.type === PDF_FORM_FIELD_TYPE.RADIOBUTTON ? 10 : 0;
  },
  interaction: {
    exclusive: false,
    cursor: 'crosshair',
    isDraggable: true,
    isResizable: true,
    isRotatable: false,
    lockAspectRatio: true,
    isGroupDraggable: true,
    isGroupResizable: false,
    isGroupRotatable: false,
  },
  defaults: {
    type: PdfAnnotationSubtype.WIDGET,
    strokeColor: '#000000',
    color: '#FFFFFF',
    strokeWidth: 1,
    field: {
      flag: PDF_FORM_FIELD_FLAG.BUTTON_RADIO | PDF_FORM_FIELD_FLAG.BUTTON_NOTOGGLETOOFF,
      name: 'RadioButton',
      alternateName: 'RadioButton',
      value: 'Off',
      type: PDF_FORM_FIELD_TYPE.RADIOBUTTON,
      options: [],
    },
  },
  behavior: {
    useAppearanceStream: false,
  },
  clickBehavior: {
    enabled: true,
    defaultSize: { width: 20, height: 20 },
  },
  pointerHandler: radioButtonHandlerFactory,
} satisfies AnnotationTool<PdfWidgetAnnoObject, 'formRadioButton'>);

export const formComboboxTool = defineAnnotationTool({
  id: 'formCombobox' as const,
  name: 'Combo Box',
  labelKey: 'form.combobox',
  categories: ['annotation', 'form'],
  matchScore: (a: PdfAnnotationObject) => {
    if (a.type !== PdfAnnotationSubtype.WIDGET) return 0;
    const widget = a;
    return widget.field?.type === PDF_FORM_FIELD_TYPE.COMBOBOX ? 10 : 0;
  },
  interaction: {
    exclusive: false,
    cursor: 'crosshair',
    isDraggable: true,
    isResizable: true,
    isRotatable: false,
    isGroupDraggable: true,
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
      name: 'ComboBox',
      alternateName: 'ComboBox',
      value: '',
      type: PDF_FORM_FIELD_TYPE.COMBOBOX,
      options: [
        { label: 'Option 1', isSelected: true },
        { label: 'Option 2', isSelected: false },
        { label: 'Option 3', isSelected: false },
      ],
    },
  },
  behavior: {
    useAppearanceStream: false,
  },
  clickBehavior: {
    enabled: true,
    defaultSize: { width: 200, height: 40 },
  },
  pointerHandler: comboboxHandlerFactory,
} satisfies AnnotationTool<PdfWidgetAnnoObject, 'formCombobox'>);

export const formListboxTool = defineAnnotationTool({
  id: 'formListbox' as const,
  name: 'List Box',
  labelKey: 'form.listbox',
  categories: ['annotation', 'form'],
  matchScore: (a: PdfAnnotationObject) => {
    if (a.type !== PdfAnnotationSubtype.WIDGET) return 0;
    const widget = a;
    return widget.field?.type === PDF_FORM_FIELD_TYPE.LISTBOX ? 10 : 0;
  },
  interaction: {
    exclusive: false,
    cursor: 'crosshair',
    isDraggable: true,
    isResizable: true,
    isRotatable: false,
    isGroupDraggable: true,
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
      name: 'ListBox',
      alternateName: 'ListBox',
      value: '',
      type: PDF_FORM_FIELD_TYPE.LISTBOX,
      options: [
        { label: 'Option 1', isSelected: true },
        { label: 'Option 2', isSelected: false },
        { label: 'Option 3', isSelected: false },
      ],
    },
  },
  behavior: {
    useAppearanceStream: false,
  },
  clickBehavior: {
    enabled: true,
    defaultSize: { width: 150, height: 150 },
  },
  pointerHandler: listboxHandlerFactory,
} satisfies AnnotationTool<PdfWidgetAnnoObject, 'formListbox'>);

export const formTools = [
  formTextFieldTool,
  formCheckboxTool,
  formRadioButtonTool,
  formComboboxTool,
  formListboxTool,
];
