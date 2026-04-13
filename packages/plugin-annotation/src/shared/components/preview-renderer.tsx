import { useMemo } from '@framework';
import { PreviewState } from '@embedpdf/plugin-annotation';
import { useRegisteredRenderers } from '../context/renderer-registry';
import { builtInRenderers } from './built-in-renderers';

interface Props {
  toolId: string;
  preview: PreviewState;
  scale: number;
}

export function PreviewRenderer({ toolId, preview, scale }: Props) {
  const { bounds } = preview;
  const registeredRenderers = useRegisteredRenderers();

  const allRenderers = useMemo(() => {
    const externalIds = new Set(registeredRenderers.map((r) => r.id));
    return [...registeredRenderers, ...builtInRenderers.filter((r) => !externalIds.has(r.id))];
  }, [registeredRenderers]);

  const style = {
    position: 'absolute' as const,
    left: bounds.origin.x * scale,
    top: bounds.origin.y * scale,
    width: bounds.size.width * scale,
    height: bounds.size.height * scale,
    pointerEvents: 'none' as const,
    zIndex: 10,
  };

  const match =
    allRenderers.find((r) => r.matchesPreview?.(preview) && r.renderPreview) ??
    allRenderers.find((r) => r.id === toolId && r.renderPreview);

  if (match?.renderPreview) {
    const containerExtra = match.previewContainerStyle?.({
      data: preview.data,
      bounds: preview.bounds,
      scale,
    });
    return (
      <div style={{ ...style, ...containerExtra }}>
        {match.renderPreview({ data: preview.data, bounds: preview.bounds, scale })}
      </div>
    );
  }

  return null;
}
