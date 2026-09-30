import { interactionPlugin } from '@embedpdf/react/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { Stage, stagePlugin } from '@embedpdf/react/stage';

export const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

export function Pages() {
  return (
    <Stage>
      {() => (
        <>
          <RenderLayer />
          <SelectionLayer />
        </>
      )}
    </Stage>
  );
}
