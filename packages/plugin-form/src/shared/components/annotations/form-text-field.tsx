import { CSSProperties, MouseEvent, useState } from '@framework';
import {
  PdfWidgetAnnoObject,
  PDF_FORM_FIELD_TYPE,
  standardFontCssProperties,
} from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface FormTextFieldProps {
  annotation: TrackedAnnotation<PdfWidgetAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick: (e: MouseEvent<Element>) => void;
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

  return (
    <div
      onPointerDown={!isSelected ? onClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        inset: 0,
        background: object.color ?? 'rgba(255, 255, 255, 0.9)',
        border: `${(object.strokeWidth ?? 1) * scale}px solid ${object.strokeColor ?? 'rgba(0, 0, 0, 0.2)'}`,
        outline: isHovered || isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none',
        outlineOffset: -1,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        cursor: isSelected ? 'move' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${2 * scale}px`,
        overflow: 'hidden',
        ...style,
      }}
    >
      <span
        style={{
          fontSize: (object.fontSize ?? 12) * scale,
          ...standardFontCssProperties(object.fontFamily),
          color: object.fontColor ?? '#000000',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}
