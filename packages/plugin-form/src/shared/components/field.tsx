import { useCallback, useEffect, useState } from '@framework';
import { PDF_FORM_FIELD_FLAG, PDF_FORM_FIELD_TYPE, PdfWidgetAnnoField } from '@embedpdf/models';
import { FieldProps, TextFieldProps, ComboboxFieldProps, PushButtonFieldProps } from './types';
import { TextField } from './fields/text';
import { ComboboxField } from './fields/combobox';
import { PushButtonField } from './fields/push-button';
import { RenderWidget } from './render-widget';
import { useFormCapability } from '../hooks/use-form';

function isToggleType(type: PDF_FORM_FIELD_TYPE): boolean {
  return type === PDF_FORM_FIELD_TYPE.CHECKBOX || type === PDF_FORM_FIELD_TYPE.RADIOBUTTON;
}

export function Field(props: FieldProps) {
  const { annotation, isEditable, onChangeField } = props;
  const field = annotation.field;
  const { provides: formProvides } = useFormCapability();
  const [editing, setEditing] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  const isReadOnly = !isEditable || !!(field.flag & PDF_FORM_FIELD_FLAG.READONLY);

  // Subscribe to the plugin's field value change events. When the plugin notifies
  // that this annotation changed (e.g. a sibling radio button was selected, causing
  // this one to be unchecked), bump renderKey so RenderWidget re-fetches the
  // appearance bitmap from the engine.
  useEffect(() => {
    if (!formProvides) return;
    return formProvides.onFieldValueChange((event) => {
      if (event.annotationId === annotation.id) {
        setRenderKey((k) => k + 1);
      }
    });
  }, [formProvides, annotation.id]);

  const handleClick = useCallback(() => {
    if (isReadOnly) return;

    if (isToggleType(field.type) && 'isChecked' in field) {
      onChangeField?.({ ...field, isChecked: !field.isChecked } as PdfWidgetAnnoField);
      // renderKey will be bumped by the onFieldValueChange event after engine settles
      return;
    }

    setEditing(true);
  }, [isReadOnly, field, onChangeField]);

  const handleBlur = useCallback(() => {
    setEditing(false);
  }, []);

  const common = {
    annotation: props.annotation,
    scale: props.scale,
    pageIndex: props.pageIndex,
    isEditable: props.isEditable,
    onBlur: handleBlur,
    inputRef: undefined as FieldProps['inputRef'],
  };

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

  const { type } = field;
  let content = null;

  switch (type) {
    case PDF_FORM_FIELD_TYPE.TEXTFIELD:
      content = (
        <TextField
          {...common}
          annotation={annotation as TextFieldProps['annotation']}
          onChangeField={onChangeField}
          inputRef={focusRef}
        />
      );
      break;
    case PDF_FORM_FIELD_TYPE.COMBOBOX:
    case PDF_FORM_FIELD_TYPE.LISTBOX:
      content = (
        <ComboboxField
          {...common}
          annotation={annotation as ComboboxFieldProps['annotation']}
          onChangeField={onChangeField}
          inputRef={focusRef}
        />
      );
      break;
    case PDF_FORM_FIELD_TYPE.PUSHBUTTON:
      content = (
        <PushButtonField
          {...common}
          annotation={annotation as PushButtonFieldProps['annotation']}
        />
      );
      break;
    default:
      break;
  }

  return (
    <div
      onClick={handleClick}
      style={{
        left: annotation.rect.origin.x * props.scale,
        top: annotation.rect.origin.y * props.scale,
        width: annotation.rect.size.width * props.scale,
        height: annotation.rect.size.height * props.scale,
        fontSize: 10 * props.scale,
        position: 'absolute',
        overflow: 'hidden',
        cursor: isReadOnly ? 'default' : 'pointer',
      }}
    >
      {!editing && (
        <RenderWidget
          pageIndex={props.pageIndex}
          annotation={annotation}
          scaleFactor={props.scale}
          renderKey={renderKey}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {editing && content}
    </div>
  );
}
