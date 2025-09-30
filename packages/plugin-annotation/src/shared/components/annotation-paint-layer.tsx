import { useEffect, useMemo, useRef, useState } from '@framework';
import { useAnnotationPlugin } from '../hooks';
import { AnyPreviewState, HandlerServices } from '@embedpdf/plugin-annotation';
import { PreviewRenderer } from './preview-renderer';

interface Props {
  pageIndex: number;
  scale: number;
}

export function AnnotationPaintLayer({ pageIndex, scale }: Props) {
  const { plugin: annotationPlugin } = useAnnotationPlugin();
  const [previews, setPreviews] = useState<Map<string, AnyPreviewState>>(new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const services = useMemo<HandlerServices>(
    () => ({
      requestFile: ({ accept, onFile }) => {
        if (!fileInputRef.current) return;
        const input = fileInputRef.current;
        input.accept = accept;
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            onFile(file);
            input.value = '';
          }
        };
        input.click();
      },
      processImage: ({ source, maxWidth, maxHeight, onComplete }) => {
        const canvas = canvasRef.current;
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          let { naturalWidth: width, naturalHeight: height } = img;

          // --- SCALING LOGIC ---
          // Calculate the scale factor to fit within maxWidth and maxHeight
          const scaleX = maxWidth ? maxWidth / width : 1;
          const scaleY = maxHeight ? maxHeight / height : 1;
          const scaleFactor = Math.min(scaleX, scaleY, 1); // Ensure we don't scale up

          const finalWidth = width * scaleFactor;
          const finalHeight = height * scaleFactor;

          canvas.width = finalWidth;
          canvas.height = finalHeight;
          ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

          const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight);
          if (typeof source !== 'string') URL.revokeObjectURL(img.src);

          onComplete({ imageData, width: finalWidth, height: finalHeight });
        };
        img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
      },
    }),
    [],
  );

  useEffect(() => {
    if (!annotationPlugin) return;

    return annotationPlugin.registerPageHandlers(pageIndex, scale, {
      services,
      onPreview: (toolId, state) => {
        setPreviews((prev) => {
          const next = new Map(prev);
          if (state) {
            next.set(toolId, state);
          } else {
            next.delete(toolId);
          }
          return next;
        });
      },
    });
  }, [pageIndex, scale, annotationPlugin, services]);

  return (
    <>
      {/* Hidden DOM elements required by services */}
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Render any active previews from any tool */}
      {Array.from(previews.entries()).map(([toolId, preview]) => (
        <PreviewRenderer key={toolId} preview={preview} scale={scale} />
      ))}
    </>
  );
}
