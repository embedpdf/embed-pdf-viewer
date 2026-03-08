import {
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
  isEditable: boolean;
  onChangeField?: (field: PdfWidgetAnnoField) => void;
  onBlur?: () => void;
  inputRef?: (el: HTMLElement | null) => void;
}

export type TextFieldProps = Omit<FieldProps, 'annotation'> & {
  annotation: PdfWidgetAnnoObject & { field: PdfTextWidgetAnnoField };
};

export type CheckboxFieldProps = Omit<FieldProps, 'annotation'> & {
  annotation: PdfWidgetAnnoObject & { field: PdfCheckboxWidgetAnnoField };
};

export type RadioButtonFieldProps = Omit<FieldProps, 'annotation'> & {
  annotation: PdfWidgetAnnoObject & { field: PdfRadioButtonWidgetAnnoField };
};

export type ComboboxFieldProps = Omit<FieldProps, 'annotation'> & {
  annotation: PdfWidgetAnnoObject & {
    field: PdfComboboxWidgetAnnoField | PdfListboxWidgetAnnoField;
  };
};

export type PushButtonFieldProps = Omit<FieldProps, 'annotation'> & {
  annotation: PdfWidgetAnnoObject & { field: PdfPushButtonWidgetAnnoField };
};
