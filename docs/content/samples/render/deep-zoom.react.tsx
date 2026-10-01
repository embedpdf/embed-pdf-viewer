import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './deep-zoom.css';

const engine = localEngine();
// Open at 250%: past what a whole-page picture shows sharply, so tiles carry it.
const plugins = [stagePlugin({ zoom: { level: 2.5 } }), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function ZoomBar() {
  const stage = useStage();
  const zoomLevel = useStageState((state) => state.zoomLevel);

  return (
    <div className="toolbar">
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
      <button type="button" className="button push" onClick={() => stage.fitWidth()}>
        Fit width
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ZoomBar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
