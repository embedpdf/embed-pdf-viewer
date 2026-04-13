import { CSSProperties, MouseEvent, useState } from '@framework';
import {
  PdfWidgetAnnoObject,
  PDF_FORM_FIELD_TYPE,
  standardFontCssProperties,
} from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface FormComboboxProps {
  annotation: TrackedAnnotation<PdfWidgetAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick?: (e: MouseEvent<Element>) => void;
  style?: CSSProperties;
}

export function FormCombobox({ annotation, isSelected, scale, onClick, style }: FormComboboxProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { object } = annotation;

  const field = object.field;
  const options = field.type === PDF_FORM_FIELD_TYPE.COMBOBOX ? field.options : [];
  const selectedLabel = options.find((o) => o.isSelected)?.label ?? '';
  const borderWidth = (object.strokeWidth ?? 1) * scale;
  const fontSize = (object.fontSize ?? 12) * scale;

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
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        ...style,
      }}
    >
      <span
        style={{
          flex: 1,
          padding: `0 ${4 * scale}px`,
          fontSize,
          ...standardFontCssProperties(object.fontFamily),
          color: object.fontColor ?? '#000000',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {selectedLabel}
      </span>
      <div
        style={{
          width: 13 * scale,
          minWidth: 13 * scale,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderLeft: `1px solid ${object.strokeColor ?? '#000000'}`,
        }}
      >
        <svg viewBox="0 0 10 6" style={{ width: 8 * scale, height: 5 * scale }} fill="currentColor">
          <path d="M0 0 L5 6 L10 0 Z" />
        </svg>
      </div>
    </div>
  );
}
