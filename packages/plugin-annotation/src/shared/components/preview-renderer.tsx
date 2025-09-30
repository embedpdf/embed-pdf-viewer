import { AnyPreviewState } from '@embedpdf/plugin-annotation';
import { Circle } from './annotations/circle';
import { Square } from './annotations/square';
import { Polygon } from './annotations/polygon';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { Polyline } from './annotations/polyline';
import { Line } from './annotations/line';
import { Ink } from './annotations/ink';

interface Props {
  preview: AnyPreviewState;
  scale: number;
}

export function PreviewRenderer({ preview, scale }: Props) {
  const { bounds } = preview;

  const style = {
    position: 'absolute' as const,
    left: bounds.origin.x * scale,
    top: bounds.origin.y * scale,
    width: bounds.size.width * scale,
    height: bounds.size.height * scale,
    pointerEvents: 'none' as const,
    zIndex: 10,
  };

  // Use type guards for proper type narrowing
  if (preview.type === PdfAnnotationSubtype.CIRCLE) {
    return (
      <div style={style}>
        <Circle isSelected={false} scale={scale} {...preview.data} />
      </div>
    );
  }

  if (preview.type === PdfAnnotationSubtype.SQUARE) {
    return (
      <div style={style}>
        <Square isSelected={false} scale={scale} {...preview.data} />
      </div>
    );
  }

  if (preview.type === PdfAnnotationSubtype.POLYGON) {
    return (
      <div style={style}>
        <Polygon isSelected={false} scale={scale} {...preview.data} />
      </div>
    );
  }

  if (preview.type === PdfAnnotationSubtype.POLYLINE) {
    return (
      <div style={style}>
        <Polyline isSelected={false} scale={scale} {...preview.data} />
      </div>
    );
  }

  if (preview.type === PdfAnnotationSubtype.LINE) {
    return (
      <div style={style}>
        <Line isSelected={false} scale={scale} {...preview.data} />
      </div>
    );
  }

  if (preview.type === PdfAnnotationSubtype.INK) {
    return (
      <div style={style}>
        <Ink isSelected={false} scale={scale} {...preview.data} />
      </div>
    );
  }

  if (preview.type === PdfAnnotationSubtype.FREETEXT) {
    return (
      <div style={style}>
        {/* Render a simple dashed border preview */}
        <div
          style={{
            width: '100%',
            height: '100%',
            border: `1px dashed ${preview.data.fontColor || '#000000'}`,
            backgroundColor: 'transparent',
          }}
        />
      </div>
    );
  }

  return null;
}
