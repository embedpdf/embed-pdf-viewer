import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { useInteraction, useInteractionState } from '@embedpdf/react/interaction';
import { RenderLayer } from '@embedpdf/react/render';
import { SelectionLayer } from '@embedpdf/react/selection';
import { Stage } from '@embedpdf/react/stage';

export const plugins = [/* your other plugins */ annotationPlugin()];

export function HighlightButton() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const on = activeToolId === 'highlight';

  return (
    <button aria-pressed={on} onClick={() => interaction.activateTool(on ? 'pointer' : 'highlight')}>
      Highlight
    </button>
  );
}

export function Pages() {
  return (
    <Stage>
      {() => (
        <>
          <RenderLayer annotations={false} />
          <SelectionLayer />
          <AnnotationLayer />
        </>
      )}
    </Stage>
  );
}
