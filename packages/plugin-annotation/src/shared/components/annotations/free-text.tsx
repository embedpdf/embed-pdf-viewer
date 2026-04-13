import { MouseEvent, useEffect, useRef, suppressContentEditableWarningProps } from '@framework';
import {
  PdfFreeTextAnnoObject,
  PdfVerticalAlignment,
  standardFontCssProperties,
  textAlignmentToCss,
} from '@embedpdf/models';
import { useAnnotationCapability, useIOSZoomPrevention } from '../..';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

interface FreeTextProps {
  documentId: string;
  isSelected: boolean;
  isEditing: boolean;
  annotation: TrackedAnnotation<PdfFreeTextAnnoObject>;
  pageIndex: number;
  scale: number;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLDivElement>) => void;
  /** When true, AP canvas provides the visual; hide text content */
  appearanceActive?: boolean;
}

export function FreeText({
  documentId,
  isSelected,
  isEditing,
  annotation,
  pageIndex,
  scale,
  onClick,
  appearanceActive = false,
}: FreeTextProps) {
  const editorRef = useRef<HTMLSpanElement>(null);
  const editingRef = useRef(false);
  const { provides: annotationCapability } = useAnnotationCapability();
  const annotationProvides = annotationCapability?.forDocument(documentId) ?? null;
  const { adjustedFontPx, wrapperStyle } = useIOSZoomPrevention(
    annotation.object.fontSize * scale,
    isEditing,
  );

  useEffect(() => {
    if (isEditing && editorRef.current) {
      editingRef.current = true;
      const editor = editorRef.current;
      editor.focus();

      const tool = annotationProvides?.findToolForAnnotation(annotation.object);
      const isDefaultContent =
        tool?.defaults?.contents != null && annotation.object.contents === tool.defaults.contents;

      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        if (!isDefaultContent) {
          range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [isEditing]);

  const handleBlur = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    if (!annotationProvides) return;
    if (!editorRef.current) return;
    annotationProvides.updateAnnotation(pageIndex, annotation.object.id, {
      contents: editorRef.current.innerText.replace(/\u00A0/g, ' '),
    });
  };

  return (
    <div
      style={{
        position: 'absolute',
        width: annotation.object.rect.size.width * scale,
        height: annotation.object.rect.size.height * scale,
        cursor: isSelected && !isEditing ? 'move' : 'default',
        pointerEvents: !onClick ? 'none' : isSelected && !isEditing ? 'none' : 'auto',
        zIndex: 2,
        opacity: appearanceActive ? 0 : 1,
      }}
      onPointerDown={onClick}
    >
      <span
        ref={editorRef}
        onBlur={handleBlur}
        tabIndex={0}
        style={{
          color: annotation.object.fontColor,
          fontSize: adjustedFontPx,
          ...standardFontCssProperties(annotation.object.fontFamily),
          textAlign: textAlignmentToCss(annotation.object.textAlign),
          flexDirection: 'column',
          justifyContent:
            annotation.object.verticalAlign === PdfVerticalAlignment.Top
              ? 'flex-start'
              : annotation.object.verticalAlign === PdfVerticalAlignment.Middle
                ? 'center'
                : 'flex-end',
          display: 'flex',
          backgroundColor: annotation.object.color ?? annotation.object.backgroundColor,
          opacity: annotation.object.opacity,
          width: '100%',
          height: '100%',
          lineHeight: '1.18',
          overflow: 'hidden',
          cursor: isEditing ? 'text' : onClick ? 'pointer' : 'default',
          outline: 'none',
          ...wrapperStyle,
        }}
        contentEditable={isEditing}
        {...suppressContentEditableWarningProps}
      >
        {annotation.object.contents}
      </span>
    </div>
  );
}
