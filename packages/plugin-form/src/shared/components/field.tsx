import { useCallback, useState } from '@framework';
import { PDF_FORM_FIELD_FLAG, PDF_FORM_FIELD_TYPE, FormFieldValue } from '@embedpdf/models';
import { FieldProps } from './types';
import { TextField } from './fields/text';
import { CheckboxField } from './fields/checkbox';
import { RadioButtonField } from './fields/radio-button';
import { ComboboxField } from './fields/combobox';
import { PushButtonField } from './fields/push-button';
import { RenderWidget } from './render-widget';

export function Field(props: FieldProps) {
  const { field, isEditable, onChangeValues } = props;
  const [editing, setEditing] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  const isReadOnly = !isEditable || !!(field.flag & PDF_FORM_FIELD_FLAG.READONLY);

  const handleClick = useCallback(() => {
    if (isReadOnly) return;
    setEditing(true);
  }, [isReadOnly]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    setRenderKey((k) => k + 1);
  }, []);

  const handleChangeValues = useCallback(
    (values: FormFieldValue[]) => {
      onChangeValues?.(values);
    },
    [onChangeValues],
  );

  const handleImmediateToggle = useCallback(
    (values: FormFieldValue[]) => {
      onChangeValues?.(values);
      setEditing(false);
      setRenderKey((k) => k + 1);
    },
    [onChangeValues],
  );

  const { type } = field;
  let content = null;

  const fieldProps: FieldProps = {
    ...props,
    onBlur: handleBlur,
    autoFocus: true,
  };

  const immediateFieldProps: FieldProps = {
    ...props,
    onChangeValues: handleImmediateToggle,
    onBlur: handleBlur,
    autoFocus: true,
  };

  switch (type) {
    case PDF_FORM_FIELD_TYPE.TEXTFIELD:
      content = <TextField {...fieldProps} onChangeValues={handleChangeValues} />;
      break;
    case PDF_FORM_FIELD_TYPE.CHECKBOX:
      content = <CheckboxField {...immediateFieldProps} />;
      break;
    case PDF_FORM_FIELD_TYPE.RADIOBUTTON:
      content = <RadioButtonField {...immediateFieldProps} />;
      break;
    case PDF_FORM_FIELD_TYPE.COMBOBOX:
    case PDF_FORM_FIELD_TYPE.LISTBOX:
      content = <ComboboxField {...fieldProps} onChangeValues={handleChangeValues} />;
      break;
    case PDF_FORM_FIELD_TYPE.PUSHBUTTON:
      content = <PushButtonField {...fieldProps} />;
      break;
    default:
      break;
  }

  return (
    <div
      onClick={handleClick}
      style={{
        left: props.annotation.rect.origin.x * props.scale,
        top: props.annotation.rect.origin.y * props.scale,
        width: props.annotation.rect.size.width * props.scale,
        height: props.annotation.rect.size.height * props.scale,
        fontSize: 10 * props.scale,
        position: 'absolute',
        cursor: isReadOnly ? 'default' : 'pointer',
      }}
    >
      {!editing && (
        <RenderWidget
          pageIndex={props.pageIndex}
          annotation={props.annotation}
          scaleFactor={props.scale}
          renderKey={renderKey}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {editing && content}
    </div>
  );
}
