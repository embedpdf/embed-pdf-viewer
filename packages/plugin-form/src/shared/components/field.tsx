import { useCallback, useState } from '@framework';
import { PDF_FORM_FIELD_FLAG, PDF_FORM_FIELD_TYPE, FormFieldValue } from '@embedpdf/models';
import { FieldProps } from './types';
import { TextField } from './fields/text';
import { ComboboxField } from './fields/combobox';
import { PushButtonField } from './fields/push-button';
import { RenderWidget } from './render-widget';

function isToggleType(type: PDF_FORM_FIELD_TYPE): boolean {
  return type === PDF_FORM_FIELD_TYPE.CHECKBOX || type === PDF_FORM_FIELD_TYPE.RADIOBUTTON;
}

export function Field(props: FieldProps) {
  const { field, isEditable, onChangeValues } = props;
  const [editing, setEditing] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  const isReadOnly = !isEditable || !!(field.flag & PDF_FORM_FIELD_FLAG.READONLY);

  const isToggleChecked =
    isToggleType(field.type) &&
    (props.values?.[0]?.kind === 'checked'
      ? props.values[0].isChecked
      : 'isChecked' in field && field.isChecked);

  const handleClick = useCallback(() => {
    if (isReadOnly) return;

    if (isToggleType(field.type)) {
      const currentChecked =
        props.values?.[0]?.kind === 'checked'
          ? props.values[0].isChecked
          : 'isChecked' in field && field.isChecked;
      onChangeValues?.([{ kind: 'checked', isChecked: !currentChecked }]);
      setRenderKey((k) => k + 1);
      return;
    }

    setEditing(true);
  }, [isReadOnly, field, props.values, onChangeValues]);

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

  const focusRef = useCallback((el: HTMLElement | null) => {
    if (el) {
      el.focus();
      if (el instanceof HTMLSelectElement) {
        try {
          el.showPicker();
        } catch {
          /* older browsers */
        }
      }
    }
  }, []);

  const common = {
    annotation: props.annotation,
    scale: props.scale,
    pageIndex: props.pageIndex,
    isEditable: props.isEditable,
    values: props.values,
    onBlur: handleBlur,
    inputRef: focusRef,
  };

  const { type } = field;
  let content = null;

  switch (type) {
    case PDF_FORM_FIELD_TYPE.TEXTFIELD:
      content = <TextField {...common} field={field} onChangeValues={handleChangeValues} />;
      break;
    case PDF_FORM_FIELD_TYPE.COMBOBOX:
    case PDF_FORM_FIELD_TYPE.LISTBOX:
      content = <ComboboxField {...common} field={field} onChangeValues={handleChangeValues} />;
      break;
    case PDF_FORM_FIELD_TYPE.PUSHBUTTON:
      content = <PushButtonField {...common} field={field} />;
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
        overflow: 'hidden',
        cursor: isReadOnly ? 'default' : 'pointer',
      }}
    >
      {!editing && (!isToggleType(field.type) || isToggleChecked) && (
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
