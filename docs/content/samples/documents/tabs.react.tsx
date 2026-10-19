import {
  Viewer,
  DocumentGate,
  useDocument,
  useDocuments,
  useDocumentsState,
} from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './tabs.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function Tabs() {
  const documents = useDocuments();
  const { documents: open, activeId } = useDocumentsState();

  return (
    <div className="tabs" role="tablist">
      {open.map((document) => (
        <div key={document.id} className="tab" data-active={document.id === activeId}>
          <button
            type="button"
            role="tab"
            className="name"
            aria-selected={document.id === activeId}
            onClick={() => documents.setActive(document.id)}
          >
            {document.name}
          </button>
          <button
            type="button"
            className="close"
            aria-label={`Close ${document.name}`}
            onClick={() => documents.close(document.id)}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        aria-label="Open another copy"
        onClick={() => documents.open(ebook, { name: `Copy ${open.length + 1}` })}
      >
        +
      </button>
    </div>
  );
}

// The active tab: rename it, move it to the front, and zoom it. Each tab keeps its own zoom.
function TabTools() {
  const documents = useDocuments();
  const { id, name } = useDocument();
  const stage = useStage();
  const zoomLevel = useStageState((state) => state.zoomLevel);

  return (
    <div className="toolbar">
      <input
        className="field"
        aria-label="Tab name"
        value={name ?? ''}
        onChange={(event) => documents.rename(id, event.target.value)}
      />
      <button type="button" className="button" onClick={() => documents.move(id, 0)}>
        Move to front
      </button>
      <button
        type="button"
        className="button"
        aria-label="Zoom out"
        onClick={() => stage.zoomOut()}
      >
        −
      </button>
      <button type="button" className="button" aria-label="Zoom in" onClick={() => stage.zoomIn()}>
        +
      </button>
      <output className="readout">{Math.round(zoomLevel * 100)}%</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[
        { source: ebook, name: 'Contract' },
        { source: ebook, name: 'Report' },
      ]}
    >
      <Tabs />
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <TabTools />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
