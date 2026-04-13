import { useCallback, useEffect, useRef, useState } from '@framework';
import { PdfWidgetAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '@embedpdf/plugin-annotation/@framework';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { useFormDocumentState } from '../../hooks/use-form';
import { RenderWidget } from '../render-widget';
import { ListboxField } from '../fields/listbox';
import { ListboxFieldProps } from '../types';

export function ListboxFillMode(props: AnnotationRendererProps<PdfWidgetAnnoObject>) {
  const { annotation, scale, pageIndex, scope, handleChangeField, renderKey, isReadOnly } =
    useFormWidgetState(props);
  const formState = useFormDocumentState(props.documentId);
  const [editing, setEditing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isFocused = formState.selectedFieldId === annotation.id;

  useEffect(() => {
    if (isFocused && wrapperRef.current && !wrapperRef.current.contains(document.activeElement)) {
      wrapperRef.current.focus();
    }
  }, [isFocused]);

  const handleFocus = useCallback(() => {
    if (isReadOnly) return;
    scope?.selectField(annotation.id);
    setEditing(true);
  }, [isReadOnly, scope, annotation.id]);

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      if (wrapperRef.current?.contains(document.activeElement)) return;
      setEditing(false);
      if (scope?.getSelectedFieldId() === annotation.id) {
        scope?.deselectField();
      }
    });
  }, [scope, annotation.id]);

  return (
    <div
      ref={wrapperRef}
      tabIndex={isReadOnly ? -1 : 0}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isReadOnly ? 'default' : 'pointer',
        pointerEvents: 'auto',
        outline: isFocused && !editing ? '2px solid rgba(66, 133, 244, 0.8)' : 'none',
        outlineOffset: -2,
      }}
    >
      <ListboxField
        annotation={annotation as ListboxFieldProps['annotation']}
        scale={scale}
        pageIndex={pageIndex}
        isEditable={true}
        onChangeField={handleChangeField}
      />
      {!editing && (
        <RenderWidget
          pageIndex={pageIndex}
          annotation={annotation}
          scaleFactor={scale}
          renderKey={renderKey}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}
