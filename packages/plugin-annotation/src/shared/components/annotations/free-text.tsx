import {
  MouseEvent,
  TouchEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  suppressContentEditableWarningProps,
} from '@framework';
import {
  PdfFreeTextAnnoObject,
  PdfVerticalAlignment,
  standardFontCssProperties,
  textAlignmentToCss,
} from '@embedpdf/models';
import { useAnnotationCapability } from '../..';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

interface FreeTextProps {
  isSelected: boolean;
  isEditing: boolean;
  annotation: TrackedAnnotation<PdfFreeTextAnnoObject>;
  pageIndex: number;
  scale: number;
  onClick?: (e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

export function FreeText({
  isSelected,
  isEditing,
  annotation,
  pageIndex,
  scale,
  onClick,
}: FreeTextProps) {
  const editorRef = useRef<HTMLSpanElement>(null);
  const { provides: annotationProvides } = useAnnotationCapability();
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (isEditing && editorRef.current) {
      const editor = editorRef.current;
      editor.focus();

      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [isEditing]);

  useLayoutEffect(() => {
    try {
      const nav = navigator as any;
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
      setIsIOS(ios);
    } catch {
      setIsIOS(false);
    }
  }, []);

  const handleBlur = () => {
    if (!annotationProvides) return;
    if (!editorRef.current) return;
    annotationProvides.updateAnnotation(pageIndex, annotation.object.id, {
      contents: editorRef.current.innerText,
    });
  };

  // iOS zoom prevention: keep focused font-size >= 16px, visually scale down if needed.
  const computedFontPx = annotation.object.fontSize * scale;
  const MIN_IOS_FOCUS_FONT_PX = 16;
  const needsComp =
    isIOS && isEditing && computedFontPx > 0 && computedFontPx < MIN_IOS_FOCUS_FONT_PX;
  const adjustedFontPx = needsComp ? MIN_IOS_FOCUS_FONT_PX : computedFontPx;
  const scaleComp = needsComp ? computedFontPx / MIN_IOS_FOCUS_FONT_PX : 1;
  const invScalePercent = needsComp ? 100 / scaleComp : 100;

  return (
    <div
      style={{
        position: 'absolute',
        width: annotation.object.rect.size.width * scale,
        height: annotation.object.rect.size.height * scale,
        cursor: isSelected && !isEditing ? 'move' : 'default',
        pointerEvents: isSelected && !isEditing ? 'none' : 'auto',
        zIndex: 2,
      }}
      onPointerDown={onClick}
      onTouchStart={onClick}
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
          width: needsComp ? `${invScalePercent}%` : '100%',
          height: needsComp ? `${invScalePercent}%` : '100%',
          lineHeight: '1.18',
          overflow: 'hidden',
          cursor: isEditing ? 'text' : 'pointer',
          outline: 'none',
          transform: needsComp ? `scale(${scaleComp})` : undefined,
          transformOrigin: 'top left',
        }}
        contentEditable={isEditing}
        {...suppressContentEditableWarningProps}
      >
        {annotation.object.contents}
      </span>
    </div>
  );
}
