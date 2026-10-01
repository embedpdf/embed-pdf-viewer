import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './zoom.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function ZoomToolbar() {
  const stage = useStage();
  const { zoomLevel, zoomMode } = useStageState();

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
      <div className="segmented" role="group" aria-label="Fit">
        <button
          type="button"
          aria-pressed={zoomMode === 'automatic'}
          onClick={() => stage.fitAutomatic()}
        >
          Automatic
        </button>
        <button
          type="button"
          aria-pressed={zoomMode === 'fit-page'}
          onClick={() => stage.fitPage()}
        >
          Fit page
        </button>
        <button
          type="button"
          aria-pressed={zoomMode === 'fit-width'}
          onClick={() => stage.fitWidth()}
        >
          Fit width
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ZoomToolbar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
