import { Fragment } from '@framework';
import { PDF_FORM_FIELD_TYPE } from '@embedpdf/models';
import { FieldProps } from './types';
import { TextField } from './fields/text';
import { CheckboxField } from './fields/checkbox';
import { RadioButtonField } from './fields/radio-button';
import { ComboboxField } from './fields/combobox';
import { PushButtonField } from './fields/push-button';

/**
 *
 * @param props - properties of Field
 * @returns Field component
 */
export function Field(props: FieldProps) {
  const { field } = props;

  let content = null;
  const { type } = field;

  switch (type) {
    case PDF_FORM_FIELD_TYPE.TEXTFIELD:
      content = <TextField {...props} />;
      break;
    case PDF_FORM_FIELD_TYPE.CHECKBOX:
      content = <CheckboxField {...props} />;
      break;
    case PDF_FORM_FIELD_TYPE.RADIOBUTTON:
      content = <RadioButtonField {...props} />;
      break;
    case PDF_FORM_FIELD_TYPE.COMBOBOX:
      content = <ComboboxField {...props} />;
      break;
    case PDF_FORM_FIELD_TYPE.LISTBOX:
      content = <ComboboxField {...props} />;
      break;
    case PDF_FORM_FIELD_TYPE.PUSHBUTTON:
      content = <PushButtonField {...props} />;
      break;
    default:
      break;
  }

  return <Fragment>{content}</Fragment>;
}
