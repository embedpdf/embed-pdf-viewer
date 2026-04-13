import { CSSProperties, MouseEvent, useState } from '@framework';
import { PdfWidgetAnnoObject, isWidgetChecked } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface FormRadioButtonProps {
  annotation: TrackedAnnotation<PdfWidgetAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick?: (e: MouseEvent<Element>) => void;
  style?: CSSProperties;
}

export function FormRadioButton({
  annotation,
  isSelected,
  scale,
  onClick,
  style,
}: FormRadioButtonProps) {
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
        borderRadius: '50%',
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
        <div
          style={{
            width: '50%',
            height: '50%',
            borderRadius: '50%',
            background: '#000000',
          }}
        />
      )}
    </div>
  );
}
