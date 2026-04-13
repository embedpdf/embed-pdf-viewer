import {
  MouseEvent,
  useEffect,
  useRef,
  useMemo,
  suppressContentEditableWarningProps,
} from '@framework';
import {
  PdfFreeTextAnnoObject,
  PdfVerticalAlignment,
  standardFontCssProperties,
  textAlignmentToCss,
} from '@embedpdf/models';
import { useAnnotationCapability, useIOSZoomPrevention } from '../..';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { patching } from '@embedpdf/plugin-annotation';

const MIN_HIT_AREA_SCREEN_PX = 20;

interface CalloutFreeTextProps {
  documentId: string;
  isSelected: boolean;
  isEditing: boolean;
  annotation: TrackedAnnotation<PdfFreeTextAnnoObject>;
  pageIndex: number;
  scale: number;
  onClick?: (e: MouseEvent<Element>) => void;
  appearanceActive?: boolean;
}

export function CalloutFreeText({
  documentId,
  isSelected,
  isEditing,
  annotation,
  pageIndex,
  scale,
  onClick,
  appearanceActive = false,
}: CalloutFreeTextProps) {
  const editorRef = useRef<HTMLSpanElement>(null);
  const editingRef = useRef(false);
  const { provides: annotationCapability } = useAnnotationCapability();
  const annotationProvides = annotationCapability?.forDocument(documentId) ?? null;

  const obj = annotation.object;
  const rect = obj.rect;
  const rd = obj.rectangleDifferences;
  const calloutLine = obj.calloutLine;
  const strokeWidth = obj.strokeWidth ?? 1;
  const strokeColor = obj.strokeColor ?? '#000000';

  const textBox = useMemo(() => patching.computeTextBoxFromRD(rect, rd), [rect, rd]);

  // Text box position relative to the annotation rect (for CSS positioning)
  const textBoxRelative = useMemo(
    () => ({
      left: (textBox.origin.x - rect.origin.x + strokeWidth / 2) * scale,
      top: (textBox.origin.y - rect.origin.y + strokeWidth / 2) * scale,
      width: (textBox.size.width - strokeWidth) * scale,
      height: (textBox.size.height - strokeWidth) * scale,
    }),
    [textBox, rect, scale, strokeWidth],
  );

  // Callout line segments in SVG viewBox coords (relative to rect origin)
  const lineCoords = useMemo(() => {
    if (!calloutLine || calloutLine.length < 3) return null;
    return calloutLine.map((p) => ({
      x: p.x - rect.origin.x,
      y: p.y - rect.origin.y,
    }));
  }, [calloutLine, rect]);

  // Line ending at the arrow tip
  const ending = useMemo(() => {
    if (!lineCoords || lineCoords.length < 2) return null;
    const angle = Math.atan2(lineCoords[1].y - lineCoords[0].y, lineCoords[1].x - lineCoords[0].x);
    return patching.createEnding(
      obj.lineEnding,
      strokeWidth,
      angle + Math.PI,
      lineCoords[0].x,
      lineCoords[0].y,
    );
  }, [lineCoords, obj.lineEnding, strokeWidth]);

  const visualLineCoords = useMemo(() => {
    if (!lineCoords || lineCoords.length < 2) return lineCoords;
    const pts = lineCoords.map((p) => ({ ...p }));
    const last = pts.length - 1;
    const prev = last - 1;
    const dx = pts[last].x - pts[prev].x;
    const dy = pts[last].y - pts[prev].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const halfBw = strokeWidth / 2;
      pts[last].x += (dx / len) * halfBw;
      pts[last].y += (dy / len) * halfBw;
    }
    return pts;
  }, [lineCoords, strokeWidth]);

  const { adjustedFontPx, wrapperStyle } = useIOSZoomPrevention(obj.fontSize * scale, isEditing);

  useEffect(() => {
    if (isEditing && editorRef.current) {
      editingRef.current = true;
      const editor = editorRef.current;
      editor.focus();

      const tool = annotationProvides?.findToolForAnnotation(obj);
      const isDefaultContent =
        tool?.defaults?.contents != null && obj.contents === tool.defaults.contents;

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
    annotationProvides.updateAnnotation(pageIndex, obj.id, {
      contents: editorRef.current.innerText.replace(/\u00A0/g, ' '),
    });
  };

  const width = rect.size.width * scale;
  const height = rect.size.height * scale;
  const hitStrokeWidth = Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale);

  return (
    <div
      style={{
        position: 'absolute',
        width,
        height,
        cursor: isSelected && !isEditing ? 'move' : 'default',
        pointerEvents: 'none',
        zIndex: 2,
        opacity: appearanceActive ? 0 : 1,
      }}
    >
      {/* SVG overlay: callout line + text box border/fill in one coordinate space */}
      <svg
        style={{
          position: 'absolute',
          width,
          height,
          pointerEvents: 'none',
          overflow: 'visible',
        }}
        width={width}
        height={height}
        viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
      >
        {/* Hit areas for the callout line */}
        {lineCoords && (
          <>
            <polyline
              points={lineCoords.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="transparent"
              strokeWidth={hitStrokeWidth}
              onPointerDown={onClick ? (e) => onClick(e) : undefined}
              style={{
                cursor: isSelected ? 'move' : onClick ? 'pointer' : 'default',
                pointerEvents: !onClick ? 'none' : isSelected ? 'none' : 'visibleStroke',
              }}
            />
            {ending && (
              <path
                d={ending.d}
                transform={ending.transform}
                fill="transparent"
                stroke="transparent"
                strokeWidth={hitStrokeWidth}
                onPointerDown={onClick ? (e) => onClick(e) : undefined}
                style={{
                  cursor: isSelected ? 'move' : onClick ? 'pointer' : 'default',
                  pointerEvents: !onClick
                    ? 'none'
                    : isSelected
                      ? 'none'
                      : ending.filled
                        ? 'visible'
                        : 'visibleStroke',
                }}
              />
            )}
          </>
        )}

        {/* Visual callout line + text box rect */}
        {!appearanceActive && (
          <>
            {visualLineCoords && (
              <>
                <polyline
                  points={visualLineCoords.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={obj.opacity}
                  style={{ pointerEvents: 'none' }}
                />
                {ending && (
                  <path
                    d={ending.d}
                    transform={ending.transform}
                    stroke={strokeColor}
                    fill={ending.filled ? (obj.color ?? 'transparent') : 'none'}
                    strokeWidth={strokeWidth}
                    opacity={obj.opacity}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </>
            )}
            <rect
              x={textBox.origin.x - rect.origin.x + strokeWidth / 2}
              y={textBox.origin.y - rect.origin.y + strokeWidth / 2}
              width={textBox.size.width - strokeWidth}
              height={textBox.size.height - strokeWidth}
              fill={obj.color ?? obj.backgroundColor ?? 'transparent'}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              opacity={obj.opacity}
              style={{ pointerEvents: 'none' }}
            />
          </>
        )}
      </svg>

      {/* Text box hit area (covers full textBox including border) */}
      <div
        onPointerDown={onClick ? (e) => onClick(e) : undefined}
        style={{
          position: 'absolute',
          left: (textBox.origin.x - rect.origin.x) * scale,
          top: (textBox.origin.y - rect.origin.y) * scale,
          width: textBox.size.width * scale,
          height: textBox.size.height * scale,
          cursor: isSelected && !isEditing ? 'move' : onClick ? 'pointer' : 'default',
          pointerEvents: !onClick ? 'none' : isSelected && !isEditing ? 'none' : 'auto',
        }}
      />

      {/* Text content inside the text box -- always in DOM so onBlur can persist edits */}
      <span
        ref={editorRef}
        onBlur={handleBlur}
        tabIndex={0}
        style={{
          position: 'absolute',
          left: textBoxRelative.left,
          top: textBoxRelative.top,
          width: textBoxRelative.width,
          height: textBoxRelative.height,
          color: obj.fontColor,
          fontSize: adjustedFontPx,
          ...standardFontCssProperties(obj.fontFamily),
          textAlign: textAlignmentToCss(obj.textAlign),
          flexDirection: 'column',
          justifyContent:
            obj.verticalAlign === PdfVerticalAlignment.Top
              ? 'flex-start'
              : obj.verticalAlign === PdfVerticalAlignment.Middle
                ? 'center'
                : 'flex-end',
          display: 'flex',
          padding: (strokeWidth * scale) / 2 + 2 * scale,
          opacity: obj.opacity,
          lineHeight: '1.18',
          overflow: 'hidden',
          cursor: isEditing ? 'text' : 'default',
          outline: 'none',
          pointerEvents: isEditing ? 'auto' : 'none',
          ...wrapperStyle,
        }}
        contentEditable={isEditing}
        {...suppressContentEditableWarningProps}
      >
        {obj.contents}
      </span>
    </div>
  );
}
