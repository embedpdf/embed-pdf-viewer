import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useZoom } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './zoom.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function ZoomToolbar() {
  const { zoom, mode, zoomIn, zoomOut, fitPage, fitWidth, automatic } = useZoom();
  return (
    <div className="toolbar">
      <button type="button" className="button" aria-label="Zoom out" onClick={() => zoomOut()}>
        −
      </button>
      <output className="readout">{Math.round(zoom * 100)}%</output>
      <button type="button" className="button" aria-label="Zoom in" onClick={() => zoomIn()}>
        +
      </button>
      <div className="segmented" role="group" aria-label="Fit">
        <button type="button" aria-pressed={mode === 'automatic'} onClick={() => automatic()}>
          Automatic
        </button>
        <button type="button" aria-pressed={mode === 'fit-page'} onClick={() => fitPage()}>
          Fit page
        </button>
        <button type="button" aria-pressed={mode === 'fit-width'} onClick={() => fitWidth()}>
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
