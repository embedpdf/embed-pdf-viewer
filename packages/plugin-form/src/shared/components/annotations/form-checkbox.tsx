import { CSSProperties, MouseEvent, useState } from '@framework';
import { PdfWidgetAnnoObject, PDF_FORM_FIELD_TYPE } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface FormCheckboxProps {
  annotation: TrackedAnnotation<PdfWidgetAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick: (e: MouseEvent<Element>) => void;
  style?: CSSProperties;
}

export function FormCheckbox({ annotation, isSelected, scale, onClick, style }: FormCheckboxProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { object } = annotation;

  const field = object.field;
  const isChecked = field.type === PDF_FORM_FIELD_TYPE.CHECKBOX && field.isChecked;

  return (
    <div
      onPointerDown={!isSelected ? onClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        inset: 0,
        background: object.color ?? '#FFFFFF',
        border: `${(object.strokeWidth ?? 1) * scale}px solid ${object.strokeColor ?? '#000000'}`,
        outline: isHovered || isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none',
        outlineOffset: -1,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        cursor: isSelected ? 'move' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {isChecked && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            width: '70%',
            height: '70%',
            color: object.strokeColor ?? '#000000',
          }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}
