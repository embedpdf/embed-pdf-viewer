import { FormFieldValue, PdfWidgetAnnoField, PdfWidgetAnnoObject } from '@embedpdf/models';

export interface FieldProps {
  /**
   * pdf annotation object
   */
  annotation: PdfWidgetAnnoObject;
  /**
   * Field info
   */
  field: PdfWidgetAnnoField;
  /**
   * Whether this field is editable
   */
  isEditable: boolean;
  /**
   * config
   */
  values: FormFieldValue[];
  /**
   * callback for value change
   */
  onChangeValues?: (values: FormFieldValue[]) => void;
}
