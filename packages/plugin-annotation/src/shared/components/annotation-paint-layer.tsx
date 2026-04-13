import { useEffect, useMemo, useRef, useState } from '@framework';
import { useAnnotationPlugin } from '../hooks';
import { PreviewState, HandlerServices } from '@embedpdf/plugin-annotation';
import { PreviewRenderer } from './preview-renderer';

interface Props {
  documentId: string;
  pageIndex: number;
  scale: number;
}

export function AnnotationPaintLayer({ documentId, pageIndex, scale }: Props) {
  const { plugin: annotationPlugin } = useAnnotationPlugin();
  const [previews, setPreviews] = useState<Map<string, PreviewState>>(new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    }),
    [],
  );

  useEffect(() => {
    if (!annotationPlugin) return;

    return annotationPlugin.registerPageHandlers(documentId, pageIndex, scale, {
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
  }, [documentId, pageIndex, scale, annotationPlugin, services]);

  return (
    <>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} />

      {/* Render any active previews from any tool */}
      {Array.from(previews.entries()).map(([toolId, preview]) => (
        <PreviewRenderer key={toolId} toolId={toolId} preview={preview} scale={scale} />
      ))}
    </>
  );
}
