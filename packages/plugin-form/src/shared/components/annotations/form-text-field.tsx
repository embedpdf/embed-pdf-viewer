import { CSSProperties, MouseEvent, useState } from '@framework';
import {
  PdfWidgetAnnoObject,
  PDF_FORM_FIELD_TYPE,
  PDF_FORM_FIELD_FLAG,
  PdfTextWidgetAnnoField,
  standardFontCssProperties,
} from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface FormTextFieldProps {
  annotation: TrackedAnnotation<PdfWidgetAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick?: (e: MouseEvent<Element>) => void;
  style?: CSSProperties;
}

export function FormTextField({
  annotation,
  isSelected,
  scale,
  onClick,
  style,
}: FormTextFieldProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { object } = annotation;

  const field = object.field;
  const isTextField = field.type === PDF_FORM_FIELD_TYPE.TEXTFIELD;
  const value = isTextField ? field.value : '';

  const isComb =
    isTextField &&
    !!(field.flag & PDF_FORM_FIELD_FLAG.TEXT_COMB) &&
    !!(field as PdfTextWidgetAnnoField).maxLen;
  const isMultiline = isTextField && !!(field.flag & PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE);
  const maxLen = isTextField ? (field as PdfTextWidgetAnnoField).maxLen : undefined;

  const borderWidth = (object.strokeWidth ?? 1) * scale;
  const fontStyle: CSSProperties = {
    fontSize: (object.fontSize ?? 12) * scale,
    ...standardFontCssProperties(object.fontFamily),
    color: object.fontColor ?? '#000000',
    lineHeight: 1.2,
  };

  return (
    <div
      onPointerDown={!isSelected ? onClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        inset: 0,
        background: object.color ?? 'rgba(255, 255, 255, 0.9)',
        border: `${borderWidth}px solid ${object.strokeColor ?? 'rgba(0, 0, 0, 0.2)'}`,
        outline: isHovered || isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none',
        outlineOffset: -1,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        cursor: isSelected ? 'move' : 'pointer',
        display: 'flex',
        alignItems: isMultiline ? 'flex-start' : 'center',
        overflow: 'hidden',
        ...(!isComb ? { padding: `${borderWidth}px ${borderWidth}px` } : {}),
        ...style,
      }}
    >
      {isComb && maxLen ? (
        <CombPreview
          value={value ?? ''}
          maxLen={maxLen}
          scale={scale}
          width={object.rect.size.width}
          fontStyle={fontStyle}
          strokeColor={object.strokeColor ?? 'rgba(0, 0, 0, 0.2)'}
        />
      ) : (
        <span
          style={{
            ...fontStyle,
            display: 'block',
            width: '100%',
            whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap',
            wordBreak: isMultiline ? 'break-word' : 'normal',
            overflowWrap: isMultiline ? 'break-word' : 'normal',
            overflow: 'hidden',
            textOverflow: isMultiline ? 'clip' : 'ellipsis',
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function CombPreview({
  value,
  maxLen,
  scale,
  width,
  fontStyle,
  strokeColor,
}: {
  value: string;
  maxLen: number;
  scale: number;
  width: number;
  fontStyle: CSSProperties;
  strokeColor: string;
}) {
  const cellWidth = (width * scale) / maxLen;
  const chars = value.split('');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {Array.from({ length: maxLen }).map((_, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            left: i * cellWidth,
            width: cellWidth,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: i < maxLen - 1 ? `1px solid ${strokeColor}` : 'none',
            boxSizing: 'border-box',
            ...fontStyle,
          }}
        >
          {chars[i] || ''}
        </span>
      ))}
    </div>
  );
}
