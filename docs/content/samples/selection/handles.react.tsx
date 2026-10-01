import { useEffect } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionHandles,
  SelectionLayer,
  SelectionMenu,
  copySelection,
  selectionPlugin,
  useSelection,
} from '@embedpdf/react/selection';
import { localEngine } from '@embedpdf/engine';

import './handles.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function CopyButton() {
  const selection = useSelection();

  return (
    <button
      type="button"
      className="button"
      disabled={!selection.canCopy()}
      onClick={() => void copySelection(selection).catch(() => {})}
    >
      Copy
    </button>
  );
}

// A word selected on load, as a long-press selects one: "Viewers", on the cover.
function SelectWord() {
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;

  useEffect(() => {
    if (cover) selection.select({ page: cover, start: 14, count: 7 });
  }, [selection, cover]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectWord />
        <Stage
          className="stage"
          overlay={
            <>
              {/* Clear of the start handle's grip, which sits above the first line. */}
              <SelectionMenu gap={20}>
                <CopyButton />
              </SelectionMenu>
              <SelectionHandles />
            </>
          }
        >
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
