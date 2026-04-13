import { CSSProperties, MouseEvent, useState } from '@framework';
import {
  PdfWidgetAnnoObject,
  PDF_FORM_FIELD_TYPE,
  standardFontCssProperties,
} from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface FormListboxProps {
  annotation: TrackedAnnotation<PdfWidgetAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick?: (e: MouseEvent<Element>) => void;
  style?: CSSProperties;
}

export function FormListbox({ annotation, isSelected, scale, onClick, style }: FormListboxProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { object } = annotation;

  const field = object.field;
  const options = field.type === PDF_FORM_FIELD_TYPE.LISTBOX ? field.options : [];
  const borderWidth = (object.strokeWidth ?? 1) * scale;
  const fontSize = (object.fontSize ?? 12) * scale;
  const lineHeight = fontSize * 1.2;

  return (
    <div
      onPointerDown={!isSelected ? onClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        inset: 0,
        background: object.color ?? '#FFFFFF',
        border: `${borderWidth}px solid ${object.strokeColor ?? '#000000'}`,
        outline: isHovered || isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none',
        outlineOffset: -1,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        cursor: isSelected ? 'move' : 'pointer',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {options.map((opt, i) => (
        <div
          key={i}
          style={{
            padding: `0 ${4 * scale}px`,
            fontSize,
            lineHeight: `${lineHeight}px`,
            ...standardFontCssProperties(object.fontFamily),
            color: opt.isSelected ? '#FFFFFF' : (object.fontColor ?? '#000000'),
            background: opt.isSelected ? 'rgba(0, 51, 113, 1)' : 'transparent',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}
