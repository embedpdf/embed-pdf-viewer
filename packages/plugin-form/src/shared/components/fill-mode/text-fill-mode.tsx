import { useCallback, useEffect, useRef, useState } from '@framework';
import { PdfWidgetAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '@embedpdf/plugin-annotation/@framework';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { useFormDocumentState } from '../../hooks/use-form';
import { RenderWidget } from '../render-widget';
import { TextField } from '../fields/text';
import { TextFieldProps } from '../types';

export function TextFillMode(props: AnnotationRendererProps<PdfWidgetAnnoObject>) {
  const { annotation, scale, pageIndex, scope, handleChangeField, renderKey, isReadOnly } =
    useFormWidgetState(props);
  const formState = useFormDocumentState(props.documentId);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLElement | null>(null);

  const isFocused = formState.selectedFieldId === annotation.id;

  useEffect(() => {
    if (isFocused && inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  const handleFocus = useCallback(() => {
    if (isReadOnly) return;
    scope?.selectField(annotation.id);
    setEditing(true);
  }, [isReadOnly, scope, annotation.id]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    if (scope?.getSelectedFieldId() === annotation.id) {
      scope?.deselectField();
    }
  }, [scope, annotation.id]);

  const handleInputRef = useCallback((el: HTMLElement | null) => {
    inputRef.current = el;
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        pointerEvents: 'auto',
        outline: 'none',
      }}
    >
      <RenderWidget
        pageIndex={pageIndex}
        annotation={annotation}
        scaleFactor={scale}
        renderKey={renderKey}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          visibility: editing ? 'hidden' : 'visible',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          opacity: editing ? 1 : 0,
        }}
      >
        <TextField
          annotation={annotation as TextFieldProps['annotation']}
          scale={scale}
          pageIndex={pageIndex}
          isEditable={true}
          onChangeField={handleChangeField}
          syncExternalValue={!editing}
          onFocus={handleFocus}
          onBlur={handleBlur}
          inputRef={handleInputRef}
        />
      </div>
    </div>
  );
}
