import { useCallback, useEffect, useRef } from '@framework';
import { PdfWidgetAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '@embedpdf/plugin-annotation/@framework';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { useFormDocumentState } from '../../hooks/use-form';
import { RenderWidget } from '../render-widget';
import { ComboboxField } from '../fields/combobox';
import { ComboboxFieldProps } from '../types';

export function ComboboxFillMode(props: AnnotationRendererProps<PdfWidgetAnnoObject>) {
  const { annotation, scale, pageIndex, scope, handleChangeField, renderKey, isReadOnly } =
    useFormWidgetState(props);
  const formState = useFormDocumentState(props.documentId);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectElRef = useRef<HTMLElement | null>(null);

  const isFocused = formState.selectedFieldId === annotation.id;

  useEffect(() => {
    if (isFocused && wrapperRef.current && !wrapperRef.current.contains(document.activeElement)) {
      (selectElRef.current ?? wrapperRef.current).focus();
    }
  }, [isFocused]);

  const handleFocus = useCallback(() => {
    scope?.selectField(annotation.id);
  }, [scope, annotation.id]);

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      if (wrapperRef.current?.contains(document.activeElement)) return;
      if (scope?.getSelectedFieldId() === annotation.id) {
        scope?.deselectField();
      }
    });
  }, [scope, annotation.id]);

  const selectInputRef = useCallback((el: HTMLElement | null) => {
    selectElRef.current = el;
  }, []);

  return (
    <div
      ref={wrapperRef}
      onFocus={handleFocus}
      onBlur={handleBlur}
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
      <ComboboxField
        annotation={annotation as ComboboxFieldProps['annotation']}
        scale={scale}
        pageIndex={pageIndex}
        isEditable={true}
        onChangeField={handleChangeField}
        inputRef={selectInputRef}
      />
    </div>
  );
}
