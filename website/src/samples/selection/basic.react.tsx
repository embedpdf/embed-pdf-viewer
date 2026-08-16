import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { localEngine } from '@embedpdf/engine';

import { Demo, StageFrame, stageFill } from '../stage/_shared/chrome';

const engine = localEngine();
const plugins = [
  stagePlugin({ interaction: true }),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <StageFrame height={460}>
            <Stage interaction style={stageFill}>
              {() => (
                <>
                  <RenderLayer />
                  <SelectionLayer />
                </>
              )}
            </Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
