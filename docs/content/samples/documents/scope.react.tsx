import {
  Viewer,
  DocumentGate,
  DocumentScope,
  useDocument,
  useDocumentsState,
} from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './scope.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The same component in both panes: each talks to the document its <DocumentScope> names.
function Header() {
  const { name, pageCount } = useDocument();
  const stage = useStage();
  const zoomLevel = useStageState((state) => state.zoomLevel);

  return (
    <div className="header">
      <strong>{name}</strong>
      {pageCount} pages
      <button
        type="button"
        className="button"
        aria-label="Zoom out"
        onClick={() => stage.zoomOut()}
      >
        −
      </button>
      <output className="readout">{Math.round(zoomLevel * 100)}%</output>
      <button type="button" className="button" aria-label="Zoom in" onClick={() => stage.zoomIn()}>
        +
      </button>
    </div>
  );
}

function SideBySide() {
  const { documents } = useDocumentsState();
  return (
    <div className="split">
      {documents.map((document) => (
        <section key={document.id} className="pane">
          <DocumentScope id={document.id}>
            <DocumentGate fallback={<p className="loading">Opening…</p>}>
              <Header />
              <Stage className="stage">{() => <RenderLayer />}</Stage>
            </DocumentGate>
          </DocumentScope>
        </section>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[
        { source: ebook, name: 'Original' },
        { source: ebook, name: 'Revised' },
      ]}
    >
      <SideBySide />
    </Viewer>
  );
}
