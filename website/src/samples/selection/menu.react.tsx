import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionClipboard,
  SelectionLayer,
  SelectionMenu,
  copySelection,
  selectionPlugin,
  useSelection,
} from '@embedpdf/react/selection';
import { localEngine } from '@embedpdf/engine';

import { Button, Demo, StageFrame, stageFill } from '../stage/_shared/chrome';

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

function SelectionActions() {
  const selection = useSelection();

  const copy = () => {
    void copySelection(selection).catch(() => {
      // Show your product's clipboard error message here.
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: 6,
        border: '1px solid #e6eaf2',
        borderRadius: 12,
        background: '#fff',
        boxShadow: '0 8px 24px rgba(7, 32, 76, 0.18)',
      }}
    >
      {selection.canCopy() && <Button onClick={copy}>Copy</Button>}
      <Button onClick={() => selection.clear()}>Clear</Button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <SelectionClipboard />
          <StageFrame height={460}>
            <Stage
              interaction
              style={stageFill}
              overlay={
                <SelectionMenu>
                  <SelectionActions />
                </SelectionMenu>
              }
            >
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
