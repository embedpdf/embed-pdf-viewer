import { FormLayer, formPlugin } from '@embedpdf/react/form';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { Viewer } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { engine } from './pdf';

const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

export function FormViewer() {
  return (
    <Viewer engine={engine} plugins={plugins}>
      <Stage>
        {() => (
          <>
            <RenderLayer />
            <FormLayer />
          </>
        )}
      </Stage>
    </Viewer>
  );
}
