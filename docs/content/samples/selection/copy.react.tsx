import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionClipboard,
  SelectionLayer,
  copySelection,
  selectionPlugin,
  useSelection,
  useSelectionState,
} from '@embedpdf/react/selection';
import { localEngine } from '@embedpdf/engine';

import './copy.css';

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
  const hasSelection = useSelectionState((state) => state.hasSelection);
  const [status, setStatus] = useState('');

  const copy = () => {
    copySelection(selection).then(
      (text) => setStatus(`Copied ${text.length} characters`),
      // The browser can refuse the clipboard, for example in a frame that doesn't allow it.
      () => setStatus("The browser didn't allow copying"),
    );
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!hasSelection || !selection.canCopy()}
        onClick={copy}
      >
        Copy
      </button>
      <output className="readout">{status || 'Or press Ctrl+C'}</output>
    </div>
  );
}

// The selected text, read with readText() each time the selection settles.
function SelectedText() {
  const selection = useSelection();
  const { range, isSelecting } = useSelectionState();
  const [text, setText] = useState('');

  useEffect(() => {
    if (isSelecting || !selection.canCopy()) return;
    // A newer selection cancels a read that hasn't finished.
    const controller = new AbortController();
    selection.readText({ signal: controller.signal }).then(setText, () => {});
    return () => controller.abort();
  }, [selection, range, isSelecting]);

  return <p className="preview">{text || 'Select some text to read it here.'}</p>;
}

// Something selected on load: the title on the cover.
function SelectTitle() {
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;

  useEffect(() => {
    if (cover) selection.select({ page: cover, start: 10, count: 52 });
  }, [selection, cover]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectTitle />
        <SelectionClipboard />
        <CopyButton />
        <SelectedText />
        <Stage className="stage">
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
