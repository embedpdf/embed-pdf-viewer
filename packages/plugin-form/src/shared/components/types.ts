import {
  FormFieldValue,
  PdfWidgetAnnoField,
  PdfWidgetAnnoObject,
  PdfTextWidgetAnnoField,
  PdfCheckboxWidgetAnnoField,
  PdfRadioButtonWidgetAnnoField,
  PdfComboboxWidgetAnnoField,
  PdfListboxWidgetAnnoField,
  PdfPushButtonWidgetAnnoField,
} from '@embedpdf/models';

export interface FieldProps {
  annotation: PdfWidgetAnnoObject;
  scale: number;
  pageIndex: number;
  field: PdfWidgetAnnoField;
  isEditable: boolean;
  values: FormFieldValue[];
  onChangeValues?: (values: FormFieldValue[]) => void;
  onBlur?: () => void;
  inputRef?: (el: HTMLElement | null) => void;
}

export type TextFieldProps = Omit<FieldProps, 'field'> & {
  field: PdfTextWidgetAnnoField;
};

export type CheckboxFieldProps = Omit<FieldProps, 'field'> & {
  field: PdfCheckboxWidgetAnnoField;
};

export type RadioButtonFieldProps = Omit<FieldProps, 'field'> & {
  field: PdfRadioButtonWidgetAnnoField;
};

export type ComboboxFieldProps = Omit<FieldProps, 'field'> & {
  field: PdfComboboxWidgetAnnoField | PdfListboxWidgetAnnoField;
};

export type PushButtonFieldProps = Omit<FieldProps, 'field'> & {
  field: PdfPushButtonWidgetAnnoField;
};
