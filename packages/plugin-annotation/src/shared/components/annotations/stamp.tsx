import { MouseEvent, TouchEvent } from '@framework';
import { PdfStampAnnoObject } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { RenderAnnotation } from '../render-annotation';

interface StampProps {
  isSelected: boolean;
  annotation: TrackedAnnotation<PdfStampAnnoObject>;
  pageIndex: number;
  scale: number;
  onClick: (e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => void;
}

export function Stamp({ isSelected, annotation, pageIndex, scale, onClick }: StampProps) {
  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        zIndex: 2,
        pointerEvents: isSelected ? 'none' : 'auto',
        cursor: 'pointer',
      }}
      onPointerDown={onClick}
      onTouchStart={onClick}
    >
      <RenderAnnotation
        pageIndex={pageIndex}
        annotation={{ ...annotation.object, id: annotation.object.id }}
        scaleFactor={scale}
      />
    </div>
  );
}
