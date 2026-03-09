import { PreviewState } from '@embedpdf/plugin-annotation';
import { Circle } from './annotations/circle';
import { Square } from './annotations/square';
import { Polygon } from './annotations/polygon';
import { blendModeToCss, PdfAnnotationSubtype, PdfBlendMode } from '@embedpdf/models';
import { Polyline } from './annotations/polyline';
import { Line } from './annotations/line';
import { Ink } from './annotations/ink';
import { useRegisteredRenderers } from '../context/renderer-registry';

interface Props {
  toolId: string;
  preview: PreviewState;
  scale: number;
}

export function PreviewRenderer({ toolId, preview, scale }: Props) {
  const { bounds } = preview;
  const registeredRenderers = useRegisteredRenderers();

  const style = {
    position: 'absolute' as const,
    left: bounds.origin.x * scale,
    top: bounds.origin.y * scale,
    width: bounds.size.width * scale,
    height: bounds.size.height * scale,
    pointerEvents: 'none' as const,
    zIndex: 10,
  };

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
      <div
        style={{
          ...style,
          mixBlendMode: blendModeToCss(preview.data.blendMode ?? PdfBlendMode.Normal),
        }}
      >
        <Ink isSelected={false} scale={scale} {...preview.data} />
      </div>
    );
  }

  if (preview.type === PdfAnnotationSubtype.FREETEXT) {
    return (
      <div style={style}>
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

  const match = registeredRenderers.find((r) => r.id === toolId && r.renderPreview);
  if (match?.renderPreview) {
    return (
      <div style={style}>
        {match.renderPreview({ data: preview.data, bounds: preview.bounds, scale })}
      </div>
    );
  }

  return null;
}
