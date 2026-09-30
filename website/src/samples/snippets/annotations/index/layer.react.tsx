import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { Stage, stagePlugin } from '@embedpdf/react/stage';

export const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

export function Pages() {
  return (
    <Stage>
      {() => (
        <>
          <RenderLayer annotations={false} />
          <AnnotationLayer />
        </>
      )}
    </Stage>
  );
}
