import { CSSProperties, MouseEvent, useState } from '@framework';
import { PdfWidgetAnnoObject, isWidgetChecked } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface FormCheckboxProps {
  annotation: TrackedAnnotation<PdfWidgetAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick?: (e: MouseEvent<Element>) => void;
  style?: CSSProperties;
}

export function FormCheckbox({ annotation, isSelected, scale, onClick, style }: FormCheckboxProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { object } = annotation;

  const isChecked = isWidgetChecked(object);

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
          viewBox="0 0 100 100"
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <path
            d="M28 48C27.45 50.21 29.45 63.13 30 67C30.55 69.21 34.58 72 39 72C44.52 71.45 76.55 32.55 76 32C77.1 31.45 76 25 76 25C74.34 22.24 68 25.45 68 26C68 26 43.55 53 43 53C41.34 53 40.55 41.1 40 40C33.37 36.69 29.1 45.79 28 48Z"
            fill="#000000"
          />
        </svg>
      )}
    </div>
  );
}
