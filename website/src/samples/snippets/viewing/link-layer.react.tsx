import { interactionPlugin } from '@embedpdf/react/interaction';
import { LinkLayer, linkPlugin } from '@embedpdf/react/link';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { Viewer } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { engine } from './pdf';

const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), linkPlugin()];

export function Reader() {
  return (
    <Viewer engine={engine} plugins={plugins}>
      <Stage>
        {() => (
          <>
            <RenderLayer />
            <LinkLayer />
          </>
        )}
      </Stage>
    </Viewer>
  );
}
