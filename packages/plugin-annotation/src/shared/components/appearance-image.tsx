import { useEffect, useRef, MouseEvent, TouchEvent, CSSProperties } from '@framework';
import { AnnotationAppearanceImage } from '@embedpdf/models';

interface AppearanceImageProps {
  appearance: AnnotationAppearanceImage;
  onClick?: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  style?: CSSProperties;
  isSelected?: boolean;
}

/**
 * Renders a pre-rendered annotation appearance stream image using a canvas.
 * The ImageDataLike data is drawn once and the canvas is sized to fill its container.
 */
export function AppearanceImage({ appearance, onClick, style, isSelected }: AppearanceImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { data } = appearance;
    canvas.width = data.width;
    canvas.height = data.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = new ImageData(data.data, data.width, data.height);
    ctx.putImageData(imageData, 0, 0);
  }, [appearance]);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onClick}
      onTouchStart={onClick}
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: isSelected ? 'none' : 'auto',
        cursor: 'pointer',
        ...style,
      }}
    />
  );
}
