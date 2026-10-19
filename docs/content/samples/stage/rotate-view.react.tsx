import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './rotate-view.css';

const engine = localEngine();
// The pages start a quarter turn round, like a scan that came out sideways.
const plugins = [stagePlugin({ viewRotation: 90 }), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function RotateButtons() {
  const stage = useStage();
  const viewRotation = useStageState((state) => state.viewRotation);

  return (
    <div className="toolbar">
      <button type="button" className="button" onClick={() => stage.rotateViewBy(-90)}>
        ⟲ Rotate left
      </button>
      <output className="readout">{viewRotation}°</output>
      <button type="button" className="button" onClick={() => stage.rotateViewBy(90)}>
        ⟳ Rotate right
      </button>
      <button
        type="button"
        className="button"
        disabled={viewRotation === 0}
        onClick={() => stage.setViewRotation(0)}
      >
        Upright
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <RotateButtons />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
