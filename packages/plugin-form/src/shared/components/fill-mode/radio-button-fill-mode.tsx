import { useCallback, useEffect, useRef } from '@framework';
import { PdfWidgetAnnoObject, isWidgetChecked } from '@embedpdf/models';
import { AnnotationRendererProps } from '@embedpdf/plugin-annotation/@framework';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { useFormDocumentState } from '../../hooks/use-form';
import { RenderWidget } from '../render-widget';

export function RadioButtonFillMode(props: AnnotationRendererProps<PdfWidgetAnnoObject>) {
  const { annotation, field, scale, pageIndex, scope, handleChangeField, renderKey, isReadOnly } =
    useFormWidgetState(props);
  const formState = useFormDocumentState(props.documentId);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isFocused = formState.selectedFieldId === annotation.id;

  useEffect(() => {
    if (isFocused && wrapperRef.current && document.activeElement !== wrapperRef.current) {
      wrapperRef.current.focus();
    }
  }, [isFocused]);

  const selectRadio = useCallback(() => {
    if (isReadOnly) return;
    if (!isWidgetChecked(annotation) && annotation.exportValue) {
      handleChangeField({ ...field, value: annotation.exportValue });
    }
  }, [isReadOnly, annotation, field, handleChangeField]);

  const handleClick = useCallback(() => {
    if (isReadOnly) return;
    scope?.selectField(annotation.id);
    selectRadio();
  }, [isReadOnly, scope, annotation.id, selectRadio]);

  const handleFocus = useCallback(() => {
    if (isReadOnly) return;
    scope?.selectField(annotation.id);
  }, [isReadOnly, scope, annotation.id]);

  const handleBlur = useCallback(() => {
    if (scope?.getSelectedFieldId() === annotation.id) {
      scope?.deselectField();
    }
  }, [scope, annotation.id]);

  const handleKeyDown = useCallback(
    (e: { key: string; preventDefault: () => void }) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        selectRadio();
      }
    },
    [selectRadio],
  );

  return (
    <div
      ref={wrapperRef}
      tabIndex={isReadOnly ? -1 : 0}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isReadOnly ? 'default' : 'pointer',
        pointerEvents: 'auto',
        outline: isFocused ? '2px solid rgba(66, 133, 244, 0.8)' : 'none',
        outlineOffset: -2,
      }}
    >
      <RenderWidget
        pageIndex={pageIndex}
        annotation={annotation}
        scaleFactor={scale}
        renderKey={renderKey}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}
